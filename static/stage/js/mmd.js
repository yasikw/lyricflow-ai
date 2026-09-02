// mmd.js — MMD VMDモーション → VRMリターゲット再生エンジン
//
// - VMD(ボーン/モーフ)を mmdparser で解析し、VRMヒューマノイド(正規化ボーン)へ
//   リターゲットして再生する
// - MMDはA-pose基準・VRM正規化リグはT-pose基準のため、腕チェーンに定数オフセット
//   回転を挟む (腕: q⊗r / ひじ・手首: r⁻¹⊗q⊗r)
// - 脚はMMDダンスモーションの主流である足IKボーンを2ボーンIKで解決
// - モーフ(まばたき/あいうえお/笑い等)はVRM標準表情へマッピング
// - キー補間は線形/slerp (MMDのベジェ補間は未対応: ダンス用VMDは高密度キーが
//   多いため実用上ほぼ差が出ない)

import * as THREE from 'three';
import { MMDParser } from '../vendor/jsm/libs/mmdparser.module.js';

const MMD_UNIT_HIPS = 8.0;   // 標準的なMMDモデルのセンター高さ(MMD単位)
const ARM_OFFSET_DEG = 37;   // A-pose⇔T-poseの腕角度差

// MMDボーン名 → VRMヒューマノイドボーン (直接回転コピー系)
const DIRECT_BONES = [
  ['上半身', 'spine'],
  ['上半身2', 'chest'],
  ['首', 'neck'],
  ['頭', 'head'],
  ['左肩', 'leftShoulder'],
  ['右肩', 'rightShoulder'],
];
const ARM_BONES = [
  // [mmd名, vrm名, side(+1=左), chain位置(0=腕,1=ひじ以降)]
  ['左腕', 'leftUpperArm', 1, 0],
  ['左ひじ', 'leftLowerArm', 1, 1],
  ['左手首', 'leftHand', 1, 1],
  ['右腕', 'rightUpperArm', -1, 0],
  ['右ひじ', 'rightLowerArm', -1, 1],
  ['右手首', 'rightHand', -1, 1],
];
const FK_LEG_BONES = [
  ['左足', 'leftUpperLeg'], ['左ひざ', 'leftLowerLeg'], ['左足首', 'leftFoot'],
  ['右足', 'rightUpperLeg'], ['右ひざ', 'rightLowerLeg'], ['右足首', 'rightFoot'],
];
// VMDモーフ名 → VRM表情
const MORPH_MAP = {
  'まばたき': 'blink', 'ウィンク': 'blinkLeft', 'ウィンク右': 'blinkRight',
  'ウィンク2': 'blinkLeft', 'ウィンク2右': 'blinkRight',
  'あ': 'aa', 'い': 'ih', 'う': 'ou', 'え': 'ee', 'お': 'oh',
  '笑い': 'happy', 'にこり': 'happy', 'にやり': 'relaxed',
  '困る': 'sad', '怒り': 'angry', '真面目': 'angry',
};

const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

class Track {
  constructor() { this.times = []; this.pos = []; this.rot = []; this.cursor = 0; }

  finalize() {
    // frameNum昇順ソート(同時挿入順を保持)
    const idx = this.times.map((t, i) => i).sort((a, b) => this.times[a] - this.times[b]);
    this.times = idx.map((i) => this.times[i]);
    if (this.pos.length) this.pos = idx.map((i) => this.pos[i]);
    if (this.rot.length) this.rot = idx.map((i) => this.rot[i]);
  }

  _seek(t) {
    const n = this.times.length;
    if (this.cursor >= n) this.cursor = n - 1;
    while (this.cursor > 0 && this.times[this.cursor] > t) this.cursor--;
    while (this.cursor < n - 1 && this.times[this.cursor + 1] <= t) this.cursor++;
    return this.cursor;
  }

  samplePos(t, out) {
    if (!this.pos.length) return out.set(0, 0, 0);
    const i = this._seek(t);
    const a = this.pos[i];
    if (i >= this.times.length - 1 || this.times[i] > t) return out.set(a[0], a[1], a[2]);
    const b = this.pos[i + 1];
    const w = (t - this.times[i]) / (this.times[i + 1] - this.times[i] || 1);
    return out.set(a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w);
  }

  sampleRot(t, out) {
    if (!this.rot.length) return out.identity();
    const i = this._seek(t);
    const a = this.rot[i];
    out.set(a[0], a[1], a[2], a[3]);
    if (i >= this.times.length - 1 || this.times[i] > t) return out;
    const b = this.rot[i + 1];
    const w = (t - this.times[i]) / (this.times[i + 1] - this.times[i] || 1);
    return out.slerp(_q3.set(b[0], b[1], b[2], b[3]), w);
  }

  sampleValue(t) {   // morph用(posのx成分を流用)
    if (!this.pos.length) return 0;
    const i = this._seek(t);
    const a = this.pos[i][0];
    if (i >= this.times.length - 1 || this.times[i] > t) return a;
    const b = this.pos[i + 1][0];
    const w = (t - this.times[i]) / (this.times[i + 1] - this.times[i] || 1);
    return a + (b - a) * w;
  }
}

export class VMDPlayer {
  static parse(arrayBuffer) {
    const vmd = new MMDParser.Parser().parseVmd(arrayBuffer, true);
    return new VMDPlayer(vmd);
  }

  constructor(vmd) {
    this.bones = new Map();
    this.morphs = new Map();
    this.duration = 0;
    for (const m of vmd.motions) {
      let tr = this.bones.get(m.boneName);
      if (!tr) { tr = new Track(); this.bones.set(m.boneName, tr); }
      const t = m.frameNum / 30;
      tr.times.push(t);
      tr.pos.push([m.position[0], m.position[1], m.position[2]]);
      tr.rot.push([m.rotation[0], m.rotation[1], m.rotation[2], m.rotation[3]]);
      if (t > this.duration) this.duration = t;
    }
    for (const m of vmd.morphs) {
      let tr = this.morphs.get(m.morphName);
      if (!tr) { tr = new Track(); this.morphs.set(m.morphName, tr); }
      const t = m.frameNum / 30;
      tr.times.push(t);
      tr.pos.push([m.weight, 0, 0]);
      if (t > this.duration) this.duration = t;
    }
    for (const tr of this.bones.values()) tr.finalize();
    for (const tr of this.morphs.values()) tr.finalize();

    // カメラモーション (VMDカメラ配布データ / カメラ入りモーション)
    this.camera = null;
    if (vmd.cameras && vmd.cameras.length) {
      const cams = [...vmd.cameras].sort((a, b) => a.frameNum - b.frameNum);
      this.camera = {
        times: cams.map((c) => c.frameNum / 30),
        center: cams.map((c) => [c.position[0], c.position[1], c.position[2]]),
        euler: cams.map((c) => [c.rotation[0], c.rotation[1], c.rotation[2]]),
        dist: cams.map((c) => c.distance),
        fov: cams.map((c) => c.fov),
        cursor: 0,
      };
      const last = this.camera.times[this.camera.times.length - 1];
      if (last > this.duration) this.duration = last;
    }

    this.hasMorphs = [...this.morphs.keys()].some((k) => MORPH_MAP[k]);
    this.usesLegIK = this.bones.has('左足ＩＫ') || this.bones.has('左足IK') ||
                     this.bones.has('右足ＩＫ') || this.bones.has('右足IK');
    this.tookHead = this.bones.has('頭');

    // 再生状態
    this.playing = false;
    this.loop = true;
    this.speed = 1.0;
    this.t = 0;
    this.armOffsetDeg = ARM_OFFSET_DEG;
    this._rig = null;
  }

  _ikTrack(side) {
    return this.bones.get(side + '足ＩＫ') || this.bones.get(side + '足IK') || null;
  }

  /** VRMのリグ情報(レスト姿勢)を採取。VRM切替時に呼び直す。 */
  attach(vrm) {
    const h = vrm.humanoid;
    const get = (n) => h.getNormalizedBoneNode(n);
    const hips = get('hips');
    if (!hips) { this._rig = null; return; }
    const root = hips.parent;
    root?.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4();
    if (root) inv.copy(root.matrixWorld).invert();
    const world = (node, out) => {
      out.setFromMatrixPosition(node.matrixWorld);
      return root ? out.applyMatrix4(inv) : out;
    };
    const rig = {
      hips,
      hipsRest: hips.position.clone(),
      armSign: vrm.meta?.metaVersion === '1' ? -1 : 1,
      legs: {},
    };
    rig.posScale = Math.max(0.02, rig.hipsRest.y || 0.7) / MMD_UNIT_HIPS;
    for (const side of ['left', 'right']) {
      const u = get(side + 'UpperLeg'), k = get(side + 'LowerLeg'), f = get(side + 'Foot');
      if (!u || !k || !f) continue;
      const pu = world(u, new THREE.Vector3());
      const pk = world(k, new THREE.Vector3());
      const pf = world(f, new THREE.Vector3());
      rig.legs[side] = {
        upper: u, lower: k, foot: f,
        restUpper: pu, restAnkle: pf,
        l1: pu.distanceTo(pk), l2: pk.distanceTo(pf),
      };
    }
    rig.hipsRestWorld = world(hips, new THREE.Vector3());
    this._rig = rig;
    this._vrm = vrm;
  }

  play() { this.playing = true; if (this.t >= this.duration) this.t = 0; }
  stop() { this.playing = false; }

  update(dt) {
    if (!this.playing) return;
    this.t += dt * this.speed;
    if (this.t > this.duration) {
      if (this.loop) this.t %= Math.max(this.duration, 0.001);
      else { this.t = this.duration; this.playing = false; }
    }
  }

  /** 現在時刻のポーズをVRMへ適用。毎フレーム呼ぶ。 */
  apply(vrm) {
    if (this._vrm !== vrm || !this._rig) this.attach(vrm);
    const rig = this._rig;
    if (!rig) return;
    const h = vrm.humanoid;
    const t = this.t;
    const s = rig.posScale;

    // --- センター/グルーブ → hips位置、センター×下半身 → hips回転
    const hips = rig.hips;
    hips.position.copy(rig.hipsRest);
    const center = this.bones.get('センター');
    if (center) {
      center.samplePos(t, _v1);
      hips.position.x += _v1.x * s;
      hips.position.y += _v1.y * s;
      hips.position.z += _v1.z * s;
    }
    const groove = this.bones.get('グルーブ');
    if (groove) {
      groove.samplePos(t, _v1);
      hips.position.y += _v1.y * s;
    }
    hips.quaternion.identity();
    if (center) hips.quaternion.multiply(center.sampleRot(t, _q1));
    const lower = this.bones.get('下半身');
    if (lower) hips.quaternion.multiply(lower.sampleRot(t, _q1));

    // --- 直接コピー系(上半身/首/頭/肩)
    for (const [mmdName, vrmName] of DIRECT_BONES) {
      const tr = this.bones.get(mmdName);
      const node = h.getNormalizedBoneNode(vrmName);
      if (!tr || !node) continue;
      node.quaternion.copy(tr.sampleRot(t, _q1));
    }
    // 肩ボーンが無いモデル: 肩回転を腕へ折り込むため保持
    const shoulderQ = { 1: null, '-1': null };
    if (!h.getNormalizedBoneNode('leftShoulder')) {
      const ls = this.bones.get('左肩'), rs = this.bones.get('右肩');
      if (ls) shoulderQ[1] = ls.sampleRot(t, new THREE.Quaternion());
      if (rs) shoulderQ[-1] = rs.sampleRot(t, new THREE.Quaternion());
    }

    // --- 腕チェーン (A-pose補正: 腕 q⊗r / 以降 r⁻¹⊗q⊗r)
    for (const [mmdName, vrmName, side, pos] of ARM_BONES) {
      const tr = this.bones.get(mmdName);
      const node = h.getNormalizedBoneNode(vrmName);
      if (!node) continue;
      const theta = side * rig.armSign * THREE.MathUtils.degToRad(this.armOffsetDeg);
      _q2.setFromAxisAngle(_v1.set(0, 0, 1), theta);           // r
      const q = tr ? tr.sampleRot(t, _q1) : _q1.identity();
      if (pos === 0) {
        if (shoulderQ[side]) q.premultiply(shoulderQ[side]);   // 肩折込み
        node.quaternion.copy(q).multiply(_q2);                 // q⊗r
      } else {
        node.quaternion.copy(_q2).invert().multiply(q).multiply(_q2);  // r⁻¹⊗q⊗r
      }
    }

    // --- 脚: 足IKがあれば2ボーンIK、無ければFK
    if (this.usesLegIK) {
      for (const [side, jp] of [['left', '左'], ['right', '右']]) {
        const leg = rig.legs[side];
        const ik = this._ikTrack(jp);
        if (!leg || !ik) continue;
        this._solveLeg(leg, ik, hips, rig, t);
      }
    } else {
      for (const [mmdName, vrmName] of FK_LEG_BONES) {
        const tr = this.bones.get(mmdName);
        const node = h.getNormalizedBoneNode(vrmName);
        if (tr && node) node.quaternion.copy(tr.sampleRot(t, _q1));
      }
    }

    // --- モーフ → VRM表情
    const em = vrm.expressionManager;
    if (em) {
      for (const [mmdName, tr] of this.morphs) {
        const expr = MORPH_MAP[mmdName];
        if (!expr) continue;
        em.setValue(expr, Math.max(0, Math.min(1, tr.sampleValue(t))));
      }
    }
  }

  /** 2ボーンIK: hips空間で足首をIK目標へ。ひざは前方(+Z)へ曲げる。 */
  _solveLeg(leg, ik, hips, rig, t) {
    ik.samplePos(t, _v1).multiplyScalar(rig.posScale);          // IKオフセット(root空間)
    const target = _v1.add(leg.restAnkle);
    // 股関節のroot空間位置 = hips平行移動+回転を適用
    const hipDelta = _v2.copy(leg.restUpper).sub(rig.hipsRestWorld);
    const joint = _v3.copy(hips.position).sub(rig.hipsRest).add(rig.hipsRestWorld)
      .add(hipDelta.applyQuaternion(hips.quaternion));
    const d = target.sub(joint);                                 // 股関節→目標
    d.applyQuaternion(_q1.copy(hips.quaternion).invert());       // hips空間へ
    const len = Math.min(Math.max(d.length(), Math.abs(leg.l1 - leg.l2) + 1e-4),
                         leg.l1 + leg.l2 - 1e-4);
    d.normalize();
    // 目標方向へ向ける回転(レスト脚方向 = 真下)
    const aim = _q1.setFromUnitVectors(_v2.set(0, -1, 0), d);
    // 股関節の追加屈曲(余弦定理)・ひざは+X軸ヒンジで前へ
    const a1 = Math.acos(Math.min(1, Math.max(-1,
      (leg.l1 * leg.l1 + len * len - leg.l2 * leg.l2) / (2 * leg.l1 * len))));
    const beta = Math.acos(Math.min(1, Math.max(-1,
      (leg.l1 * leg.l1 + leg.l2 * leg.l2 - len * len) / (2 * leg.l1 * leg.l2))));
    leg.upper.quaternion.copy(aim)
      .multiply(_q2.setFromAxisAngle(_v2.set(1, 0, 0), -a1));
    leg.lower.quaternion.setFromAxisAngle(_v2.set(1, 0, 0), Math.PI - beta);
    // 足首: IK回転をroot空間の目標向きとして適用(未指定なら水平維持)
    const chain = _q2.copy(hips.quaternion).multiply(leg.upper.quaternion)
      .multiply(leg.lower.quaternion);
    leg.foot.quaternion.copy(chain.invert()).multiply(ik.sampleRot(t, _q3));
  }

  get hasCamera() { return !!this.camera; }

  /** VMDカメラを three カメラへ適用 (MMD: 注視点+距離+回転) */
  applyCamera(camera) {
    const c = this.camera;
    if (!c) return false;
    const s = this._rig?.posScale ?? 0.1;
    const t = this.t;
    // seek
    const n = c.times.length;
    if (c.cursor >= n) c.cursor = n - 1;
    while (c.cursor > 0 && c.times[c.cursor] > t) c.cursor--;
    while (c.cursor < n - 1 && c.times[c.cursor + 1] <= t) c.cursor++;
    const i = c.cursor;
    let w = 0;
    if (i < n - 1 && c.times[i] <= t) {
      w = (t - c.times[i]) / (c.times[i + 1] - c.times[i] || 1);
    }
    const j = Math.min(i + 1, n - 1);
    const L = (a, b) => a + (b - a) * w;
    const center = _v1.set(L(c.center[i][0], c.center[j][0]),
                           L(c.center[i][1], c.center[j][1]),
                           L(c.center[i][2], c.center[j][2])).multiplyScalar(s);
    const ex = L(c.euler[i][0], c.euler[j][0]);
    const ey = L(c.euler[i][1], c.euler[j][1]);
    const ez = L(c.euler[i][2], c.euler[j][2]);
    const dist = L(c.dist[i], c.dist[j]) * s;
    const fov = L(c.fov[i], c.fov[j]);
    _q1.setFromEuler(new THREE.Euler(ex, ey, ez, 'YXZ'));
    // MMDのdistanceは負値が標準(注視点の手前=カメラ側)
    camera.position.copy(center).add(_v2.set(0, 0, -dist).applyQuaternion(_q1));
    camera.lookAt(center);
    if (Number.isFinite(fov) && fov > 1 && fov < 179 && camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    return true;
  }

  /** 停止時にポーズと表情をリセット */
  reset(vrm) {
    const h = vrm?.humanoid;
    if (!h || !this._rig) return;
    this._rig.hips.position.copy(this._rig.hipsRest);
    for (const name of ['hips', 'spine', 'chest', 'neck', 'head',
      'leftShoulder', 'rightShoulder',
      'leftUpperArm', 'leftLowerArm', 'leftHand',
      'rightUpperArm', 'rightLowerArm', 'rightHand',
      'leftUpperLeg', 'leftLowerLeg', 'leftFoot',
      'rightUpperLeg', 'rightLowerLeg', 'rightFoot']) {
      const n = h.getNormalizedBoneNode(name);
      if (n) n.quaternion.identity();
    }
    const em = vrm.expressionManager;
    if (em) {
      for (const mmdName of this.morphs.keys()) {
        const expr = MORPH_MAP[mmdName];
        if (expr) em.setValue(expr, 0);
      }
    }
  }
}
