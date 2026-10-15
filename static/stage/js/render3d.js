// render3d.js — シネマティック描画パイプライン
//
// Ray-MMD(MMD向けの物理ベースレンダリング拡張, MIT / (C) 2016-2018 Rui)が
// DX9 HLSLで提供している機能のうち、WebGLで再現できるものを three.js r170 上に
// 実装したもの。.fx はそのままでは動かないため、機能単位で作り直している。
//
//  - HDRリニア合成 + ACESフィルミックトーンマッピング + 露出
//  - IBL(環境マップをPMREMで畳み込み。外部HDRI不要のプロシージャル空)
//  - ソフトシャドウ(PCFSoft)+ 影だけを落とす床
//  - ブルーム(UnrealBloomPass)
//  - MSAA(レンダーターゲットのsamples)
//  - フォトリアルモード(MToon → MeshPhysicalMaterial 変換)
//
// **背景の透過を維持する**のが要件(OBS配信で背景を抜くため)。three標準の
// OutputPass はアルファを潰すので、露出/トーンマップ/sRGB変換を行いつつ
// アルファをそのまま通す最終合成パスを自前で持つ。

import * as THREE from 'three';
import { EffectComposer } from '../vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from '../vendor/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from '../vendor/jsm/postprocessing/UnrealBloomPass.js';

/** スタジオ/OBSで共有する描画プリセット */
export const RENDER_PRESETS = {
  standard:  { label: '標準',         tone: false, exposure: 1.00, bloom: 0.00, threshold: 1.15, shadow: false, ibl: 0.0,  pbr: false },
  cinema:    { label: 'シネマ',       tone: true,  exposure: 1.00, bloom: 0.35, threshold: 1.15, shadow: true,  ibl: 0.45, pbr: false },
  photoreal: { label: 'フォトリアル', tone: true,  exposure: 1.05, bloom: 0.25, threshold: 1.05, shadow: true,  ibl: 1.0,  pbr: true },
};
export const DEFAULT_RENDER = { preset: 'standard', ...RENDER_PRESETS.standard };

// アルファを保持したままACESトーンマップとsRGB変換を行う最終パス
const OutputAlphaShader = {
  name: 'OutputAlphaShader',
  uniforms: {
    tDiffuse: { value: null },
    exposure: { value: 1.0 },
    useTone: { value: 1 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float exposure;
    uniform int useTone;
    varying vec2 vUv;

    // ACESフィルミック (three.js の ACESFilmicToneMapping と同じ近似)
    vec3 RRTAndODTFit(vec3 v) {
      vec3 a = v * (v + 0.0245786) - 0.000090537;
      vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
      return a / b;
    }
    vec3 acesFilmic(vec3 color) {
      const mat3 IN = mat3(0.59719, 0.07600, 0.02840,
                           0.35458, 0.90834, 0.13383,
                           0.04823, 0.01566, 0.83777);
      const mat3 OUT = mat3( 1.60475, -0.10208, -0.00327,
                            -0.53108,  1.10813, -0.07276,
                            -0.07367, -0.00605,  1.07602);
      color = IN * color;
      color = RRTAndODTFit(color);
      color = OUT * color;
      return clamp(color, 0.0, 1.0);
    }
    vec3 lin2srgb(vec3 c) {
      return mix(pow(c, vec3(0.41666667)) * 1.055 - 0.055, c * 12.92,
                 vec3(lessThanEqual(c, vec3(0.0031308))));
    }
    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 c = tex.rgb * exposure;
      if (useTone == 1) c = acesFilmic(c / 0.6);
      else c = clamp(c, 0.0, 1.0);
      // アルファは一切いじらず素通しする(OBSの背景抜きを壊さないため)
      gl_FragColor = vec4(lin2srgb(c), clamp(tex.a, 0.0, 1.0));
    }
  `,
};

export class CinemaPipeline {
  /** @param {{renderer:THREE.WebGLRenderer, scene:THREE.Scene, camera:THREE.Camera}} viewer */
  constructor(viewer) {
    this.viewer = viewer;
    this.opts = { ...DEFAULT_RENDER };
    this.enabled = false;
    this._composer = null;
    this._floor = null;
    this._envRT = null;
    this._pbrCache = new Map();     // MToonマテリアル → 変換後PBRマテリアル
    this._baseAmbient = null;
    this._size = new THREE.Vector2();
  }

  _build() {
    const { renderer, scene, camera } = this.viewer;
    renderer.getSize(this._size);
    const w = Math.max(1, Math.floor(this._size.x));
    const h = Math.max(1, Math.floor(this._size.y));
    const pr = renderer.getPixelRatio();
    // HDR(HalfFloat)+アルファ付き+MSAA。リニア空間で保持し最終パスで変換する
    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      colorSpace: THREE.LinearSRGBColorSpace,
      samples: 4,
    });
    const composer = new EffectComposer(renderer, rt);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);

    const rp = new RenderPass(scene, camera);
    rp.clearAlpha = 0;                          // 背景は透過のまま
    composer.addPass(rp);

    this._bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.0, 0.65, 0.9);
    // UnrealBloomPassの合成はCopyShader(アルファ1固定)を加算するため、そのままだと
    // 背景のアルファが1になり透過が壊れる。輝度ぶんだけアルファを足す式に差し替える
    // (透過背景でも発光が見え、かつ何も無い所は透明のまま残る)。
    const bm = this._bloom.blendMaterial;
    bm.fragmentShader = /* glsl */`
      uniform float opacity;
      uniform sampler2D tDiffuse;
      varying vec2 vUv;
      void main() {
        vec3 c = opacity * texture2D(tDiffuse, vUv).rgb;
        float a = clamp(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
        gl_FragColor = vec4(c, a);
      }`;
    bm.needsUpdate = true;
    composer.addPass(this._bloom);

    this._output = new ShaderPass(OutputAlphaShader);
    this._output.renderToScreen = true;
    this._output.material.transparent = true;
    this._output.material.blending = THREE.NoBlending;
    composer.addPass(this._output);

    this._composer = composer;
  }

  /** プロシージャル環境(空+地面+ソフトな面光源)をPMREMで環境マップ化 */
  _buildEnv() {
    if (this._envRT) return this._envRT.texture;
    const { renderer } = this.viewer;
    const env = new THREE.Scene();
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(12, 32, 16),
      new THREE.MeshBasicMaterial({ color: 0xa9c4ea, side: THREE.BackSide }));
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(12, 32),
      new THREE.MeshBasicMaterial({ color: 0x4a4438, side: THREE.DoubleSide }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.2;
    const key = new THREE.Mesh(
      new THREE.PlaneGeometry(7, 7),
      new THREE.MeshBasicMaterial({ color: 0xfff2e2 }));
    key.position.set(3.2, 5.2, 3.2);
    key.lookAt(0, 0, 0);
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 6),
      new THREE.MeshBasicMaterial({ color: 0x9fb6e8 }));
    fill.position.set(-4.5, 1.6, -3.2);
    fill.lookAt(0, 0, 0);
    env.add(sky, ground, key, fill);
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    this._envRT = pmrem.fromScene(env, 0.03);
    pmrem.dispose();
    env.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    return this._envRT.texture;
  }

  /** 影を受けるだけの床(色は出さず影のみ = 透過背景を壊さない) */
  _ensureFloor(on) {
    const { scene } = this.viewer;
    if (on && !this._floor) {
      const f = new THREE.Mesh(
        new THREE.PlaneGeometry(8, 8),
        new THREE.ShadowMaterial({ opacity: 0.34, transparent: true }));
      f.rotation.x = -Math.PI / 2;
      f.receiveShadow = true;
      f.renderOrder = -1;
      scene.add(f);
      this._floor = f;
    }
    if (this._floor) this._floor.visible = !!on;
  }

  _applyShadow(on) {
    const { renderer, scene } = this.viewer;
    renderer.shadowMap.enabled = !!on;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const key = scene.children.find((o) => o.isDirectionalLight);
    if (key) {
      key.castShadow = !!on;
      if (on && !key.userData._shadowTuned) {
        key.shadow.mapSize.set(2048, 2048);
        const c = key.shadow.camera;
        c.near = 0.2; c.far = 9;
        c.left = -1.4; c.right = 1.4; c.top = 2.3; c.bottom = -0.4;
        c.updateProjectionMatrix();
        key.shadow.bias = -0.0012;
        key.shadow.normalBias = 0.02;
        key.shadow.radius = 3;
        key.userData._shadowTuned = true;
      }
    }
    const vrm = this.viewer.vrm;
    vrm?.scene.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) { o.castShadow = !!on; o.receiveShadow = !!on; }
    });
    this._ensureFloor(on);
  }

  /** MToon(セル) ↔ MeshPhysicalMaterial(PBR) の切り替え */
  _applyMaterialMode(pbr) {
    const vrm = this.viewer.vrm;
    if (!vrm) return;
    vrm.scene.traverse((o) => {
      if (!o.isMesh && !o.isSkinnedMesh) return;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      const next = list.map((m) => {
        if (!m) return m;
        if (pbr) {
          if (m.userData?._isPbrProxy) return m;
          let p = this._pbrCache.get(m);
          if (!p) {
            p = new THREE.MeshPhysicalMaterial({
              map: m.map ?? null,
              normalMap: m.normalMap ?? null,
              emissiveMap: m.emissiveMap ?? null,
              emissive: m.emissive ? m.emissive.clone() : new THREE.Color(0x000000),
              emissiveIntensity: 0.85,
              color: m.color ? m.color.clone() : new THREE.Color(0xffffff),
              transparent: m.transparent,
              opacity: m.opacity ?? 1,
              alphaTest: m.alphaTest ?? 0,
              side: m.side,
              roughness: 0.68,
              metalness: 0.0,
              sheen: 0.35,
              sheenRoughness: 0.8,
              envMapIntensity: 1.0,
            });
            p.userData._isPbrProxy = true;
            p.userData._origin = m;
            this._pbrCache.set(m, p);
          }
          return p;
        }
        return m.userData?._isPbrProxy ? m.userData._origin : m;
      });
      o.material = Array.isArray(o.material) ? next : next[0];
    });
  }

  /** 描画設定を適用する。opts は RENDER_PRESETS のいずれか + 個別上書き */
  apply(opts) {
    const base = opts?.preset && RENDER_PRESETS[opts.preset]
      ? { preset: opts.preset, ...RENDER_PRESETS[opts.preset] } : this.opts;
    const o = { ...base, ...opts };
    this.opts = o;
    const { renderer, scene } = this.viewer;
    const active = !!(o.tone || o.bloom > 0 || o.shadow || o.ibl > 0 || o.pbr);
    if (active && !this._composer) this._build();
    this.enabled = active;

    // トーンマッピングは最終パスで行うため、素材側では掛けない
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1;
    if (this._output) {
      this._output.uniforms.exposure.value = o.exposure ?? 1;
      this._output.uniforms.useTone.value = o.tone ? 1 : 0;
    }
    if (this._bloom) {
      this._bloom.strength = o.bloom ?? 0;
      this._bloom.enabled = (o.bloom ?? 0) > 0.001;
      // MToonは元から明るいため、しきい値を1超に置かないと肌まで発光して白飛びする
      this._bloom.threshold = o.threshold ?? 1.15;
      this._bloom.radius = 0.5;
    }
    // IBL: PBRには環境マップ、MToonには環境光として効かせる
    scene.environment = o.ibl > 0 ? this._buildEnv() : null;
    scene.environmentIntensity = o.ibl ?? 0;
    const amb = scene.children.find((x) => x.isAmbientLight);
    if (amb) {
      if (this._baseAmbient == null) this._baseAmbient = amb.intensity;
      amb.intensity = this._baseAmbient * (1 - 0.35 * Math.min(1, o.ibl ?? 0));
    }
    this._applyShadow(o.shadow);
    this._applyMaterialMode(o.pbr);
    return this.opts;
  }

  /** VRMを差し替えた後に呼ぶ(影フラグとマテリアルを貼り直す) */
  refresh() {
    if (!this.enabled) return;
    this._applyShadow(this.opts.shadow);
    this._applyMaterialMode(this.opts.pbr);
  }

  setSize(w, h) {
    if (!this._composer) return;
    this._composer.setPixelRatio(this.viewer.renderer.getPixelRatio());
    this._composer.setSize(w, h);
    this._bloom?.setSize(w, h);
  }

  render() {
    if (!this.enabled || !this._composer) return false;
    this._composer.render();
    return true;
  }

  dispose() {
    this._composer?.renderTarget1?.dispose();
    this._composer?.renderTarget2?.dispose();
    this._bloom?.dispose?.();
    this._envRT?.dispose();
    for (const p of this._pbrCache.values()) p.dispose();
    this._pbrCache.clear();
    if (this._floor) {
      this._floor.geometry.dispose();
      this._floor.material.dispose();
      this.viewer.scene.remove(this._floor);
      this._floor = null;
    }
  }
}
