// tools/bgm-browser-check.mjs
// ============================================================
// BGM CONTRACT を本物のブラウザ・本物の音源で確かめる。
// （tools/bgm-crossfade-test.mjs は <audio> の代わりを置いた論理の検証。
//   こちらは実際に再生し、Web Audio のゲインが重なって動くかを見る）
//
//   実際に再生位置が進むか
//   ループの継ぎ目で2本が重なり、片方が上がり片方が下がるか
//   重なっている間に音量の合計がへこまないか
//   曲を切り替えたとき新旧が重なるか / 旧曲が解放されるか
//   iOS 対策の GainNode 経路が実際に張られているか
// ============================================================
import { chromium } from 'playwright';
import { BASE_URL } from './onboarding-ui-helpers.mjs';

let failed = 0;
const check = (name, ok, detail = '') => {
  if(ok) console.log(`  PASS  ${name}`);
  else { failed++; console.log(`  FAIL  ${name}${detail ? '  -- ' + detail : ''}`); }
};

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

// アプリとは別に、素の BgmEngine を本物の音源で動かす
await page.evaluate(async base => {
  const m = await import(base + 'js/bgm.js');
  const e = new m.BgmEngine();
  e.unlock();
  window.__bgm = e;
  window.__const = { CROSSFADE_MS: m.CROSSFADE_MS, SWITCH_MS: m.SWITCH_MS };
}, BASE_URL);

const snap = () => page.evaluate(() => {
  const e = window.__bgm;
  const of = a => a && a.src ? {
    time: Number(a.currentTime.toFixed(2)),
    playing: !a.paused,
    gain: a._gain ? Number(a._gain.gain.value.toFixed(3)) : null,
    vol: Number(a.volume.toFixed(3))
  } : null;
  return {
    name: e.currentName,
    routed: !!e.ctx,
    ctxState: e.ctx?.state ?? null,
    live: [...e.audioElements].filter(a => a.src).length,
    deck: e.deck ? e.deck.a.map(of) : null,
    i: e.deck?.i ?? null,
    volume: e.volume
  };
});
const sleep = ms => page.waitForTimeout(ms);

// 継ぎ目は自然に迎えさせる。テスト用の静的サーバは Range に対応しておらず
// 曲の途中へシークできないため、いちばん短い音源(約5.9秒)をループさせて待つ。
console.log('[再生]');
await page.evaluate(() => window.__bgm.play('victory', true));
await sleep(300);
let s = await snap();
check('GainNode 経路が張られている（iOSでも音量を動かせる）', s.routed && s.deck[0].gain !== null, JSON.stringify(s.deck[0]));
check('AudioContext が動いている', s.ctxState === 'running', String(s.ctxState));
const t1 = (await snap()).deck[0].time;
await sleep(600);
const t2 = (await snap()).deck[0].time;
check('実際に再生位置が進んでいる', t2 > t1, `${t1} → ${t2}`);
await sleep(700);
s = await snap();
check('フェードインしきると通常音量', Math.abs(s.deck[0].gain - s.volume) < 0.01, String(s.deck[0].gain));
check('最初は <audio> 1本だけ', s.live === 1, String(s.live));

console.log('[ループの継ぎ目]');
const seamMs = await page.evaluate(() => {
  const a = window.__bgm.deck.a[window.__bgm.deck.i];
  return Math.min(window.__const.CROSSFADE_MS, a.duration * 250);
});
console.log('  （重ねる長さ ' + Math.round(seamMs) + 'ms。自然に継ぎ目を迎えるまで待つ）');
let overlap = 0, minSum = Infinity, sawRise = false, sawFall = false;
let prev = null;
for(let i = 0; i < 90; i++){
  await sleep(50);
  const st = await snap();
  if(!st.deck) continue;
  const on = st.deck.filter(d => d && d.playing);
  if(on.length === 2){
    overlap++;
    minSum = Math.min(minSum, on.reduce((x, d) => x + d.gain, 0));
    if(prev && prev.length === 2){
      if(on.some((d, k) => d.gain > prev[k].gain + 0.005)) sawRise = true;
      if(on.some((d, k) => d.gain < prev[k].gain - 0.005)) sawFall = true;
    }
    prev = on;
  } else prev = null;
}
check('継ぎ目で2本が重なって鳴る', overlap > 0, `重なったフレーム ${overlap}`);
check('片方が上がり、片方が下がる', sawRise && sawFall, `上がり:${sawRise} 下がり:${sawFall}`);
check('重ねている最中に音量がへこまない', overlap > 0 && minSum >= 0.25 * 0.92, `最小合計 ${minSum === Infinity ? '-' : minSum.toFixed(3)}`);
s = await snap();
check('<audio> は2本までしか作らない', s.live <= 2, String(s.live));
check('継ぎ目のあとは頭から鳴っている', s.deck[s.i].time < 3, String(s.deck[s.i].time));
check('継ぎ目のあと鳴っているのは1本', s.deck.filter(d => d && d.playing).length === 1);
check('継ぎ目のあと音量は通常に戻る', Math.abs(s.deck[s.i].gain - s.volume) < 0.02, String(s.deck[s.i].gain));

console.log('[曲の切り替え]');
await page.evaluate(() => { window.__prev = window.__bgm.deck.a[window.__bgm.deck.i]; window.__bgm.play('urgent'); });
await sleep(250);
const mid = await page.evaluate(() => {
  const e = window.__bgm, p = window.__prev;
  return { oldPlaying: !p.paused, oldGain: p._gain ? p._gain.gain.value : null,
           newGain: e.deck.a[e.deck.i]._gain.gain.value, name: e.currentName };
});
check('旧曲は落としながらまだ鳴っている', mid.oldPlaying && mid.oldGain < 0.25, JSON.stringify(mid));
check('新曲は無音から上がっていく', mid.newGain > 0 && mid.newGain < 0.25, String(mid.newGain.toFixed(3)));
check('曲名が切り替わっている', mid.name === 'urgent', mid.name);
await sleep(1200);
s = await snap();
const released = await page.evaluate(() => !window.__prev.src);
check('旧曲は落としきったら解放する', released);
check('切り替え後に残る <audio> は1本', s.live === 1, String(s.live));
check('新曲は通常音量まで上がる', Math.abs(s.deck[s.i].gain - s.volume) < 0.02, String(s.deck[s.i].gain));

console.log('[停止と後始末]');
await page.evaluate(() => window.__bgm.stop());
await sleep(1300);
s = await snap();
const idle = await page.evaluate(() => ({ timer: window.__bgm.timer, fades: window.__bgm.fades.length }));
check('停止したら全部解放する', s.live === 0, String(s.live));
check('やることが無ければタイマーを止める', idle.timer === null, String(idle.timer));
check('進行中のフェードも残らない', idle.fades === 0, String(idle.fades));
check('JSエラーが無い', errors.length === 0, errors.join(' | '));

await browser.close();
console.log(failed ? `\nBGM BROWSER GATE: FAIL (${failed})` : '\nBGM BROWSER GATE: PASS');
process.exit(failed ? 1 : 0);
