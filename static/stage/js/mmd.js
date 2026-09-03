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

// 標準MMDモデル(ミクv2実測)の基準値: スケールは「股関節の高さ」の比で取る。
// センター高(8.0)で割るとVRoid系で移動量が約1.34倍過大になり、
// 足の開き・しゃがみが深くなりすぎる(公式MMDAnimationHelperとの比較で確認)。
const MMD_LEG_ROOT_Y = 10.75;  // 股関節(足ボーン)の高さ
const MMD_WAIST_Y = 13.24;     // 下半身/上半身ピボット(ウエスト)の高さ
// MMD素体(ミクv2バインド実測)の腕チェーン各ボーンの下向き角。一律37°で近似すると
// 肩が20°強上ずれ(肩無補正)・肘は折り畳み時に前腕が上腕へめり込む(実際は
// バインド時点で肘が10.6°折れている)ため、ボーンごとに実測値を使う。
const MMD_ARM_BIND_DEG = { shoulder: 30.2, upperArm: 29.7, lowerArm: 40.3, hand: 41.0 };

// MMDボーン名 → VRMヒューマノイドボーン (直接回転コピー系)
const DIRECT_BONES = [
  ['上半身', 'spine'],
  ['上半身2', 'chest'],
  ['首', 'neck'],
  ['頭', 'head'],
];
const ARM_CHAIN = [
  // [mmd名, vrm名, side(+1=左), 自レスト差キー, 親レスト差キー]
  ['左肩', 'leftShoulder', 1, 'shoulder', null],
  ['左腕', 'leftUpperArm', 1, 'upperArm', 'shoulder'],
  ['左ひじ', 'leftLowerArm', 1, 'lowerArm', 'upperArm'],
  ['左手首', 'leftHand', 1, 'hand', 'lowerArm'],
  ['右肩', 'rightShoulder', -1, 'shoulder', null],
  ['右腕', 'rightUpperArm', -1, 'upperArm', 'shoulder'],
  ['右ひじ', 'rightLowerArm', -1, 'lowerArm', 'upperArm'],
  ['右手首', 'rightHand', -1, 'hand', 'lowerArm'],
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
const _q4 = new THREE.Quaternion();
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
      // VRM0はrotateVRM0の180°Y回転が正規化リグ適用後に乗るため、
      // VMDの回転/位置(+Z前方基準)をリグ空間(−Z前方)へ変換する必要がある
      flip: vrm.meta?.metaVersion !== '1',
      legs: {},
    };
    rig.posScale = Math.max(0.02, rig.hipsRest.y || 0.7) / MMD_LEG_ROOT_Y;
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
    // MMD「下半身/上半身」の回転支点(ウエスト): ミク実測比で股関節の約23%上
    rig.waistOff = new THREE.Vector3(
      0, (MMD_WAIST_Y - MMD_LEG_ROOT_Y) / MMD_LEG_ROOT_Y * rig.hipsRest.y, 0);
    // 腕チェーンのレスト方向差: MMD素体(ミク実測)の下向き角 − このVRMのレスト下向き角。
    // rotZオフセットとして q_vrm = R_parent⁻¹ ⊗ q_mmd ⊗ R_self の形で挟む。
    const down = (p) => (p ? Math.atan2(-p.y, Math.hypot(p.x, p.z)) : 0);
    rig.armOff = {};
    for (const side of ['left', 'right']) {
      const S = side === 'left' ? 1 : -1;
      const ua = get(side + 'UpperArm'), la = get(side + 'LowerArm'), hand = get(side + 'Hand');
      const vSh = down(ua?.position), vUa = down(la?.position), vLa = down(hand?.position);
      const mk = (deg, vrmRad) =>
        S * rig.armSign * (THREE.MathUtils.degToRad(deg) - vrmRad);
      rig.armOff[side] = {
        shoulder: mk(MMD_ARM_BIND_DEG.shoulder, vSh),
        upperArm: mk(MMD_ARM_BIND_DEG.upperArm, vUa),
        lowerArm: mk(MMD_ARM_BIND_DEG.lowerArm, vLa),
        hand: mk(MMD_ARM_BIND_DEG.hand, vLa),
      };
    }
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
    // VMD(+Z前方) → リグ空間 変換: 回転は(x,z)成分反転(RotY(π)共役)、位置は(x,z)反転
    const FQ = (q) => { if (rig.flip) q.set(-q.x, q.y, -q.z, q.w); return q; };
    const FV = (v) => { if (rig.flip) { v.x = -v.x; v.z = -v.z; } return v; };

    // --- センター/グルーブ → hips位置、センター×下半身 → hips回転
    const hips = rig.hips;
    hips.position.copy(rig.hipsRest);
    const center = this.bones.get('センター');
    if (center) {
      FV(center.samplePos(t, _v1));
      hips.position.x += _v1.x * s;
      hips.position.y += _v1.y * s;
      hips.position.z += _v1.z * s;
    }
    const groove = this.bones.get('グルーブ');
    if (groove) {
      groove.samplePos(t, _v1);
      hips.position.y += _v1.y * s;
    }
    const qCenter = (this._qCenter ||= new THREE.Quaternion()).identity();
    if (center) FQ(center.sampleRot(t, qCenter));
    // 下半身: MMDでは上半身と兄弟(親=センター)。VRMはspineがhipsの子のため、
    // hipsへ入れた下半身回転をspine側で打ち消す必要がある(でないと上体が二重に曲がる)
    const qLower = (this._qLower ||= new THREE.Quaternion()).identity();
    const lower = this.bones.get('下半身');
    if (lower) FQ(lower.sampleRot(t, qLower));
    hips.quaternion.copy(qCenter).multiply(qLower);
    // 下半身回転の支点補正: MMDはウエスト(≒spine関節)を支点に回すが、
    // VRM hipsは骨盤中心が支点。差分 qC×(dL − qL×dL) をhips位置へ加えて一致させる
    if (rig.waistOff && lower) {
      _v2.copy(rig.waistOff);
      _v3.copy(rig.waistOff).applyQuaternion(qLower);
      _v2.sub(_v3).applyQuaternion(qCenter);
      hips.position.add(_v2);
    }

    // --- 直接コピー系(上半身/首/頭/肩)
    for (const [mmdName, vrmName] of DIRECT_BONES) {
      const tr = this.bones.get(mmdName);
      const node = h.getNormalizedBoneNode(vrmName);
      if (!tr || !node) continue;
      node.quaternion.copy(FQ(tr.sampleRot(t, _q1)));
      if (vrmName === 'spine') {
        // 上半身はセンター基準 → 下半身回転をキャンセル
        node.quaternion.premultiply(_q2.copy(qLower).invert());
      }
    }
    // 肩ボーンが無いモデル: 肩回転を腕へ折り込むため保持
    const shoulderQ = { 1: null, '-1': null };
    if (!h.getNormalizedBoneNode('leftShoulder')) {
      const ls = this.bones.get('左肩'), rs = this.bones.get('右肩');
      if (ls) shoulderQ[1] = FQ(ls.sampleRot(t, new THREE.Quaternion()));
      if (rs) shoulderQ[-1] = FQ(rs.sampleRot(t, new THREE.Quaternion()));
    }

    // --- 腕チェーン (肩含む): ボーンごとのレスト方向差を挟む
    // q_vrm = R_parent⁻¹ ⊗ q_mmd ⊗ R_self。一律オフセットだと肩が20°強
    // 上ずれし(MMD肩は30°下向きレスト)、肘は折り畳みで前腕が上腕へめり込む。
    for (const [mmdName, vrmName, side, selfKey, parentKey] of ARM_CHAIN) {
      const node = h.getNormalizedBoneNode(vrmName);
      if (!node) continue;
      const off = rig.armOff[side === 1 ? 'left' : 'right'];
      const tr = this.bones.get(mmdName);
      const q = tr ? FQ(tr.sampleRot(t, _q1)) : _q1.identity();
      let pOff = parentKey ? off[parentKey] : 0;
      if (selfKey === 'upperArm' && shoulderQ[side]) {
        q.premultiply(shoulderQ[side]);                        // 肩折込み(肩無しモデル)
        pOff = 0;                                              // 親は体幹
      }
      if (pOff) q.premultiply(_q2.setFromAxisAngle(_v1.set(0, 0, 1), pOff).invert());
      node.quaternion.copy(q)
        .multiply(_q2.setFromAxisAngle(_v1.set(0, 0, 1), off[selfKey]));
    }

    // --- 脚: 足IKがあれば2ボーンIK、無ければFK
    if (this.usesLegIK) {
      for (const [side, jp] of [['left', '左'], ['right', '右']]) {
        const leg = rig.legs[side];
        const ik = this._ikTrack(jp);
        if (!leg || !ik) continue;
        this._solveLeg(leg, ik, this.bones.get(jp + '足'), hips, rig, t);
      }
    } else {
      for (const [mmdName, vrmName] of FK_LEG_BONES) {
        const tr = this.bones.get(mmdName);
        const node = h.getNormalizedBoneNode(vrmName);
        if (tr && node) node.quaternion.copy(FQ(tr.sampleRot(t, _q1)));
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
  _solveLeg(leg, ik, fk, hips, rig, t) {
    ik.samplePos(t, _v1).multiplyScalar(rig.posScale);          // IKオフセット(root空間)
    if (rig.flip) { _v1.x = -_v1.x; _v1.z = -_v1.z; }
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
    // 目標方向へ向ける回転: 膝が常に前(+Z)を向くようポールベクターで基底を構築
    // (最短弧回転だとターン時に膝軸がねじれて脚が破綻する)
    const mtx = (this._ikMtx ||= new THREE.Matrix4());
    const xa = (this._ikX ||= new THREE.Vector3());
    const ya = (this._ikY ||= new THREE.Vector3());
    const za = (this._ikZ ||= new THREE.Vector3());
    ya.copy(d).negate();                                  // レスト脚方向(0,-1,0)=ボーン-Y
    const fwd = rig.flip ? -1 : 1;                        // リグ空間の前方
    // 膝の向き(ポール): FK「足」ボーンの回転のうち「ヨー成分(脚の開き)」のみ反映。
    // フル回転を使うとピッチ系キーでポールが脚軸と平行になり、直交化が不安定化して
    // 太ももがねじれる(パンツ/スカートが巻き付いて見える)ため、swing-twist分解で
    // Y軸まわりのツイストだけを取り出す。
    const pole = _v3.set(0, 0, fwd);
    const qFkYaw = (this._qFkYaw ||= new THREE.Quaternion()).identity();
    if (fk) {
      fk.sampleRot(t, _q4);
      if (rig.flip) _q4.set(-_q4.x, _q4.y, -_q4.z, _q4.w);
      const n = Math.hypot(_q4.y, _q4.w);
      if (n > 1e-6) qFkYaw.set(0, _q4.y / n, 0, _q4.w / n);   // Y軸ツイスト成分のみ
      pole.applyQuaternion(qFkYaw);
    }
    za.copy(pole).addScaledVector(d, -d.dot(pole)).normalize(); // ポールを脚軸に直交化
    if (!Number.isFinite(za.x) || za.lengthSq() < 1e-6) za.set(0, 0, fwd);
    xa.crossVectors(ya, za).normalize();
    za.crossVectors(xa, ya);                              // 再直交化
    // ここまでの基底は「ボーン+Z=膝の向き(前方)」を仮定しているが、リグ空間で
    // ボーン+Zが指すのは常に+Z。VRM0はリグ空間の前方が-Zのため、このままだと
    // 基底が脚軸まわりに180°回り、太もも〜すね全体が半回転ねじれて衣装が
    // 巻き付く(輪郭は正しいので気づきにくい)。脚軸まわりにπ回して整合させる。
    if (rig.flip) { xa.negate(); za.negate(); }
    const aim = _q1.setFromRotationMatrix(mtx.makeBasis(xa, ya, za));
    // 股関節の追加屈曲(余弦定理)・ひざはX軸ヒンジで前へ(曲げ符号は前方の向きに従う)
    const a1 = Math.acos(Math.min(1, Math.max(-1,
      (leg.l1 * leg.l1 + len * len - leg.l2 * leg.l2) / (2 * leg.l1 * len))));
    const beta = Math.acos(Math.min(1, Math.max(-1,
      (leg.l1 * leg.l1 + leg.l2 * leg.l2 - len * len) / (2 * leg.l1 * leg.l2))));
    const fs = rig.flip ? -1 : 1;
    leg.upper.quaternion.copy(aim)
      .multiply(_q2.setFromAxisAngle(_v2.set(1, 0, 0), -a1 * fs));
    leg.lower.quaternion.setFromAxisAngle(_v2.set(1, 0, 0), (Math.PI - beta) * fs);
    // 足首の向き: ワールド固定にせず「体(センター)のヨー × 脚の開き(FK足ヨー)」に
    // 追従させ、その上に足IK回転(あれば)を乗せる。WAVEFILE等は足IK回転が全て0のため、
    // 固定にするとターン時に足だけ正面を向き続けて腰から下が捻れて見える。
    const chain = _q2.copy(hips.quaternion).multiply(leg.upper.quaternion)
      .multiply(leg.lower.quaternion);
    const qc = this._qCenter || _q1.identity();
    const hy = Math.hypot(qc.y, qc.w) || 1;
    _q1.set(0, qc.y / hy, 0, qc.w / hy);      // 体の向き(センターのヨー)
    _q1.multiply(qFkYaw);                      // 脚の開き
    ik.sampleRot(t, _q3);
    if (rig.flip) _q3.set(-_q3.x, _q3.y, -_q3.z, _q3.w);
    _q1.multiply(_q3);                         // 足IK回転(キーがあれば)
    leg.foot.quaternion.copy(chain.invert()).multiply(_q1);
  }

  get hasCamera() { return !!this.camera; }

  /** VMDカメラを three カメラへ適用 (MMD: 注視点+距離+回転) */
  applyCamera(camera) {
    const c = this.camera;
    if (!c) return false;
    const s = this._rig?.posScale ?? (0.85 / MMD_LEG_ROOT_Y);
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
