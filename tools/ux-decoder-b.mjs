// tools/ux-decoder-b.mjs
// UX Decoder B: 契約監査 (contract audit)
// window.__NEON_TEST__ のテストフックで各状態へ最短経路で到達し、
// DOM契約(mustBeVisible/Hidden, minHeight, minAreaRatio, タップ領域, ページスクロール,
// NORAレイアウトシフト)のみを高速に検証する。遷移の順序はAの役割であり、ここでは見ない。
//
// 事前に `python -m http.server 8000` でアプリを配信しておくこと。
//   node tools/ux-decoder-b.mjs

import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkContract, measureRect, summarize } from './ux-test-helpers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONTRACTS = JSON.parse(readFileSync(path.join(ROOT, 'tools/ux-contracts.json'), 'utf8'));

const BASE_URL = process.env.UX_BASE_URL || 'http://127.0.0.1:8000/';
const ARTIFACT_DIR = path.join(ROOT, 'tools/ux-artifacts/b');

const RIGHT = ['SELECT', 'resident_id', 'display_name', 'FROM', 'RESIDENT_CACHE',
  'WHERE', 'status', '=', "'MISSING'", 'AND', 'last_sector', '=', "'S4'"];

function currentPhase(raw){ return raw || 'AWAITING_QUERY'; }

async function newTestPage(browser, vp){
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.addInitScript(({ silenceMs }) => {
    window.__NEON_TEST_CONFIG__ = { enabled: true, evidenceSilenceMs: silenceMs };
  }, { silenceMs: CONTRACTS.testSilenceMs });
  page.on('dialog', d => d.dismiss());
  page.on('pageerror', e => console.log('PAGEERROR: ' + e.message));
  try {
    // networkidle は外部フォントと音源404の影響で並列実行時に不安定になるため使わない。
    // 準備完了の判定は後続の明示的な待機(#storyOverlay / #tokenPad .tok)で行う。
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  } catch(err){
    console.log('UX_DECODER = FAIL');
    console.log('REASON = server unavailable');
    console.log(`URL = ${BASE_URL}`);
    process.exit(1);
  }
  return { ctx, page };
}

// A/B並列実行時の負荷を考慮し、ブート待ちのみ余裕を持たせる（偽FAIL防止）。
const BOOT_TIMEOUT = 30000;

// 「Overlayが出現する瞬間」を待つと並列実行時に取りこぼすため、
// 出現したものを閉じ、到達すべき状態(Story Overlayが閉じ、NORAシートとトークンがある)をassertする。
async function dismissBoot(page){
  const overlay = await page.waitForSelector('#storyOverlay.show', { timeout: BOOT_TIMEOUT }).catch(() => null);
  if(overlay) await page.click('#storyContinueBtn');
  await page.waitForSelector('#storyOverlay.show', { state: 'hidden', timeout: BOOT_TIMEOUT });
  const tok = await page.waitForSelector('#tokenPad .tok', { timeout: BOOT_TIMEOUT }).catch(() => null);
  if(!tok){
    // 失敗原因を推測しないための診断ダンプ
    const diag = await page.evaluate(() => ({
      overlaySeen: !!document.querySelector('#storyOverlay.show'),
      sheetClass: (document.getElementById('ch1Sheet') || {}).className,
      sheetDisplay: document.getElementById('ch1Sheet') ? getComputedStyle(document.getElementById('ch1Sheet')).display : 'no-el',
      tokens: document.querySelectorAll('#tokenPad .tok').length,
      stageLabel: (document.getElementById('stageLabel') || {}).textContent,
      phase: document.body.dataset.phase, workspace: document.body.dataset.workspace,
      ch1ui: document.body.classList.contains('ch1-ui'),
      tutorialSeen: (() => { try { return localStorage.getItem('caravan_tutorial_seen'); } catch(e){ return 'err'; } })(),
      progress: (() => { try { return localStorage.getItem('caravan_progress'); } catch(e){ return 'err'; } })()
    })).catch(e => ({ evalError: e.message }));
    throw new Error('BOOT_DIAG ' + JSON.stringify(diag));
  }
}

// checkContract() (ux-test-helpers.mjs) には含まれない、Decoder B固有の追加契約検査。
async function checkMinTapHeight(page, contract){
  if(!contract.minTapHeight) return [];
  return page.evaluate((minH) => {
    // rect.height > 0 を「実際に画面上でタップしうる状態」の判定に使う。
    // display:none だけでなく、max-height:0/overflow:hiddenで畳まれた一時要素
    // (#retryBtn 等、常設しないOverlay系ボタン)も、この基準なら自然に除外できる。
    const els = [...document.querySelectorAll('.tok, .act, .predict-btn')]
      .filter(el => !el.disabled)
      .map(el => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0);
    return els.map(({ el, r }) => {
      const pass = r.height >= minH;
      return { check: `minTapHeight:${el.className.split(' ')[0]}"${el.textContent.trim().slice(0,10)}"`, pass, message: pass ? '' : `h=${Math.round(r.height)}` };
    });
  }, contract.minTapHeight);
}

async function checkOverlayBlocksBackground(page, contract){
  if(!contract.overlayBlocksBackground) return [];
  const info = await page.evaluate(() => {
    const el = document.getElementById('predictBar');
    if(!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { position: cs.position, x: r.x, y: r.y, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight };
  });
  if(!info) return [{ check: 'overlayBlocksBackground:#predictBar', pass: false, message: '#predictBar not found' }];
  const coversViewport = info.position === 'fixed' && info.x <= 0 && info.y <= 0 && info.w >= info.vw - 1 && info.h >= info.vh - 1;
  return [{ check: 'overlayBlocksBackground:#predictBar', pass: coversViewport, message: coversViewport ? '' : JSON.stringify(info) }];
}

async function runNoraShiftCheck(page, vpName){
  const targets = CONTRACTS.noraLayoutShift.targets;
  // セリフは自動表示されないため、🗣ボタンで開いてから閉じて、
  // 一時Overlayが通常Workspaceを押し潰していないことを比較する。
  await page.click('#noraBtn');
  await page.waitForSelector('#ch1Sheet.show', { timeout: 5000 });
  const before = {};
  for(const sel of targets) before[sel] = await measureRect(page, sel);
  await page.click('#ch1SheetPrimary');
  const after = {};
  for(const sel of targets) after[sel] = await measureRect(page, sel);
  const results = [];
  for(const sel of targets){
    const b = before[sel], a = after[sel];
    const dx = Math.abs((b?.x ?? 0) - (a?.x ?? 0));
    const dy = Math.abs((b?.y ?? 0) - (a?.y ?? 0));
    const shift = Math.max(dx, dy);
    const pass = shift <= CONTRACTS.noraLayoutShift.maxShiftPx;
    results.push({ viewport: vpName, state: 'NORA_SHIFT', check: `shift:${sel}<=${CONTRACTS.noraLayoutShift.maxShiftPx}px`, pass, message: pass ? '' : `shift=${shift.toFixed(1)}px` });
  }
  return results;
}

// ESモジュールの取得がテストサーバ側で落ちるとアプリが一度も起動しない（UIが構築されない）。
// 製品の不具合ではないため、ブートに限り作り直して再試行する。全試行が失敗したら失敗として報告する。
async function openBooted(browser, vp){
  let lastErr = null;
  for(let attempt = 1; attempt <= 3; attempt++){
    const { ctx, page } = await newTestPage(browser, vp);
    try {
      await dismissBoot(page);
      return { ctx, page };
    } catch(err){
      lastErr = err;
      await ctx.close().catch(() => {});
      console.log(`NOTE boot retry ${attempt}/3 (${vp.width}x${vp.height}): ${String(err.message).slice(0, 120)}`);
    }
  }
  throw lastErr;
}

async function runState(browser, vpName, vp, stateName, shotDir, results){
  const contract = CONTRACTS.states[stateName];
  const { ctx, page } = await openBooted(browser, vp);
  try {

    if(stateName === 'INSPECT'){
      // NORAシート表示中→クローズ後でレイアウトが動かないことも、このブート直後に検査する。
      results.push(...await runNoraShiftCheck(page, vpName));
    }

    if(stateName === 'COMPOSE'){
      await page.click(`.tok[data-token="${RIGHT[0]}"]`);
      await page.waitForFunction(() => document.body.dataset.phase === 'QUERY_DRAFTING', null, { timeout: 5000 });
    } else if(stateName === 'PREDICTION'){
      for(const t of RIGHT) await page.click(`.tok[data-token="${t}"]`, { timeout: 5000 });
      await page.click('#runBtn');
      await page.waitForSelector('#predictBar.show', { timeout: 5000 });
    } else if(stateName === 'EVIDENCE_SILENCE'){
      await page.evaluate(() => window.__NEON_TEST__.jumpToEvidence());
      await page.waitForFunction(() => document.body.dataset.phase === 'EVIDENCE_REVEALED', null, { timeout: 5000 });
    } else if(stateName === 'EVIDENCE_FINAL'){
      await page.evaluate(() => window.__NEON_TEST__.jumpToEvidence());
      await page.waitForFunction(() => document.body.dataset.phase === 'EVIDENCE_REVEALED', null, { timeout: 5000 });
      await page.waitForFunction(() => document.body.dataset.phase === 'CHAPTER_CLEARED', null, { timeout: CONTRACTS.testSilenceMs + 4000 });
    }

    if(contract.phase){
      const actual = currentPhase(await page.evaluate(() => document.body.dataset.phase));
      results.push({ viewport: vpName, state: stateName, check: `phase==${contract.phase}`, pass: actual === contract.phase, message: actual === contract.phase ? '' : `actual=${actual}` });
    }

    const contractResults = await checkContract(page, contract);
    for(const item of contractResults) results.push({ viewport: vpName, state: stateName, check: item.check, pass: item.pass, message: item.message });

    const tapResults = await checkMinTapHeight(page, contract);
    for(const item of tapResults) results.push({ viewport: vpName, state: stateName, check: item.check, pass: item.pass, message: item.message });

    const overlayResults = await checkOverlayBlocksBackground(page, contract);
    for(const item of overlayResults) results.push({ viewport: vpName, state: stateName, check: item.check, pass: item.pass, message: item.message });

    await page.screenshot({ path: path.join(shotDir, `${stateName}.png`) }).catch(() => {});
  } finally {
    await ctx.close();
  }
}

async function runViewport(browser, vpName, vp){
  const shotDir = path.join(ARTIFACT_DIR, vpName);
  mkdirSync(shotDir, { recursive: true });
  const t0 = Date.now();
  const results = [];
  for(const stateName of Object.keys(CONTRACTS.states)){
    await runState(browser, vpName, vp, stateName, shotDir, results);
  }
  const elapsedMs = Date.now() - t0;
  return { results, elapsedMs };
}

async function main(){
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const viewportEntries = Object.entries(CONTRACTS.viewports);
  const viewportReports = {};
  const allResults = [];

  try {
    // ビューポート並列実行で高速化
    const outcomes = await Promise.all(viewportEntries.map(([name, vp]) => runViewport(browser, name, vp)));
    viewportEntries.forEach(([name], i) => {
      const { results, elapsedMs } = outcomes[i];
      allResults.push(...results);
      viewportReports[name] = { elapsedMs, summary: summarize(results) };
    });
  } finally {
    await browser.close();
  }

  for(const r of allResults){
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  [${r.viewport}][${r.state}] ${r.check}${r.message ? '  ' + r.message : ''}`);
  }

  const summary = summarize(allResults);
  const report = {
    decoder: 'B',
    generatedAt: new Date().toISOString(),
    viewports: viewportReports,
    results: allResults,
    summary
  };
  writeFileSync(path.join(ARTIFACT_DIR, 'report.json'), JSON.stringify(report, null, 2));

  console.log('');
  console.log(`FAIL_COUNT: ${summary.fail}`);
  process.exit(summary.fail === 0 ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
