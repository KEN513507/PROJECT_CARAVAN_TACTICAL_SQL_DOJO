// tools/aya-reveal-check.mjs
// ============================================================
// STORY CG CONTRACT のゲート (SSOT: js/story-cg.js)
//
//   如月アヤは CH4 の INNER JOIN を通すまで姿を見せない。
//   「見せない」は描画だけでなく読み込みも含む:
//     - CH1〜CH3 を遊んでいる間、aya-cg-*.webp へのリクエストが1本も出ない
//     - DOM に URL が現れない（background-image も src も）
//     - CSS のどこにも CG の URL が書かれていない（先読みを防ぐ）
//   CH4 をクリアした後だけ、解禁シーンでCGが出る。
//
//   伏線データ（ARCHIVE_SYNC_LOG）は逆に CH1〜CH3 で読めること。
//   ただし名前も顔も出さない（出るのは認証IDとNULLとエラーコードだけ）。
// ============================================================
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { BASE_URL, enterCampaign } from './onboarding-ui-helpers.mjs';
import { campaignProgress, storyStage, learningCompletedPayload } from './campaign-index.mjs';
import { STORY_CG, AYA_UNLOCK_CHAPTER, cgAllowed } from '../js/story-cg.js';
import { TABLES, STAGES, AYA_REVEAL, EPILOGUE } from '../js/data.js';
import { UIManager } from '../js/ui.js';

let failed = 0;
const check = (name, ok, detail = '') => {
  if(ok) console.log(`  PASS  ${name}`);
  else { failed++; console.log(`  FAIL  ${name}${detail ? '  -- ' + detail : ''}`); }
};

const AYA_FILE = /aya-cg-[a-z]+\.webp/;

// ---- 1. 静的: 台帳と参照のされ方 ----
console.log('[台帳]');
const ids = Object.keys(STORY_CG);
check('CGが4枚とも台帳にある', ids.length === 4, ids.join(','));
check('アヤのCGはすべて ch4 解禁', ids.every(id => STORY_CG[id].unlock === 'ch4'),
  ids.filter(id => STORY_CG[id].unlock !== 'ch4').join(','));
check('解禁前は許可されない', ids.every(id => !cgAllowed(id, false)));
check('解禁後は許可される', ids.every(id => cgAllowed(id, true)));
check('知らないidは許可されない', !cgAllowed('no-such-cg', true));

// 本物のレンダラ（js/ui.js の cgBlock）を直接呼ぶ。
// 迂回路を作らず、画面が通るのと同じ関数で確かめる。
const render = (art, unlocked) =>
  UIManager.prototype.cgBlock.call({ cgUnlocked: unlocked }, { art, text: 'テスト台詞' });
check('解禁前はDOMを作らない（空文字を返す）', ids.every(id => render(id, false) === ''),
  ids.filter(id => render(id, false) !== '').join(','));
check('解禁後はCGのURLを含むDOMを返す', ids.every(id => /aya-cg-[a-z]+\.webp/.test(render(id, true))));
check('解禁後は台詞も重ねて出す', /story-cg-line/.test(render('aya-appeal', true)));
check('台帳に無いidは解禁後でもDOMを作らない', render('no-such-cg', true) === '');

const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
check('CSSにCGのURLが書かれていない（先読み防止）', !AYA_FILE.test(css),
  (css.match(AYA_FILE) || []).join(','));

console.log('\n[物語への配置]');
const cgOf = content => content.blocks.filter(b => b.type === 'cg').map(b => b.art);
check('CH4解禁シーンは appeal 1枚', cgOf(AYA_REVEAL).join(',') === 'aya-appeal', cgOf(AYA_REVEAL).join(','));
check('エピローグは defiance / strain / withdraw の順',
  cgOf(EPILOGUE).join(',') === 'aya-defiance,aya-strain,aya-withdraw', cgOf(EPILOGUE).join(','));
check('台帳に無いCGを物語が指していない',
  [...cgOf(AYA_REVEAL), ...cgOf(EPILOGUE)].every(id => STORY_CG[id]));

console.log('\n[伏線データ]');
const log = TABLES.ARCHIVE_SYNC_LOG;
check('ARCHIVE_SYNC_LOG が在る', !!log);
if(log){
  const at = i => log.rows.find(r => r[0] === i);
  const col = n => log.cols.indexOf(n);
  const toMin = t => Number(t.split(':')[0]) * 60 + Number(t.split(':')[1]);
  const lost = at('A02'), restored = at('A06'), write = at('A03');
  check('同期の欠落が17分（OPENINGと一致）',
    toMin(restored[col('at')]) - toMin(lost[col('at')]) === 17,
    `${lost[col('at')]} → ${restored[col('at')]}`);
  check('53行が書き換えられた記録がある', write[col('affected_rows')] === '53', String(write[col('affected_rows')]));
  check('その実行者が NULL で残っている（欠損）', write[col('operator_id')] === null, String(write[col('operator_id')]));
  check('C773 が同じ時間帯に居た記録がある',
    log.rows.some(r => r[col('operator_id')] === 'C773'));
  check('C773 の持ち出しが拒否されている',
    log.rows.some(r => r[col('operator_id')] === 'C773' && String(r[col('result')]).startsWith('ERR')));
  check('伏線に名前は出てこない（認証IDだけ）',
    !log.rows.some(r => r.some(v => typeof v === 'string' && /アヤ|如月|AYA/.test(v))));
  const chapters = [0, 1, 2].map(i => STAGES[i].tables || []);
  check('CH1〜CH3 の全章で読める', chapters.every(t => t.includes('ARCHIVE_SYNC_LOG')),
    chapters.map(t => t.join('+')).join(' / '));
  check('CH1〜CH3 の解答SQLはこの表を使わない',
    [0, 1, 2].every(i => !(STAGES[i].answers || []).some(a => a.includes('ARCHIVE_SYNC_LOG'))));
}

// ---- 2. 実ブラウザ: CH1〜CH3 の間、1本も取りに行かないこと ----
const browser = await chromium.launch();
const requested = [];
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const page = await ctx.newPage();
page.on('request', r => { if(AYA_FILE.test(r.url())) requested.push(r.url()); });
const errors = [];
page.on('pageerror', e => errors.push(e.message));

// CH1〜CH3 を遊べる状態にして順に開く（CH4未クリア）
await page.addInitScript(([learning, progress]) => {
  localStorage.setItem('caravan_intro_seen', 'true');
  localStorage.setItem('caravan_tutorial_seen', 'true');
  localStorage.setItem('neon_relay_campaign_v2', JSON.stringify(learning));
  localStorage.setItem('caravan_progress', JSON.stringify(progress));
}, [learningCompletedPayload(),
    campaignProgress({ story: 0, xp: 0, storyCleared: [false, false, false, false, false, false] })]);

await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
await enterCampaign(page);

console.log('\n[CH1〜CH3 を開く（CH4未クリア）]');
for(let ch = 0; ch < AYA_UNLOCK_CHAPTER; ch++){
  await page.evaluate(i => window.__NEON_TEST__?.gotoStage?.(i), storyStage(ch));
  await page.waitForTimeout(400);
}
// テストフックが無い構成でも、少なくとも初期章は読み込んでいる
await page.waitForTimeout(300);
const domHasAya = await page.evaluate(() => /aya-cg-/.test(document.documentElement.innerHTML));
check('CH4クリア前にCGを1本も取りに行っていない', requested.length === 0, requested.join(', '));
check('CH4クリア前はDOMにCGのURLが無い', !domHasAya);
const unlockedNow = await page.evaluate(() => {
  const el = document.getElementById('storyOverlayBody');
  return el ? el.innerHTML.includes('aya-cg-') : false;
});
check('章末Overlayにも出ていない', !unlockedNow);

// ---- 3. CH4クリア済みなら出る ----
console.log('\n[CH4クリア済みで開く]');
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const p2 = await ctx2.newPage();
const requested2 = [];
p2.on('request', r => { if(AYA_FILE.test(r.url())) requested2.push(r.url()); });
await p2.addInitScript(([learning, progress]) => {
  localStorage.setItem('caravan_intro_seen', 'true');
  localStorage.setItem('caravan_tutorial_seen', 'true');
  localStorage.setItem('neon_relay_campaign_v2', JSON.stringify(learning));
  localStorage.setItem('caravan_progress', JSON.stringify(progress));
}, [learningCompletedPayload(),
    campaignProgress({ story: 4, xp: 400, storyCleared: [true, true, true, true, false, false] })]);
await p2.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
await enterCampaign(p2);
await p2.waitForTimeout(600);

const canRender = await p2.evaluate(async () => {
  const cg = await import('/js/story-cg.js');
  return cg.cgAllowed('aya-appeal', true) && !cg.cgAllowed('aya-appeal', false);
});
check('解禁判定がブラウザ側でも同じ結論を出す', canRender);
check('CH4クリア済みでも、開いていない章のCGは取りに行かない', requested2.length === 0, requested2.join(', '));
check('JSエラーが無い', errors.length === 0, errors.join(' | '));

await browser.close();
console.log(failed ? `\nAYA REVEAL GATE: FAIL (${failed})` : '\nAYA REVEAL GATE: PASS');
process.exit(failed ? 1 : 0);
