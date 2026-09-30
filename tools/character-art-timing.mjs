// tools/character-art-timing.mjs
// カットインの実測。記録係をページ読み込み前から常駐させ、フレーム単位で拾う。
//   set     : 出すと決めた瞬間（body[data-tutor] が付いた）
//   visible : 見えた（不透明度 > 0.5）
//   fading  : 抜けはじめ（不透明度 < 0.5 に戻った）
//   gone    : 完全に消えた（不透明度 < 0.02）
//   end     : 退場しきった（body[data-tutor] が外れた）
// 併せて、カットインの各コマを撮る（左→右に流れているのが分かるように）。
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { BASE_URL, source, run, reopen } from './onboarding-ui-helpers.mjs';

const DIR = 'tools/ux-artifacts/character';
mkdirSync(DIR, { recursive: true });

const RECORDER = () => {
  window.__tutor = [];
  const start = () => {
    const el = document.getElementById('tutor');
    if(!el) return;
    const mark = (ev, extra) => window.__tutor.push({ ev, t: performance.now(), ...extra });
    let on = false, seen = false;
    const tick = () => {
      const cs = getComputedStyle(el);
      const o = Number(cs.opacity);
      const x = new DOMMatrixReadOnly(cs.transform).m41;   // 横位置(px)
      const now = !!document.body.dataset.tutor;
      if(now !== on){
        on = now; mark(now ? 'set' : 'end', { x: Math.round(x) });
        requestAnimationFrame(tick); return;
      }
      if(!seen && o > 0.5){ seen = true; mark('visible', { x: Math.round(x) }); }
      else if(seen && o < 0.5){ seen = false; mark('fading', { x: Math.round(x) }); }
      const wasVisible = window.__tutor.some(m => m.ev === 'visible');
      if(wasVisible && !seen && o < 0.02 && !window.__tutor.some(m => m.ev === 'gone')) mark('gone', { x: Math.round(x) });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    window.__tutorReset = () => { window.__tutor.length = 0; seen = false; on = !!document.body.dataset.tutor; };
    document.addEventListener('click', () => mark('tap'), true);
  };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start();
};

const read = page => page.evaluate(() => window.__tutor.map(m => ({ ...m, t: Math.round(m.t) })));
const clear = page => page.evaluate(() => window.__tutorReset());
const sec = ms => (ms / 1000).toFixed(2) + ' 秒';
const first = (list, ev) => list.find(m => m.ev === ev);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
await context.addInitScript(RECORDER);
const page = await context.newPage();
const motion = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches).catch(() => null);

// ---------- 1. 問題冒頭のカットイン ----------
await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
await page.locator('#monitor .query-token').first().waitFor();
await page.waitForFunction(() => window.__tutor.some(m => m.ev === 'set'), null, { timeout: 10000 });
const setT = (await read(page)).find(m => m.ev === 'set').t;

console.log('【問題冒頭のカットイン】出すと決めた瞬間からの経過ごとに撮影');
for(const ms of [120, 300, 800, 1500, 2000, 2200]){
  await page.waitForFunction(t => performance.now() >= t, setT + ms, { timeout: 15000 });
  await page.screenshot({ path: `${DIR}/cutin-${String(ms).padStart(4, '0')}ms.png` });
  const st = await page.evaluate(() => {
    const cs = getComputedStyle(document.getElementById('tutor'));
    return { o: Number(cs.opacity).toFixed(2), x: Math.round(new DOMMatrixReadOnly(cs.transform).m41) };
  });
  console.log(`  ${(ms / 1000).toFixed(2)}秒  不透明度 ${st.o}  横位置 ${String(st.x).padStart(5)}px`);
}
await page.waitForFunction(() => window.__tutor.some(m => m.ev === 'end'), null, { timeout: 10000 });
const intro = await read(page);
const g = ev => first(intro, ev);
console.log('\n  出すと決めてから見えるまで（急な入り）  ' + sec(g('visible').t - g('set').t));
console.log('  見えてから抜けはじめるまで（スロー）    ' + sec(g('fading').t - g('visible').t));
console.log('  抜けはじめから消えるまで（急な抜け）    ' + sec(g('gone').t - g('fading').t));
console.log('  ■ カットイン全体の実時間                ' + sec(g('end').t - g('set').t));
console.log('  横の移動量 ' + g('set').x + 'px → ' + g('end').x + 'px');

// ---------- 2. 編集したら何秒で打ち切られるか ----------
await reopen(page);
await page.locator('#monitor .query-token').first().waitFor();
await page.waitForFunction(() => window.__tutor.some(m => m.ev === 'visible'), null, { timeout: 10000 });
await clear(page);
await source(page, 0);                                  // 表の列をタップ＝最初の編集操作
await page.waitForFunction(() => window.__tutor.some(m => m.ev === 'gone'), null, { timeout: 10000 });
const edit = await read(page);
const tapM = first(edit, 'tap');
console.log('\n【再生中に編集した】押された瞬間からの経過');
console.log('  打ち切りまで（アプリの反応）            ' + sec(first(edit, 'end').t - tapM.t));
console.log('  ■ 完全に消えるまで                      ' + sec(first(edit, 'gone').t - tapM.t));

// ---------- 3. ヒント / クリアも同じカットイン ----------
for(const [label, open, shot] of [
  ['ヒント', async () => page.locator('#hintBtn').click(), 'cutin-hint.png'],
  ['クリア', async () => run(page), 'cutin-clear.png']
]){
  await clear(page);
  await open();
  await page.waitForFunction(() => window.__tutor.some(m => m.ev === 'visible'), null, { timeout: 10000 });
  await page.screenshot({ path: `${DIR}/${shot}` });
  await page.waitForFunction(() => window.__tutor.some(m => m.ev === 'end'), null, { timeout: 10000 });
  const list = await read(page);
  console.log(`\n【${label}】カットイン全体の実時間            ` + sec(first(list, 'end').t - first(list, 'set').t));
  if(label === 'ヒント'){
    console.log('  ヒント本文は残っているか                ' + (await page.locator('#hintLine').isVisible() ? 'はい' : 'いいえ'));
    await page.locator('#hintBtn').click();
  }
}

console.log(`\n測定ブラウザの prefers-reduced-motion: ${motion ? 'reduce（横移動なし）' : 'no-preference（横移動あり）'}`);
console.log('スクリーンショット: ' + DIR);
await browser.close();
