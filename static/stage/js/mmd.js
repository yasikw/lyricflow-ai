// mmd.js — MMD VMDモーション → VRMリターゲット再生エンジン
//
// - VMD(ボーン/モーフ)を mmdparser で解析し、VRMヒューマノイド(正規化ボーン)へ
//   リターゲットして再生する
// - MMDはA-pose基準・VRM正規化リグはT-pose基準のため、腕チェーンに定数オフセット
//   回転を挟む (腕: q⊗r / ひじ・手首: r⁻¹⊗q⊗r)
// - 脚はMMDダンスモーションの主流である足IKボーンを2ボーンIKで解決
// - モーフ(まばたき/あいうえお/笑い等)はVRM標準表情へマッピング
// - キー補間はMMDのベジェ補間に対応(キーごとの制御点を使って緩急を再現)

import * as THREE from 'three';
import { MMDParser } from '../vendor/jsm/libs/mmdparser.module.js';

// 標準MMDモデル(ミクv2実測)の基準値: スケールは「股関節の高さ」の比で取る。
// センター高(8.0)で割るとVRoid系で移動量が約1.34倍過大になり、
// 足の開き・しゃがみが深くなりすぎる(公式MMDAnimationHelperとの比較で確認)。
const MMD_LEG_ROOT_Y = 10.75;  // 股関節(足ボーン)の高さ
const MMD_WAIST_Y = 13.24;     // 下半身/上半身ピボット(ウエスト)の高さ
// 足ＩＫ→つま先ＩＫ のバインド差分(ミク実測, MMD単位, +Zが前)。つま先IKの「てこの長さ」。
// 対象モデル自身の足首→つま先で代用すると、VRoid系は約半分の長さしかないため
// 同じアニメ差分でも足の振れ角が倍になる。角度はMMD基準で出す。
const MMD_TOE_OFF = [0, -1.34, 2.464];
// MMD素体(ミクv2バインド実測)の腕チェーン各ボーンの下向き角。一律37°で近似すると
// 肩が20°強上ずれし(肩無補正)、肘の折り畳み軸が7°ずれて前腕が上腕へめり込む。
// 注: 実測ではひじ→手首は40.3°(バインド時点で肘が10.6°折れている)だが、この
// 「事前折れ」を腕が真っ直ぐなVRoid系へ転写すると伸ばした腕の肘が折れて見えるため、
// ひじは腕と同角=共役(回転軸の補正)のみとし、折れ自体は転写しない。
// 手首は本来のMMD角(41.0°)で合わせる: 前腕を起こした10.6°の差を手首関節で
// 吸収することで、肘は真っ直ぐのまま手の向きだけ公式実装と一致させる。
const MMD_ARM_BIND_DEG = { shoulder: 30.2, upperArm: 29.7, lowerArm: 29.7, hand: 41.0 };

// MMDボーン名 → VRMヒューマノイドボーン (直接回転コピー系)
const DIRECT_BONES = [
  ['上半身', 'spine'],
  ['上半身2', 'chest'],
  ['首', 'neck'],
  ['頭', 'head'],
];
const ARM_CHAIN = [
  // [mmd名, vrm名, side(+1=左), 自レスト差キー, 親レスト差キー, 捩りボーン名]
  // 捩りボーン(腕捩/手捩)はMMDでは 腕→腕捩→ひじ→手捩→手首 と間に挟まる。
  // VRMには対応ボーンが無いので、親側の回転へ畳み込む(軸が同じなので等価)。
  ['左肩', 'leftShoulder', 1, 'shoulder', null, null],
  ['左腕', 'leftUpperArm', 1, 'upperArm', 'shoulder', '左腕捩'],
  ['左ひじ', 'leftLowerArm', 1, 'lowerArm', 'upperArm', '左手捩'],
  ['左手首', 'leftHand', 1, 'hand', 'lowerArm', null],
  ['右肩', 'rightShoulder', -1, 'shoulder', null, null],
  ['右腕', 'rightUpperArm', -1, 'upperArm', 'shoulder', '右腕捩'],
  ['右ひじ', 'rightLowerArm', -1, 'lowerArm', 'upperArm', '右手捩'],
  ['右手首', 'rightHand', -1, 'hand', 'lowerArm', null],
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

// --- MMDのベジェ補間 -------------------------------------------------------
// VMDのキーは64バイトの補間パラメータを持ち、X/Y/Z移動と回転の4成分それぞれに
// 制御点(x1,y1)(x2,y2)がある。レイアウトは three.js の MMDLoader と同じ読み方:
//   成分k → x1=raw[k], x2=raw[k+8], y1=raw[k+4], y2=raw[k+12] (各0〜127)
// 補間パラメータは「移動先のキー」に付く。
function readInterp(raw) {
  if (!raw || raw.length < 16) return null;
  const out = new Float32Array(16);
  let linear = true;
  for (let k = 0; k < 4; k++) {
    const x1 = raw[k] / 127, x2 = raw[k + 8] / 127;
    const y1 = raw[k + 4] / 127, y2 = raw[k + 12] / 127;
    out[k * 4] = x1; out[k * 4 + 1] = x2; out[k * 4 + 2] = y1; out[k * 4 + 3] = y2;
    if (x1 !== y1 || x2 !== y2) linear = false;   // 制御点が対角線上なら等速
  }
  return linear ? null : out;      // 等速ならnull = 従来の線形経路でそのまま速い
}

/** 3次ベジェ y(x) を二分法で解く(three.js の CubicBezierInterpolation と同手順) */
function bezierEase(x1, x2, y1, y2, x) {
  let c = 0.5, t = c, s = 1 - t, sst3 = 0, stt3 = 0, ttt = 0;
  for (let i = 0; i < 15; i++) {
    sst3 = 3 * s * s * t;
    stt3 = 3 * s * t * t;
    ttt = t * t * t;
    const ft = sst3 * x1 + stt3 * x2 + ttt - x;
    if (Math.abs(ft) < 1e-5) break;
    c /= 2;
    t += ft < 0 ? c : -c;
    s = 1 - t;
  }
  return sst3 * y1 + stt3 * y2 + ttt;
}

const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _q4 = new THREE.Quaternion();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();

class Track {
  constructor() { this.times = []; this.pos = []; this.rot = []; this.ip = []; this.cursor = 0; }

  finalize() {
    // frameNum昇順ソート(同時挿入順を保持)
    const idx = this.times.map((t, i) => i).sort((a, b) => this.times[a] - this.times[b]);
    this.times = idx.map((i) => this.times[i]);
    if (this.pos.length) this.pos = idx.map((i) => this.pos[i]);
    if (this.rot.length) this.rot = idx.map((i) => this.rot[i]);
    if (this.ip.length) {
      this.ip = idx.map((i) => this.ip[i]);
      this.hasEase = this.ip.some((v) => v);      // 全部等速ならベジェ処理を省く
    }
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
    // X/Y/Zは別々のベジェ曲線を持つ(移動先キーのパラメータを使う)
    const p = this.hasEase ? this.ip[i + 1] : null;
    const wx = p ? bezierEase(p[0], p[1], p[2], p[3], w) : w;
    const wy = p ? bezierEase(p[4], p[5], p[6], p[7], w) : w;
    const wz = p ? bezierEase(p[8], p[9], p[10], p[11], w) : w;
    return out.set(a[0] + (b[0] - a[0]) * wx,
                   a[1] + (b[1] - a[1]) * wy,
                   a[2] + (b[2] - a[2]) * wz);
  }

  sampleRot(t, out) {
    if (!this.rot.length) return out.identity();
    const i = this._seek(t);
    const a = this.rot[i];
    out.set(a[0], a[1], a[2], a[3]);
    if (i >= this.times.length - 1 || this.times[i] > t) return out;
    const b = this.rot[i + 1];
    let w = (t - this.times[i]) / (this.times[i + 1] - this.times[i] || 1);
    const p = this.hasEase ? this.ip[i + 1] : null;
    if (p) w = bezierEase(p[12], p[13], p[14], p[15], w);
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
      tr.ip.push(readInterp(m.interpolation));
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
    this._ownCamera = this.camera;   // 外部カメラ解除時に戻す用
    this._camWrap = 0;               // 外部カメラのループ周期(0=ループしない)

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

  _toeTrack(side) {
    return this.bones.get(side + 'つま先ＩＫ') || this.bones.get(side + 'つま先IK') || null;
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
      const toes = get(side + 'Toes');
      // つま先IKの基準: MMDの「足ＩＫ→つま先ＩＫ」に相当するベクトルを、
      // 対象モデル自身の 足首→つま先 から採る(モデル差をそのまま吸収する)
      const toeOff = toes ? world(toes, new THREE.Vector3()).sub(pf) : null;
      rig.legs[side] = {
        upper: u, lower: k, foot: f, toes,
        restUpper: pu, restAnkle: pf,
        toeOff, toeDir: toeOff && toeOff.length() > 1e-4 ? toeOff.clone().normalize() : null,
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
      const mid = get(side + 'MiddleProximal');   // 手のレスト方向は中指で実測(無ければ前腕で代用)
      const vSh = down(ua?.position), vUa = down(la?.position), vLa = down(hand?.position);
      const vHand = mid ? down(mid.position) : vLa;
      const mk = (deg, vrmRad) =>
        S * rig.armSign * (THREE.MathUtils.degToRad(deg) - vrmRad);
      rig.armOff[side] = {
        shoulder: mk(MMD_ARM_BIND_DEG.shoulder, vSh),
        upperArm: mk(MMD_ARM_BIND_DEG.upperArm, vUa),
        lowerArm: mk(MMD_ARM_BIND_DEG.lowerArm, vLa),
        hand: mk(MMD_ARM_BIND_DEG.hand, vHand),
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
    for (const [mmdName, vrmName, side, selfKey, parentKey, twistName] of ARM_CHAIN) {
      const node = h.getNormalizedBoneNode(vrmName);
      if (!node) continue;
      const off = rig.armOff[side === 1 ? 'left' : 'right'];
      const tr = this.bones.get(mmdName);
      const q = tr ? FQ(tr.sampleRot(t, _q1)) : _q1.identity();
      // 捩りボーンを畳み込む: world(ひじ) = q腕 ⊗ q腕捩 ⊗ qひじ の順を保つ
      const tw = twistName ? this.bones.get(twistName) : null;
      if (tw && tw.rot.length > 1) q.multiply(FQ(tw.sampleRot(t, _q4)));
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
        this._solveLeg(leg, ik, this.bones.get(jp + '足'), hips, rig, t, this._toeTrack(jp));
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
  _solveLeg(leg, ik, fk, hips, rig, t, toeIk) {
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
    const chain = _q2.copy(hips.quaternion).multiply(leg.upper.quaternion)
      .multiply(leg.lower.quaternion);
    // --- 足首の向き ---
    // MMDでは「つま先ＩＫ」(足ＩＫの子)が足首を回して足の向きを作る。足ＩＫ回転も
    // 足首FKもほぼ0のモーションが多く、実際の足の角度はつま先ＩＫの位置が決めている。
    if (toeIk && leg.toeDir) {
      // つま先ＩＫは足ＩＫの子。足首から見た目標の向き = q(足ＩＫ) × (バインド差分 + アニメ差分)。
      // 長さはMMD単位のまま比を取る(正規化するのでスケール換算は不要)。
      toeIk.samplePos(t, _v4);
      _v4.x += MMD_TOE_OFF[0]; _v4.y += MMD_TOE_OFF[1]; _v4.z += MMD_TOE_OFF[2];
      if (rig.flip) { _v4.x = -_v4.x; _v4.z = -_v4.z; }
      ik.sampleRot(t, _q3);
      if (rig.flip) _q3.set(-_q3.x, _q3.y, -_q3.z, _q3.w);
      _v4.applyQuaternion(_q3);
      if (_v4.lengthSq() > 1e-8) {
        _v4.normalize();
        // CCDは1リンクなので収束後の足首の向き = 目標方向そのもの
        _q1.setFromUnitVectors(leg.toeDir, _v4);     // レストのつま先方向 → 目標方向
        leg.foot.quaternion.copy(chain.invert()).multiply(_q1);
        return;
      }
    }
    // つま先ＩＫが無いモーション: 足首のFK回転をそのまま乗せる(MMDと同じ順序)。
    // それも無ければ「体のヨー × 脚の開き × 足IK回転」で向きを作る従来の近似。
    const ankleFk = this.bones.get((leg === rig.legs.left ? '左' : '右') + '足首');
    if (ankleFk && ankleFk.rot.length > 1) {
      ankleFk.sampleRot(t, _q1);
      if (rig.flip) _q1.set(-_q1.x, _q1.y, -_q1.z, _q1.w);
      leg.foot.quaternion.copy(_q1);
      return;
    }
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

  /**
   * 別VMD(カメラ配布データ)のカメラトラックを取り込み、本モーションの時刻に
   * 追従させる。ダンスVMDとカメラVMDを同時に使うための入口。
   * カメラ側が短い場合はその周期でループする。null で解除。
   * @returns {boolean} カメラを取り込めたか
   */
  setExternalCamera(player) {
    if (!player || !player.camera) {
      this.camera = this._ownCamera || null;
      this._camWrap = 0;
      return false;
    }
    const src = player.camera;
    this.camera = { ...src, cursor: 0 };
    this._camWrap = src.times.length ? src.times[src.times.length - 1] : 0;
    return true;
  }

  /** VMDカメラを three カメラへ適用 (MMD: 注視点+距離+回転) */
  applyCamera(camera) {
    const c = this.camera;
    if (!c) return false;
    const s = this._rig?.posScale ?? (0.85 / MMD_LEG_ROOT_Y);
    // 外部カメラがダンスより短い場合はカメラ側の周期で繰り返す
    const t = (this._camWrap > 0.05 && this.t > this._camWrap)
      ? this.t % this._camWrap : this.t;
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
    // カメラはワールド空間。VRM0でもrotateVRM0でモデル側が+Z正面に揃うため、
    // ボーンのようなRotY(π)変換は掛けない(掛けると背面を映す)
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
