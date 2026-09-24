# LyricFlow 演出エンジン (Compose) — パック作成ガイド

LyricFlow の演出エンジンは、歌詞を「カット」(原則1行=1カット。長い行は語の区切りで複数カット) に分け、
カットごとに **layout(構図) + enter(登場) + hold(保持) + exit(退場) + decor(装飾) + treat(文字加工) + cam(カメラ) + trans(つなぎ)**
を割り当てて Canvas2D に描く。全てシード決定論(同じ時刻 → 同じ絵。プレビューと書き出しが一致)。

- コア: `static/js/compose/core.js` (グローバル `window.LFC`、本書では `L`)
- パック: `static/js/compose/p_*.js` — **1ファイル = 1パック。エントリを登録するだけで、コアは編集しない**
- 読み込み: `static/js/compose/loader.js` (パック一覧)。エディタ・書き出し・開発シートが同じ一覧を使う
- 検証: `dev/compose/sheet.sh`(下記)

## 1. ファイルの骨格

```js
/* LyricFlow 演出パック: p_xxx — 一行説明 */
(() => {
'use strict';
const L = window.LFC;
if (!L) return;
const E = L.E;
const P = 'p_xxx';
L.register('layout', 'a_myKey', { name: '日本語名', tags: ['pop', 'graphic'], w: 1, fits: n => n <= 12, plan(rng, cut, st) { … }, render(env) { … } }, P);
})();
```

`L.register(group, key, def, pack)`。**key はグループ内で一意**(重複は警告して無視される)。
並列で作るため、レイアウトの key は**担当パックの接頭辞必須**: `p_layouts_a`→`a_…`、`b_…`、`c_…`、`d_…`。
他グループは接頭辞不要(1グループ1担当)だが、既存の `fade`(enter/exit)・`still`(hold)・`center`(layout) とは重ねない。
`name` = UIに出る日本語名(2〜8字、短く具体的に)。`tags` = 合う雰囲気(下記)。`w` = 基本の選ばれやすさ
(普通1、汎用で強いもの1.2〜1.5、クセが強い/用途が狭いもの0.4〜0.7)。和風モチーフは `wa: true`。

**tags(雰囲気)**: `pop calm emotional glitch graphic editorial cyber dark wa`
(pop=明るい/かわいい、calm=しっとり/余白、emotional=エモ/切ない、glitch=デジタル破綻、graphic=図形的/強い、
editorial=誌面/タイポ的、cyber=近未来/UI、dark=暗い/退廃/ロック、wa=和)

## 2. 座標系と env

キャンバスの実ピクセル `W×H` がそのまま座標(16:9 だけでなく **9:16 縦・1:1** でも必ず成立させる)。
サイズは `W`・`H`・`Math.min(W,H)`・`env.u`(= min(W,H)/1080) の相対で決める。絶対ピクセル禁止。

`render(env)` / `draw(env, …)` / `apply(env, …)` が受け取る `env`:

| field | 意味 |
|---|---|
| `ctx` | CanvasRenderingContext2D (カメラ変換済み) |
| `W`,`H`,`u`,`portrait` | サイズ / 単位 / 縦長か |
| `sc` | 配色: `bg bg2 fg sub dim accent accent2 ink onInk onAccent2 paper onPaper ghostA ghostB dark`。**色はこれだけ使う**(+ `#000/#fff` を `L.lum` で判定して)。`onInk`=accent 塗りの上の文字色、`paper`/`onPaper`=紙系プレートと文字 |
| `st` | スタイル: `st.fonts.display/serif/body/mono/hand` |
| `fx` | スライダ 0..1: `motion glitch decor density` |
| `cut` | `text`(このカットの文字) `lineText`(行全体) `note`(注釈) `impact`(末尾!) `emph`(サビ等の強調) `emphIdx`(強調字の添字) `n`(空白除く字数) `start end dur inDur outDur` `words:[{text,start,end}]`(語と時刻) `params`(plan の戻り値) `seed` `idx line part parts` |
| `t` | 絶対時刻(秒) |
| `lt` | カット開始からの経過秒(**ゴーストパスごとに少し遅れる**) / `ltb` 同じ(連続運動用) |
| `pIn`,`pOut` | カットの登場/退場の進行 0..1 |
| `step` | 24Hz の整数クロック(ちらつき・ジッタの乱数キーに) |
| `pass` | `'B'`,`'A'`(色ずれゴースト。先に単色で描かれる) / `'main'` |
| `energy` | 音量 0..1 / `beat` = `{since,len,index}` または null |
| `allowFilter` | false の時は `ctx.filter`(blur等) を使わない |

### ゴーストパス(重要)
layout の `render` と decor の `draw` は **1フレームに3回**(B, A, main)呼ばれる。ヘルパーが自動で処理する:
- 文字: `L.mainDraw(env, item)`(歌詞本体)・`env.text(item)`(副テキスト)。ゴーストを出したくない副テキストは `ghost:false`。
- 図形: `env.rect(x,y,w,h,color,alpha=1,ghost=true)` `env.rrect(x,y,w,h,r,fill,alpha=1,ghost=true,stroke,lw)`
  `env.line(pts,color,lw,alpha=1,ghost=false,dash)` `env.polyPartial(pts,e,color,lw,alpha,ghost)`(e=0..1まで描く)
  `env.circle(cx,cy,r,fill,stroke,lw,alpha,ghost=false)` `env.arc(cx,cy,r,deg0,deg1,color,lw,alpha,ghost=false)` `env.poly(pts,color,alpha,ghost=false)`
  ghost=false の図形は main パスでだけ描かれる。ghost=true は大きく太い図形だけに。
- `ctx` を直接使う描画(グラデ・クリップ・画像・パス)は **必ず `if (env.pass === 'main') { … }` で囲む**。
  変換/クリップ/alpha/合成モードの変更は `ctx.save()/restore()` で閉じる。
- `env.inOut(dIn=0.35, delay=0)` = 装飾の出入り量 0..1(冒頭 dIn 秒で出現、退場に合わせて消える)。

## 3. テキスト項目 (`L.drawItem` のモデル)

```
{ text, font, weight(既定900), size, x, y, color, align:'center'|'left'|'right', vertical, valign:'top',
  lead(行送り/列送り係数), track(字間 em), sx, sy, rot(ラジアン), skew(ラジアン), skewY, alpha,
  fill(既定true), stroke(px), strokeColor, strokeUnder(既定true=塗りの下に線), strokeDash, dash(0..1 線の描き起こし),
  gradient:[c1,c2(,c3)] or [[offset,color],…], pattern:'dots'|'stripes'|'hatch'|'grid'|'lines'(+patternColor,patternBg),
  shadow:{color,blur,dx,dy}, extrude:{n,dx,dy,color,fade,a}, fillAlpha, blur, blend, ghost:false, italic,
  mi(スタッガー番号), delay(秒), plain:true(加工treatを掛けない), enter/exit/hold(項目ごとの上書きキー), noHold }
```
グリフは `(x,y)` を中心に置かれる(`\n` で複数行/縦書きは複数列、右の列から)。縦書きは ー〜…括弧を90°回転、小書き仮名と、。を右上へ寄せる。
- `L.measure(item)` → `{w,h,lay:[{ch,x,y,w,h,i,line,space}]}`(項目中心が原点)
- `L.fitSize(text, font, maxW, maxH, {weight,track,lead,vertical,sx,sy,max})` → 収まる最大サイズ
- `L.itemBox(item)` → `{x0,y0,x1,y1,w,h,cx,cy}`、`L.unionBB(a,b)`、`L.centerBB(env,bb)`
- `L.splitLines(text, maxPerLine)` 日本語のバランス改行(欧文は単語単位)、`L.chunks(text)` 句に分割(助詞を前に寄せる)
- `L.glyphs(s)` `L.glyphCount(s)` `L.isKanji/isHira/isKata/isLatin/isPunct/isSmallKana/isSpace` `L.romaji(kana)`(漢字を含むと null) `L.fmtTime(t)`
- フォント: `L.roleFont(env, 'display'|'serif'|'body'|'mono'|'hand', i)` → CSS font-family。**スタイルの役割フォントを優先**。
  直接指定するなら次から(Google Fonts 読込済): `'Dela Gothic One'` `'Reggae One'` `'RocknRoll One'` `'Rampart One'` `'Train One'`
  `'Zen Kaku Gothic New'` `'Noto Sans JP'` `'BIZ UDPGothic'` `'M PLUS Rounded 1c'` `'Zen Maru Gothic'` `'Kosugi Maru'` `'Zen Kurenaido'`
  `'Noto Serif JP'` `'Shippori Mincho'` `'Zen Old Mincho'` `'Kaisei Tokumin'` `'New Tegomin'` `'Zen Antique'` `'Hina Mincho'` `'Kaisei Decol'`
  `'Mochiy Pop One'` `'Hachi Maru Pop'` `'Yusei Magic'` `'Klee One'` `'Yuji Syuku'` `'Yuji Mai'` `'Yomogi'` `'DotGothic16'` `'Stick'`
  欧文のみ: `'Anton'` `'Bebas Neue'` `'Oswald'` `'Montserrat'` `'Inter'` `'Playfair Display'` `'Zen Dots'`(日本語グリフ無し→日本語本文に使わない)
  形式は `"'Dela Gothic One', sans-serif"` のように。

**`L.mainDraw(env, item)`** = 歌詞本体を描く唯一の入口。カットの treat(加工)→enter→hold→exit を適用して描き、bbox を返す(非表示中は null)。
**歌詞本体は必ず mainDraw を通す**(どの登場/退場とも組み合わせられるように)。複数項目にするときは `mi` を 0,1,2… と振るとずれて登場する。
`env.text(item)` = 動きなしの副テキスト(色の既定は `sc.sub`、ウェイト700)。

### モーションが項目に設定できるもの
- `clip:[x0,x1]` `clipY:[y0,y1]` … 項目の(余白込み)箱に対する 0..1 の窓。`clipFn(ctx, env, it, m)` … 独自パスを足すとそれがクリップになる(項目ローカル座標、原点=中心、`m.w/m.h`)
- `bands:[[y0,y1,dx],…]` 横帯ごとにずらす(0..1)、`L.itemBands(env,it,n,(i,n)=>dx)`、縦帯 `L.itemVBands(env,it,n,(i,n)=>dy)`
- `echo:{n,dx,dy,a,decay,scale,rot,outline,color}` 段階コピー(残像) / `streak:{n,dx,dy,a}` モーショントレイル
- `pre(env,it,m)` / `post(env,it,m)` 項目ローカル座標(原点=中心)で下敷き/上描き(マーカー、下線、枠)。3パスで呼ばれる→ヘルパーの ghost 引数を意識
- **字ごとの関数** `it.charFns.push((i, g, n) => ({dx,dy,rot,s,sx,sy,a,color,ch,hide,skew,blur,outline,clipX:[a,b],clipY:[a,b]}))`
  i=字の添字、n=字数(空白含む)、g=`{x,y,w,h,ch}`。clipX は字幅に対する割合(中心0、字全体≈[-0.55,0.55])、clipY は字サイズに対する割合(中心0、全体≈[-0.62,0.62])。変化なしは null を返す。
- `L.stagger(p, i, n, spread=0.5, order='lr'|'rl'|'center'|'edges'|'random'|配列, seed)` → 字ごとの進行度。**全字が p=1 で必ず揃う**スライド窓式。

## 4. 乱数・イージング・色
- **決定論のみ**: 描画/適用中に `Math.random()`・`Date` 禁止。`plan(rng, …)` では `rng()` `rng.range(a,b)` `rng.int(a,b)` `rng.pick(arr)` `rng.chance(p)` `rng.sign()`。
  描画時は `L.r(a,b,…)` 0..1 / `L.rs(…)` -1..1 / `L.rr(lo,hi,…)` / `L.h(…)` uint を `env.cut.seed`・添字・`env.step` をキーに。`L.noise1(x, seed)` なめらかノイズ。
- イージング `E.lin inQuad outQuad inOutQuad inCubic outCubic inOutCubic inQuart outQuart outExpo inExpo inOutExpo outBack(x,s) inBack outElastic outBounce inSine outSine inOutSine`。
  `L.clamp(x,a=0,b=1)` `L.lerp` `L.smooth(a,b,x)` `L.TAU` `L.DEG`。
- 色: `L.lum(c)` `L.mix(a,b,t)` `L.rgba(c,a)` `L.contrast(a,b)` `L.fitContrast(c,bg,ratio)` `L.onColor(bg)`(塗りの上の文字色)。
  **暗い背景・明るい背景の両方で成立させる**(`env.sc.dark` や `L.lum` で分岐)。歌詞は常に十分なコントラストを保つ。

## 5. グループ別の契約

**layout** `{ name, tags, w, fits(n)→bool (n=空白除く字数 1..30), plan(rng, cut:{text,n,W,H,dur,portrait,emph,words}, st)→params(素のJSON: 数/文字列/真偽/配列のみ、関数不可), render(env)→bbox|null`
任意: `portrait`(縦長時の重み倍率。縦が弱いなら0.5など) `emph`(強調カットでの倍率) `treat:false|'safe'`(false=文字加工なし、'safe'=歌詞が自前の色プレート上にある) `busy:true`(画面全体を埋める→装飾を抑制) `enterBias:{enterKey:倍率}` `minDur`
- 歌詞本体は必ず `L.mainDraw` で。自前の副グラフィックは**出入りをアニメさせる**(`env.inOut()` 等。ポンと出ない)。
- 静止時、歌詞は画面の約5%の安全余白の内側に。1字〜16字以上・欧文(空白あり)に対応(無理なものは `fits` で除外)。
- 変化は `plan` で決める(2〜4種の変形、向き、サイズ比…)。render は `env.cut.params` を読むだけ。

**enter** `{ name, tags, w, apply(env, it, p, ctx) }` — p 0→1(項目ごとの遅延は適用済)。`ctx={dur,inDur,outDur,n,mi}`。
p=0 は「まだ見えない」、**p=1 はそのままの静止状態**(ずれ/alpha の残りを残さない)。任意: `stagger`(mi 1つあたりの遅延秒、既定0.07) `minDur` `maxChars` `emph`。apply は p<1 の間だけ呼ばれる。

**exit** `{ name, tags, w, apply(env, it, p, ctx) }` — p 0(静止)→1(**完全に消える**: alpha0/画面外/非表示)。p=1 ではエンジンが強制的に非表示にする。

**hold** `{ name, tags, w, apply(env, it, amt, ctx) }` — 静止中の持続的な動き。amt 0..1(登場後にフェードイン、退場で0へ。既に `env.fx.motion` 込み)。
**amt=0 で無変化**、控えめに。`env.lt`・`env.step`・`env.beat`・`env.energy` を使ってよい。

**decor** `{ name, tags, w, layer:'back'|'front', subtle?:true(busy レイアウトの後ろでも可), draw(env, bb, P) }` — bb=歌詞の bbox(null あり→`L.centerBB(env,bb)`)。
`P={seed, v(0..5 変種), r(0..1), right, low, accent, big(真偽), n(1..3), corner(0..3)}` を変化に使う。冒頭0.3〜0.5秒で出現、`env.pOut` で消える(`env.inOut()`)。
front は歌詞の bbox を覆わない(周囲・外側に置く)。back は歌詞の下なので低コントラスト(`sc.dim`,`sc.sub`,低alpha)。

**treat** `{ name, tags, w, safe?, plan?(rng, st)→params, apply(env, it, P) }` — カットの全歌詞項目に(登場より前に)掛かる文字加工
(縁取り、影、立体、グラデ/柄、マーカー、下線、字ごとの色替え…)。`it.color` を文字色として尊重し、補色は `env.sc` から `L.lum` で選ぶ。
`it.fill===false` や alpha が低い項目は触らない。`safe:true` は色プレート上でも成立するものだけ。

**cam** `{ name, tags, w, strong?, plan?(rng, st)→params, get(env, P) → {x, y, s, rot(度), sx, sy, skx(度)} }` — カット内容の画面中心まわりの変形。
歌詞を画面内に保つ(|x|,|y| ≤ 5%、s 0.92〜1.15、rot ≤ 5°)。大きい動きは短く、必ず収束。`strong:true` は激しいもの(強調カット向け)。

**trans** `{ name, tags, w, dur(秒, 既定0.35), plan?(rng, st)→params, draw(ctx, A, B, p, info) }` — 前カット(A: 静止状態のキャンバス)から今カット(B)へのつなぎ。
A/B は**歌詞レイヤーだけ**(背景は透明、実ピクセル W×H)。p 0→1(線形、イージングは自分で)。ctx(単位行列・同サイズ)に完成形を描く:
p=0 で A と同一、p=1 で B と同一。`info={cw,ch,sc,st,P,step,t,seed,u,tmp(w,h)}`(tmp は再利用バッファ)。

**style**(配色セット) — `L.registerStyle(key, def)`:
`{ name, desc, moods:[…], colors:{bg1,bg2,accent,accent2,text}, fonts:{display,serif,body,mono,hand}, ghost(0..1 色ずれの強さ),
   ghostA?, ghostB?, bias:{layout:{key:倍率}, enter:{…}, exit:{…}, hold:{…}}, decor:{decorKey:重み} }`
適用するとプロジェクトの配色(背景シーンにも反映)と役割フォントが切り替わる。

## 6. 性能・頑丈さ
- 1回の呼び出しは 1080p で約2ms以内。`getImageData` 禁止。フレームごとのキャンバス生成禁止(必要ならモジュール内 Map にキャッシュ)。ループ回数は上限を設ける。
- `bb===null`、空文字、1字、長文(30字)、欧文、縦長・正方形で例外を出さない。

## 7. オリジナリティと権利(厳守)
- **他作品のコードを写さない。**(参考アプリの `scratchpad/JIZURA/src` や `ae` のソースは開かない)。`scratchpad/research/*.md` の散文カタログは発想の参考に使ってよいが、実装は自分で書く。
- **実在曲の歌詞・既存キャラクター・ロゴ・商標を描かない。** 副テキストは汎用語(`LYRIC` `TRACK 01` `No.` `REC` `LIVE` `SIDE A` など)か、`cut` から生成したもの(時刻、行番号、ローマ字)だけ。
- 近い演出の重複を避ける: 動きの原理・構図・図形アイデアが目で見て違うこと(数値違いだけの量産は不可)。

## 8. 検証ループ(エントリごとに必ず)
```
./dev/compose/sheet.sh <group> <key1,key2,…|all> /tmp/lfc_<pack>        # コンタクトシートPNG + report.json
./dev/compose/sheet.sh all all /tmp/lfc_smoke smoke                     # 全演出×多条件のスモーク(エラー/最遅フレーム)
node --check static/js/compose/<pack>.js                                # 構文
```
出力 PNG を Read で開いて**全シートを目で確認**: 文字の重なり・はみ出し・汚い間隔・p=1 の残り・ポンと出る図形・既存と同じ動き・縦長/正方形での破綻。
report.json の `errors` は0件、`slow`(サムネ大で12ms超)に載らないこと。
