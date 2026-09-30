// tools/bgm-crossfade-test.mjs
// ============================================================
// BGM CONTRACT のゲート (SSOT: js/bgm.js)
//
//   ループの継ぎ目でぶつ切りにしない（旧を落としながら新を重ねる）
//   曲の切り替えでもぶつ切りにしない
//   重ねている間に音量がへこまない（equal-power で繋ぐ）
//   <audio> は1曲あたり最大2本。2本目は継ぎ目が近づくまで作らない
//   前の曲の要素は落としきったら src を外して解放する
//   鳴らすものが無ければタイマーを止める
//
// 本物の音は鳴らさない。<audio> の代わりを置いて、時刻と音量だけを実時間で追う。
// ============================================================
import assert from 'node:assert/strict';

// ---- <audio> の代わり。再生位置は実時間から計算する ----
class FakeAudio {
  static created = [];
  constructor(src){
    this.src = src;
    this.volume = 1;
    this.paused = true;
    this.duration = 3;          // 短い曲にして継ぎ目をすぐ迎える
    this.loop = false;
    this.muted = false;
    this.preload = '';
    this._at = 0;
    this._t0 = 0;
    FakeAudio.created.push(this);
  }
  get currentTime(){ return this.paused ? this._at : (performance.now() - this._t0) / 1000; }
  set currentTime(v){ this._at = v; this._t0 = performance.now() - v * 1000; }
  addEventListener(){}
  removeAttribute(name){ if(name === 'src') this.src = ''; }
  load(){}
  play(){ this._t0 = performance.now() - this._at * 1000; this.paused = false; return Promise.resolve(); }
  pause(){ this._at = this.currentTime; this.paused = true; }
  get playing(){ return !this.paused; }
}

globalThis.Audio = FakeAudio;
globalThis.navigator = globalThis.navigator || {};
globalThis.window = globalThis.window || {};

const { BgmEngine, CROSSFADE_MS, SWITCH_MS } = await import('../js/bgm.js');

const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, detail = '') => {
  if(ok) console.log(`  PASS  ${name}`);
  else { failed++; console.log(`  FAIL  ${name}${detail ? '  -- ' + detail : ''}`); }
};

const live = () => FakeAudio.created.filter(a => a.src);
const playing = () => FakeAudio.created.filter(a => a.playing && a.src);

// 継ぎ目は min(CROSSFADE_MS, duration*250) = 750ms（duration 3秒）
const SEAM_MS = Math.min(CROSSFADE_MS, 3 * 250);

const bgm = new BgmEngine();
bgm.unlock();

// ---------- 1. 立ち上がり ----------
console.log('[立ち上がり]');
bgm.play('airy');
check('いきなり全音量で鳴らさない', bgm.current.volume < bgm.volume * 0.2, String(bgm.current.volume));
check('ネイティブループは使わない（継ぎ目を自前で繋ぐため）', bgm.current.loop === false);
check('最初は <audio> 1本だけ', live().length === 1, String(live().length));
await sleep(SWITCH_MS + 150);
check('フェードインしきると通常音量', Math.abs(bgm.current.volume - bgm.volume) < 0.01, String(bgm.current.volume));

// ---------- 2. ループの継ぎ目 ----------
console.log('[ループの継ぎ目]');
const first = bgm.current;
// 継ぎ目の少し手前へ飛ばす
first.currentTime = 3 - (SEAM_MS / 1000) - 0.25;
let overlapped = 0, minSum = Infinity, sawBothMoving = false;
for(let i = 0; i < 40; i++){
  await sleep(40);
  const on = playing();
  if(on.length === 2){
    overlapped++;
    const sum = on.reduce((s, a) => s + a.volume, 0);
    minSum = Math.min(minSum, sum);
    if(on.every(a => a.volume > 0.01)) sawBothMoving = true;
  }
}
check('継ぎ目で2本が重なって鳴る', overlapped > 0, `重なったフレーム ${overlapped}`);
check('重なっている間は両方とも音が出ている', sawBothMoving);
check('重ねている最中に音量がへこまない', minSum >= bgm.volume * 0.92, `最小合計 ${minSum.toFixed(3)} / 通常 ${bgm.volume}`);
check('<audio> は2本までしか作らない', live().length <= 2, String(live().length));
const after = bgm.current;
check('継ぎ目のあとは頭から鳴っている', after !== first && after.currentTime < 3, String(after.currentTime.toFixed(2)));
check('継ぎ目のあと鳴っているのは1本', playing().length === 1, String(playing().length));
check('継ぎ目のあと音量は通常に戻る', Math.abs(after.volume - bgm.volume) < 0.02, String(after.volume.toFixed(3)));
check('使い終わった要素は解放せず作り直さない（2本を使い回す）', FakeAudio.created.filter(a => a.src).length === 2);

// ---------- 3. 曲の切り替え ----------
console.log('[曲の切り替え]');
const before = bgm.current;
const madeBefore = FakeAudio.created.length;
bgm.play('urgent');
await sleep(120);
check('旧曲はすぐ止めずに落としながら鳴らす', before.playing && before.volume < bgm.volume, String(before.volume.toFixed(3)));
check('新曲は無音から上げる', bgm.current.volume < bgm.volume, String(bgm.current.volume.toFixed(3)));
check('切り替えた瞬間は新旧が重なる', playing().length >= 2, String(playing().length));
await sleep(SWITCH_MS + 250);
check('旧曲は落としきったら解放する', !before.src, before.src);
check('切り替え後に残る <audio> は1本', live().length === 1, String(live().length));
check('新曲は通常音量まで上がる', Math.abs(bgm.current.volume - bgm.volume) < 0.02, String(bgm.current.volume.toFixed(3)));
check('新曲のために作った要素は1本だけ', FakeAudio.created.length - madeBefore === 1, String(FakeAudio.created.length - madeBefore));

// ---------- 4. 同じ曲をもう一度指定しても鳴らし直さない ----------
console.log('[同じ曲の指定]');
const keep = bgm.current;
const madeBeforeSame = FakeAudio.created.length;
bgm.play('urgent');
check('同じ曲なら鳴らし直さない', bgm.current === keep);
check('要素も増やさない', FakeAudio.created.length === madeBeforeSame);

// ---------- 5. ダッキング ----------
console.log('[ダッキング]');
// ここでは継ぎ目を挟みたくない。曲を長くして測定中にループさせない。
for(const a of FakeAudio.created) a.duration = 60;
bgm.current.currentTime = 0;
bgm.duck(400);
await sleep(300);
const ducked = bgm.current.volume;
check('会話中は音量が下がる', ducked < bgm.volume * 0.5, ducked.toFixed(3));
await sleep(900);
check('ダッキングのあと元の音量へ戻る', Math.abs(bgm.current.volume - bgm.volume) < 0.02, bgm.current.volume.toFixed(3));
check('ダッキングで曲は切れない', bgm.current.playing);

// ---------- 6. 停止と後始末 ----------
console.log('[停止と後始末]');
bgm.stop();
await sleep(SWITCH_MS + 250);
check('停止したら全部解放する', live().length === 0, String(live().length));
check('やることが無ければタイマーを止める', bgm.timer === null, String(bgm.timer));
check('進行中のフェードも残らない', bgm.fades.length === 0, String(bgm.fades.length));

console.log(failed ? `\nBGM CROSSFADE GATE: FAIL (${failed})` : '\nBGM CROSSFADE GATE: PASS');
process.exit(failed ? 1 : 0);
