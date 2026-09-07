// stage3d.js — VRM Atelierステージエンジンの LyricFlow 組み込みラッパー
//
// 3Dダンスレイヤー: VRMアバター + MMD(VMD)モーションを透過WebGLキャンバスに
// 決定論レンダリングする。FXEngine が毎フレーム renderAt(t) を呼び、結果の
// canvas を 2D 合成する。プレビューと書き出しが同一経路。
//
// 依存はESモジュール(/stage/vendor)のみ。クラシックスクリプト側へは
// window.Stage3D として公開する。エンジン本体(mmd.js)のマスターは
// vrm-avatar-platform 側 (sync_stage.sh で同期)。

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { VMDPlayer } from './js/mmd.js';

class DanceStage {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512; this.canvas.height = 680;
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, alpha: true, antialias: true, preserveDrawingBuffer: true,
    });
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(28, 512 / 680, 0.1, 60);
    this._resetCamera();
    const amb = new THREE.AmbientLight(0xffffff, 1.1);
    const key = new THREE.DirectionalLight(0xfff4ea, 1.7);
    key.position.set(1.2, 2.4, 2.2);
    const rim = new THREE.DirectionalLight(0xdfe8ff, 0.9);
    rim.position.set(-1.6, 1.4, -1.8);
    this.scene.add(amb, key, rim);
    this.vrm = null;
    this.player = null;
    this.vrmUrl = null;
    this.vmdUrl = null;
    this._lastT = null;
    this._loadingVrm = null;
    this._loadingVmd = null;
  }

  _resetCamera() {
    // 足元がキャンバス下端に来るようフレーミングする。以前は 0.15m〜1.69m しか
    // 映しておらず足首から下が切れていたため、合成側の接地アンカー(by)が
    // 実際の足元とズレ、縦位置スライダーを最大にしても収まらなかった。
    // fov28 / 距離3.85 → 縦の可視範囲 ≈ 0.00m〜1.92m。
    this.camera.fov = 28;
    this.camera.position.set(0, 0.96, 3.85);
    this.camera.lookAt(0, 0.96, 0);
    this.camera.updateProjectionMatrix();
  }

  setSize(w, h) {
    w = Math.max(64, Math.round(w)); h = Math.max(64, Math.round(h));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }

  loadVRM(url) {
    if (this.vrmUrl === url && this._loadingVrm) return this._loadingVrm;
    // 失敗直後の再試行を間引く(描画ループから毎フレーム呼ばれるため)
    if (this._vrmFail === url && performance.now() < this._vrmRetryAt) {
      return Promise.reject(new Error('retry cooldown'));
    }
    this.vrmUrl = url;
    this._loadingVrm = (async () => {
      const loader = new GLTFLoader();
      loader.register((p) => new VRMLoaderPlugin(p));
      const gltf = await loader.loadAsync(url);
      const vrm = gltf.userData.vrm;
      if (!vrm) throw new Error('VRMではありません');
      if (this.vrm) { this.scene.remove(this.vrm.scene); VRMUtils.deepDispose(this.vrm.scene); }
      VRMUtils.rotateVRM0(vrm);
      this.scene.add(vrm.scene);
      this.vrm = vrm;
      if (this.player) this.player.attach(vrm);
      this._vrmFail = null;
      return vrm;
    })().catch((e) => {
      // 失敗したURLを保持したままだと `vrmUrl !== d.vrm_url` が成立せず
      // 二度と再読込されない(VRM Atelier起動前に掴んだ502で「モデルが出ない」が
      // 固定化していた)。状態を巻き戻して次のフレームで再試行できるようにする。
      this.vrmUrl = null; this._loadingVrm = null;
      this._vrmFail = url; this._vrmRetryAt = performance.now() + 2500;
      this.lastError = e;
      console.warn('[Stage3D] VRMの読み込みに失敗、2.5秒後に再試行します:', e.message);
      throw e;
    });
    return this._loadingVrm;
  }

  loadVMD(url) {
    if (this.vmdUrl === url && this._loadingVmd) return this._loadingVmd;
    if (this._vmdFail === url && performance.now() < this._vmdRetryAt) {
      return Promise.reject(new Error('retry cooldown'));
    }
    this.vmdUrl = url;
    this._loadingVmd = (async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      this.player = VMDPlayer.parse(await res.arrayBuffer());
      if (this.vrm) this.player.attach(this.vrm);
      this._vmdFail = null;
      return this.player;
    })().catch((e) => {
      this.vmdUrl = null; this._loadingVmd = null;
      this._vmdFail = url; this._vmdRetryAt = performance.now() + 2500;
      this.lastError = e;
      console.warn('[Stage3D] VMDの読み込みに失敗、2.5秒後に再試行します:', e.message);
      throw e;
    });
    return this._loadingVmd;
  }

  get ready() { return !!this.vrm; }

  /** 決定論的な自動まばたき (tの純関数) */
  _autoBlink(t) {
    const em = this.vrm?.expressionManager;
    if (!em) return;
    const cyc = t % 3.7;
    const v = cyc < 0.14 ? 1 - Math.abs(cyc / 0.07 - 1) : 0;
    em.setValue('blink', Math.min(1, v * 1.3));
  }

  /**
   * プロジェクト時刻 t のフレームを描画。
   * opts: {offset, loop, camera, speed}
   * 戻り値: 描画できたら true
   */
  renderAt(t, opts = {}) {
    if (!this.vrm) return false;
    const h = this.vrm.humanoid;
    if (this.player) {
      const local = Math.max(0, (t - (opts.offset || 0)) * (opts.speed || 1));
      const dur = Math.max(this.player.duration, 0.001);
      this.player.t = opts.loop === false ? Math.min(local, dur) : local % dur;
      this.player.apply(this.vrm);
      if (!this.player.hasMorphs) this._autoBlink(t);
      if (opts.camera && this.player.hasCamera) this.player.applyCamera(this.camera);
      else if (this._camWasVmd) this._resetCamera();
      this._camWasVmd = !!(opts.camera && this.player.hasCamera);
    } else if (h) {
      // モーション未設定: A-poseで立たせる + まばたき
      const sign = this.vrm.meta?.metaVersion === '1' ? -1 : 1;
      for (const side of ['left', 'right']) {
        const ua = h.getNormalizedBoneNode(side + 'UpperArm');
        if (ua) ua.rotation.z = (side === 'left' ? 1 : -1) * sign * (Math.PI / 2 - 0.42);
      }
      this._autoBlink(t);
    }
    // SpringBone(揺れもの): 順次レンダ前提。シーク/初回は既定Δtで安定化
    let dt = this._lastT == null ? 1 / 30 : t - this._lastT;
    if (!(dt > 0) || dt > 0.25) dt = 1 / 30;
    this._lastT = t;
    this.vrm.update(dt);
    this.renderer.render(this.scene, this.camera);
    return true;
  }

  /** 書き出し前ウォームアップ: 揺れものを整定させ、時計をリセット */
  warmup(t0 = 0, frames = 20) {
    this._lastT = null;
    for (let i = 0; i < frames; i++) this.renderAt(t0 + (i - frames) / 30, { offset: 0 });
    this._lastT = null;
  }

  resetClock() { this._lastT = null; }

  dispose() {
    if (this.vrm) VRMUtils.deepDispose(this.vrm.scene);
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
  }
}

window.Stage3D = {
  create: () => new DanceStage(),
  VMDPlayer,
  // ステージ高に対する標準的なVRMの身長比(可視1.92mに対し身長約1.55m)。
  // 合成側はこれで割って「大きさ=画面高に対するキャラの高さ」を保つ。
  CHAR_FRAC: 0.81,
};
document.dispatchEvent(new Event('stage3d-ready'));
