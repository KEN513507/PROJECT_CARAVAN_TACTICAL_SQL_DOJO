// js/tutor.js
// ============================================================
// CHARACTER ART CONTRACT (SSOT)
// ------------------------------------------------------------
// 立ち絵は「学習の妨げにはしないが、学習を一緒にしている演出」。
// 出るのは次の3つの瞬間だけ:
//
//   intro : 問題冒頭（ミッションを開いた直後）
//   hint  : ヒントを開いた瞬間
//   clear : クリア画面
//
// 出し方は「カットイン」。小さく出しっぱなしにはしない。
//   左から急に入る → ゆっくり右へ流れる → 急に抜ける
// 一度再生したら自分で終わる。居座らない。
//
// これ以外では必ず隠れる。とくに「SQLを編集している間」は絶対に出さない。
// 編集操作（トークンを置く/選ぶ/消す、SQL欄へフォーカスする）が1回でも起きたら
// 再生中でもその場で打ち切る。
//
// 大きく出すぶん、画面を一時的に覆う。だから:
//   - pointer-events:none。タップを奪うことは構造上ない。
//   - 必ず数秒で自分から抜ける。止まらない。
//   - 触ったら即座に消える。待たされない。
//   - 画面下の操作列（ヒント／実行）の高さを実測し、その上に床を作って立つ。
//     ボタンと場所を取り合わない。立ち絵は邪魔者ではなく、居場所を持つ。
//
// 立ち絵は「主人公（第九保全局の臨時監査員）」。全編を通して同一人物。
// カットインに出る文は2種類:
//   SELF : 声に出していない思考ログ
//   NORA : 端末越しに返ってくるAIの応答
// どちらの瞬間も端末カードを出すので、プレイヤーには
// 「スマホでAIと話している」ことが一目で伝わる。NORAの顔は出さない。
//
// 見せ方はこの街の言語に合わせる（css/style.css と1対1）:
//   切り抜いた輪郭に乗るシアンの縁光 / 走査線 / 端末カード / つながる瞬間の発光
// ============================================================

// 契約が許す瞬間。ここに無い名前を show() に渡したら hide 扱い。
export const TUTOR_MOMENTS = ['intro', 'hint', 'clear'];

// 端末が繋がっている相手。常に出す（対話していることが一目で分かるように）。
export const TUTOR_CHANNEL = 'NORA // ARCHIVE-04';

// 瞬間 → 回線の状態。CIVIS FIELD CONSOLE と同じ調子の一行。
export const TUTOR_TAG = {
  intro: 'LINK ESTABLISHED',
  hint:  'ADVISORY RECEIVED',
  clear: 'QUERY CONFIRMED'
};

// 瞬間 → 誰が何を言うか。
//   SELF は主人公の思考ログ。声に出していないので鉤括弧を付けない。
//   NORA は端末越しの応答。鉤括弧を付ける。
// 章やミッション側から差し替えたいときは show(moment, line) で渡せる。
export const TUTOR_LINES = {
  intro: { speaker: 'SELF', who: '思考',  text: '……NORAの答えではなく、記録そのものを見る。' },
  hint:  { speaker: 'NORA', who: 'NORA',  text: '「私の言葉を信じないでください。データを照会してください」' },
  clear: { speaker: 'NORA', who: 'NORA',  text: '「照会が通りました。この記録は、あなたが確かめたものです」' }
};

// 瞬間 → ポーズ。ポーズ名は CSS の #tutor[data-pose=...] と1対1。
// 素材は 2×2 のシート1枚。左上=満面の笑み / 右上=微笑み / 左下=話しかけ / 右下=沈む。
export const TUTOR_POSE = {
  intro: 'calm',      // 右上: 一緒に問題を読む微笑み
  hint:  'thinking',  // 左下: 話しかけている顔
  clear: 'happy'      // 左上: 満面の笑み（クリアの報酬）
};

// カットインの長さ(ms)。入り・流れ・抜けを全部含んだ実時間。
// クリアはごほうびなので少しだけ長い。
export const TUTOR_MS = {
  intro: 2200,
  hint:  2400,
  clear: 3000
};

// 立ち絵の素材。2×2 のスプライトシート1枚に4ポーズ（1コマは正方形）。
export const TUTOR_SHEET = 'assets/characters/tutor-sheet.webp';

export class Tutor {
  constructor(el, doc = document){
    this.el = el;
    this.doc = doc;
    this.stage = doc.getElementById('tutorStage');
    this.link = doc.getElementById('tutorLink');
    this.tag = doc.getElementById('tutorTag');
    this.who = doc.querySelector('#tutorLine .tutor-who');
    this.say = doc.querySelector('#tutorLine .tutor-say');
    this.moment = null;
    // 再生しきったら自分で退場する。触られて打ち切った場合はここには来ない。
    this.el?.addEventListener('animationend', () => this.hide());
    this.watchFloor();
  }

  // 画面下の操作列の高さを測って床にする。立ち絵はこの上に立つ。
  // 列の高さは章や画面で変わるので、変わるたびに測り直す。
  watchFloor(){
    const view = this.doc.defaultView;
    if(!view || !this.stage) return;
    const bar = this.doc.getElementById('actionBar');
    // 床の高さ = 舞台の下端から操作列の上端まで。
    // 高さではなく位置で測る。列の高さが同じでも、パネルの開閉で列が動くため。
    this.measureFloor = () => {
      if(!bar) return;
      const b = bar.getBoundingClientRect();
      if(b.height <= 0) return;
      const stage = this.stage.getBoundingClientRect();
      const floor = Math.max(0, Math.round(stage.bottom - b.top)) + 6;
      this.stage.style.setProperty('--tutor-floor', floor + 'px');
    };
    this.measureFloor();
    view.addEventListener('resize', this.measureFloor);
    if(bar && typeof view.ResizeObserver === 'function') new view.ResizeObserver(this.measureFloor).observe(bar);
  }

  show(moment, line){
    if(!this.el) return;
    if(!TUTOR_MOMENTS.includes(moment)){ this.hide(); return; }
    // 連続で呼ばれても最初から再生し直す。属性を外して強制的に再計算させる。
    delete this.doc.body.dataset.tutor;
    void this.el.offsetWidth;
    this.moment = moment;
    // パネルの開閉はトランジションで動く。落ち着くまで床を測り直す。
    this.measureFloor?.();
    const view = this.doc.defaultView || window;
    for(const ms of [140, 420]) view.setTimeout(() => { if(this.moment === moment) this.measureFloor?.(); }, ms);
    this.el.setAttribute('data-pose', TUTOR_POSE[moment]);
    // 端末カード: 回線の相手と状態、そして誰の言葉かを出す
    const said = line || TUTOR_LINES[moment] || { speaker: 'SELF', who: '思考', text: '' };
    if(this.tag) this.tag.textContent = '\u25E2 ' + TUTOR_CHANNEL + '  ' + (TUTOR_TAG[moment] || '');
    if(this.link) this.link.setAttribute('data-speaker', said.speaker);
    if(this.who) this.who.textContent = said.who;
    if(this.say) this.say.textContent = said.text;
    // 長さは舞台に置く。立ち絵・帯・ラベルが同じ拍で動く。
    (this.stage || this.el).style.setProperty('--tutor-ms', TUTOR_MS[moment] + 'ms');
    this.doc.body.dataset.tutor = moment;
  }

  hide(){
    if(!this.el) return;
    this.moment = null;
    delete this.doc.body.dataset.tutor;
  }

  // 編集が始まったら再生中でも打ち切る。
  // intro も hint もここで消える（編集中に立ち絵を出さないのが契約）。
  // clear は解答済みで編集操作自体が起きないため、ここには到達しない。
  onEdit(){
    if(this.moment === 'clear') return;
    this.hide();
  }

  get visible(){ return this.moment !== null; }
}
