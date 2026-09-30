// js/shell.js
// ============================================================
// SHELL（アプリの一番外側）の画面。
// 状態遷移は js/shell-state.js が持つ。ここは「今の画面を描く」「操作を投げる」
// 「遷移が頼んできた仕事を外へ渡す」の3つだけをやる。判断はしない。
//
// 外との接点は ports だけ。保存も音もキャンペーン本体もここには入れない。
//   hasSave()      : 続きがあるか
//   saveSummary()  : 続きの場所を一言で（スタート画面に出す）
//   wipe()         : 保存を消す
//   start()        : 最初から始める
//   resume()       : 保存から再開する
//   leave()        : 遊びを畳んでタイトルへ戻る
//   settings       : 設定項目の読み書き（{ read(), write(key, value) }）
// ============================================================
import { Screen, Event, Effect, initial, reduce, options } from './shell-state.js?v=20260929-shell';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' })[c]);

// 画面に出す操作の見た目。順番もここが持つ。
const ACTIONS = [
  { event: Event.CONTINUE,      label: 'つづきから',   icon: '▶', kind: 'primary' },
  { event: Event.NEW_GAME,      label: 'はじめから',   icon: '✦', kind: 'normal'  },
  { event: Event.OPEN_SETTINGS, label: '設定',         icon: '⚙', kind: 'quiet'   }
];

export class Shell {
  constructor(root, ports = {}){
    this.root = root;
    this.ports = ports;
    this.state = initial();
    this.root.addEventListener('click', e => {
      const btn = e.target.closest('[data-shell-event]');
      if(btn) this.send(btn.getAttribute('data-shell-event'));
    });
    this.root.addEventListener('input', e => {
      const el = e.target.closest('[data-setting]');
      if(!el) return;
      this.ports.settings?.write(el.getAttribute('data-setting'),
        el.type === 'checkbox' ? el.checked : Number(el.value));
      // 動かしている数値はその場で出す（描き直すとつまみが飛ぶので値だけ差し替える）
      const out = el.parentElement?.querySelector('.shell-row-value');
      if(out && el.type === 'range') out.textContent = el.value;
    });
  }

  // 文脈。遷移の条件（保存があるか）はここから渡す。
  ctx(){ return { hasSave: !!this.ports.hasSave?.() }; }

  begin(){ this.send(Event.READY); }

  send(event){
    const next = reduce(this.state, event, this.ctx());
    if(!next) return false;            // その画面で起きない操作は黙って捨てる
    this.state = next.state;
    for(const fx of next.effects) this.perform(fx);
    this.render();
    return true;
  }

  perform(fx){
    if(fx === Effect.WIPE)   this.ports.wipe?.();
    if(fx === Effect.START)  this.ports.start?.();
    if(fx === Effect.RESUME) this.ports.resume?.();
    if(fx === Effect.LEAVE)  this.ports.leave?.();
  }

  render(){
    const screen = this.state.screen;
    document.body.dataset.shell = screen;
    // PLAY はキャンペーン本体が画面。シェルは引っ込む。
    if(screen === Screen.PLAY || screen === Screen.BOOT){
      this.root.hidden = true;
      this.root.innerHTML = '';
      return;
    }
    this.root.hidden = false;
    this.root.innerHTML =
      screen === Screen.TITLE       ? this.title() :
      screen === Screen.SETTINGS    ? this.settings() :
      screen === Screen.CONFIRM_NEW ? this.confirmNew() : '';
    this.root.querySelector('button')?.focus?.();
  }

  // ---- スタート画面 ----
  title(){
    const can = new Set(options(this.state, this.ctx()));
    const summary = this.ports.saveSummary?.();
    const buttons = ACTIONS.filter(a => can.has(a.event)).map(a => `
      <button type="button" class="shell-btn ${a.kind}" data-shell-event="${a.event}">
        <span class="shell-ico" aria-hidden="true">${a.icon}</span>
        <span class="shell-label">${a.label}</span>
        ${a.event === Event.CONTINUE && summary ? `<span class="shell-sub">${esc(summary)}</span>` : ''}
      </button>`).join('');
    return `
      <div class="shell-screen shell-title">
        <div class="shell-brand">
          <p class="shell-eyebrow">CIVIS FIELD CONSOLE</p>
          <h1 class="shell-logo">NEON RELAY</h1>
          <p class="shell-tag">照会で街を読み解く</p>
        </div>
        <nav class="shell-menu">${buttons}</nav>
      </div>`;
  }

  // ---- 設定画面 ----
  settings(){
    const s = this.ports.settings?.read?.() || {};
    // 「タイトルへ戻る」は遊んでいる途中で開いたときだけ出る（遷移表が決める）。
    const quit = options(this.state, this.ctx()).includes(Event.QUIT);
    return `
      <div class="shell-screen shell-settings">
        <header class="shell-head">
          <button type="button" class="shell-back" data-shell-event="${Event.BACK}">← 戻る</button>
          <h2>設定</h2>
        </header>
        <div class="shell-rows">
          <label class="shell-row">
            <span class="shell-row-name">音を鳴らす</span>
            <input type="checkbox" data-setting="sound" ${s.sound ? 'checked' : ''}>
            <span class="shell-switch" aria-hidden="true"></span>
          </label>
          <label class="shell-row shell-row-range">
            <span class="shell-row-name">BGMの音量</span>
            <input type="range" min="0" max="100" step="5" data-setting="bgmVolume" value="${Number(s.bgmVolume) || 0}">
            <span class="shell-row-value">${Number(s.bgmVolume) || 0}</span>
          </label>
          <label class="shell-row">
            <span class="shell-row-name">問題文を最初から表示</span>
            <input type="checkbox" data-setting="missionVisible" ${s.missionVisible ? 'checked' : ''}>
            <span class="shell-switch" aria-hidden="true"></span>
          </label>
        </div>
        <p class="shell-note">設定はこの端末に保存されます。進捗には影響しません。</p>
        ${quit ? `
        <div class="shell-choices">
          <button type="button" class="shell-btn quiet" data-shell-event="${Event.QUIT}">
            <span class="shell-label">タイトルへ戻る</span>
          </button>
        </div>` : ''}
      </div>`;
  }

  // ---- ニューゲームの上書き確認 ----
  confirmNew(){
    const summary = this.ports.saveSummary?.();
    return `
      <div class="shell-screen shell-confirm">
        <h2>はじめから始めますか？</h2>
        <p class="shell-warn">今の続き${summary ? `（${esc(summary)}）` : ''}は消えます。元に戻せません。</p>
        <div class="shell-choices">
          <button type="button" class="shell-btn danger" data-shell-event="${Event.CONFIRM}">消して始める</button>
          <button type="button" class="shell-btn quiet" data-shell-event="${Event.CANCEL}">やめる</button>
        </div>
      </div>`;
  }
}
