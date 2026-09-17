// tools/ux-decoder-a.mjs
// UX Decoder A: 遷移監査 (transition audit)
// 実プレイヤーに近い順序でCH1を通し、状態機械の流れが期待どおりの順序で
// 変化するかを検証する。DOM契約もあわせて各状態で検査するが、
// 「遷移の順序」の検証こそがAの主目的であり、Bとは異なるものを検出する。
//
// ChapterSessionは Domain、Decoderは外部観測者。Decoderは以下のみを読む:
//   - document.body.dataset.phase       (Appが同期する現在値)
//   - window.__NEON_TEST_PHASE_LOG__    (App が記録する全遷移ログ)
//   - DOM visibility / rect
// Decoderは ChapterSession object を取得しない・購読しない・直接書き換えない。
//
// 事前に `python -m http.server 8000` (または UX_BASE_URL) でアプリを配信しておくこと。
//   node tools/ux-decoder-a.mjs

import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkContract, summarize } from './ux-test-helpers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONTRACTS = JSON.parse(readFileSync(path.join(ROOT, 'tools/ux-contracts.json'), 'utf8'));

const BASE_URL = process.env.UX_BASE_URL || 'http://127.0.0.1:8000/';
const ARTIFACT_DIR = path.join(ROOT, 'tools/ux-artifacts/a');

const HAPPY_ORDER = ['QUERY_DRAFTING', 'AWAITING_PREDICTION', 'QUERY_EXECUTING', 'EVIDENCE_REVEALED', 'CHAPTER_CLEARED'];
const REJECT_ORDER = ['QUERY_DRAFTING', 'AWAITING_PREDICTION', 'QUERY_EXECUTING', 'QUERY_REJECTED', 'QUERY_DRAFTING'];
const CANCEL_ORDER = ['QUERY_DRAFTING', 'AWAITING_PREDICTION', 'QUERY_DRAFTING'];

// CH1正解クエリのタップ順 (tools/ch1-mobile-check.js の RIGHT と同一)
const RIGHT = ['SELECT', 'resident_id', 'display_name', 'FROM', 'RESIDENT_CACHE',
  'WHERE', 'status', '=', "'MISSING'", 'AND', 'last_sector', '=', "'S4'"];
// 誤答: 最後の値を条件に合わない値へ差し替える
const WRONG = [...RIGHT.slice(0, -1), "'MISSING'"];

async function newTestPage(browser, vp, jsErrors){
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.addInitScript(({ silenceMs }) => {
    window.__NEON_TEST_CONFIG__ = { enabled: true, evidenceSilenceMs: silenceMs };
  }, { silenceMs: CONTRACTS.testSilenceMs });
  page.on('dialog', d => d.dismiss());
  if(jsErrors) page.on('pageerror', e => jsErrors.push(e.message));
  return { ctx, page };
}

async function gotoOrFail(page){
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
}

// A/Bを並列実行するとブラウザ2つ分の負荷がかかり、CIVIS boot(1.5s)＋フォント読込で
// 10秒では足りずに偽FAILすることがある。ブート待ちだけ余裕を持たせる。
const BOOT_TIMEOUT = 30000;

// ブート演出(CIVIS boot → Opening Story → NORAシート)を閉じる。
// 「Overlayが出現する瞬間」を待つと並列実行時に取りこぼすため、
// 出現したものを閉じ、最後に「到達すべき状態」を assert する方式にする。
async function dismissBoot(page){
  const overlay = await page.waitForSelector('#storyOverlay.show', { timeout: BOOT_TIMEOUT }).catch(() => null);
  if(overlay) await page.click('#storyContinueBtn');
  // セリフは自動表示されない（🗣ボタンからのみ）。万一開いていれば閉じる。
  if(await page.isVisible('#ch1Sheet.show').catch(() => false)) await page.click('#ch1SheetPrimary');
  // ブートが完了していること: Story Overlayが閉じ、トークンが操作可能であること
  await page.waitForSelector('#storyOverlay.show', { state: 'hidden', timeout: BOOT_TIMEOUT });
  const tok = await page.waitForSelector('#tokenPad .tok', { timeout: BOOT_TIMEOUT }).catch(() => null);
  if(!tok){
    const diag = await page.evaluate(() => ({
      uiBuilt: !!document.getElementById('ch1Sheet'),
      tokens: document.querySelectorAll('#tokenPad .tok').length,
      phase: document.body.dataset.phase, workspace: document.body.dataset.workspace
    })).catch(e => ({ evalError: e.message }));
    throw new Error('BOOT_DIAG ' + JSON.stringify(diag));
  }
}

// ESモジュール取得がテストサーバ側で落ちるとアプリが起動しない。ブートのみ再試行する。
async function openBooted(browser, vp, jsErrors){
  let lastErr = null;
  for(let attempt = 1; attempt <= 3; attempt++){
    const { ctx, page } = await newTestPage(browser, vp, jsErrors);
    try {
      await gotoOrFail(page);
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

function currentPhase(raw){ return raw || 'AWAITING_QUERY'; } // 初期状態はPhaseChangedを発火しないための補正

async function waitForPhase(page, phase, timeout = 8000){
  await page.waitForFunction(p => (document.body.dataset.phase || 'AWAITING_QUERY') === p, phase, { timeout });
}

async function readPhaseLog(page){
  return page.evaluate(() => (window.__NEON_TEST_PHASE_LOG__ || []).map(e => e.phase));
}

async function runContractAt(page, viewport, stateName, results, shotDir, shotLabel){
  const contract = CONTRACTS.states[stateName];
  if(!contract) return;
  const r = await checkContract(page, contract);
  for(const item of r){
    results.push({ viewport, state: stateName, check: item.check, pass: item.pass, message: item.message });
  }
  await page.screenshot({ path: path.join(shotDir, `${shotLabel}.png`) }).catch(() => {});
}

function pushOrderCheck(results, viewport, flow, expected, observed){
  const ok = expected.every((p, i) => observed[i] === p) && observed.length >= expected.length;
  results.push({
    viewport, state: 'TRANSITION', check: `${flow}:order:${expected.join('->')}`,
    pass: ok, message: ok ? '' : `observed=${observed.join('->')}`
  });
}

// ---- HAPPY PATH: AWAITING_QUERY → ... → CHAPTER_CLEARED ----
async function runHappyPath(browser, vpName, vp, shotDir, results, jsErrors){
  const { ctx, page } = await openBooted(browser, vp, jsErrors);
  try {

    await runContractAt(page, vpName, 'INSPECT', results, shotDir, 'happy-01-INSPECT');
    results.push({
      viewport: vpName, state: 'TRANSITION', check: 'happy:phase:initial=AWAITING_QUERY',
      pass: currentPhase(await page.evaluate(() => document.body.dataset.phase)) === 'AWAITING_QUERY',
      message: ''
    });

    await page.click(`.tok[data-token="${RIGHT[0]}"]`);
    await waitForPhase(page, 'QUERY_DRAFTING');
    await runContractAt(page, vpName, 'COMPOSE', results, shotDir, 'happy-02-COMPOSE');

    for(const t of RIGHT.slice(1)) await page.click(`.tok[data-token="${t}"]`, { timeout: 5000 });

    await page.click('#runBtn');
    await waitForPhase(page, 'AWAITING_PREDICTION');
    await page.waitForSelector('#predictBar.show', { timeout: 5000 });
    await runContractAt(page, vpName, 'PREDICTION', results, shotDir, 'happy-03-PREDICTION');

    const silenceStart = Date.now();
    await page.click('.predict-btn[data-rows="3"]');
    // QUERY_EXECUTING は同一タスク内でEVIDENCE_REVEALEDへ即遷移する一瞬の状態のため、
    // DOM上での待機は行わない(phaseログ側で通過そのものは検証する)。
    await waitForPhase(page, 'EVIDENCE_REVEALED');
    await runContractAt(page, vpName, 'EVIDENCE_SILENCE', results, shotDir, 'happy-04-EVIDENCE_SILENCE');

    await waitForPhase(page, 'CHAPTER_CLEARED', CONTRACTS.testSilenceMs + 4000);
    const silenceElapsed = Date.now() - silenceStart;
    await runContractAt(page, vpName, 'EVIDENCE_FINAL', results, shotDir, 'happy-05-EVIDENCE_FINAL');

    // 沈黙がテストモードで延長されている(本番800msではなく5000ms相当)ことの確認。
    const silenceExtended = silenceElapsed >= (CONTRACTS.testSilenceMs - 1500);
    results.push({
      viewport: vpName, state: 'TRANSITION', check: `happy:silence:testMode(~${CONTRACTS.testSilenceMs}ms, observed=${silenceElapsed}ms)`,
      pass: silenceExtended, message: silenceExtended ? '' : `expected ~${CONTRACTS.testSilenceMs}ms, observed ${silenceElapsed}ms`
    });

    pushOrderCheck(results, vpName, 'happy', HAPPY_ORDER, await readPhaseLog(page));

    // ---- CH2 regression (最小限): CH1専用のワークスペースCSSがCH2に漏れていないことだけ確認する ----
    // CH2のSQL自体は解かない。CH2のdata/story/logicはここでは一切触れない。
    await page.click('#runBtn'); // 続ける → CH2へ
    await page.waitForFunction(() => document.getElementById('stageLabel').textContent.includes('CH.2'), null, { timeout: 5000 });
    const ch2 = await page.evaluate(() => {
      const vis = id => { const e = document.getElementById(id); return e && getComputedStyle(e).display !== 'none'; };
      const selectTok = document.querySelector('.tok[data-token="SELECT"]');
      const r = selectTok ? selectTok.getBoundingClientRect() : null;
      return {
        titleVisible: vis('stageLabel'),
        tokenPadVisible: vis('tokenPad'),
        selectTappable: !!(r && r.width > 0 && r.height > 0),
        ch1uiLeaked: document.body.classList.contains('ch1-ui'),
        workspaceLeaked: document.body.dataset.workspace != null
      };
    });
    const ch2Ok = ch2.titleVisible && ch2.tokenPadVisible && ch2.selectTappable && !ch2.ch1uiLeaked && !ch2.workspaceLeaked;
    results.push({
      viewport: vpName, state: 'CH2_REGRESSION', check: 'ch2:minimal(title/tokenPad/selectTap/noCh1UILeak)',
      pass: ch2Ok, message: ch2Ok ? '' : JSON.stringify(ch2)
    });
    await page.screenshot({ path: path.join(shotDir, 'happy-06-CH2_REGRESSION.png') }).catch(() => {});
  } finally {
    await ctx.close();
  }
}

// ---- REJECT PATH: 誤答 → QUERY_REJECTED → 修正して QUERY_DRAFTING に戻る ----
async function runRejectPath(browser, vpName, vp, shotDir, results, jsErrors){
  const { ctx, page } = await openBooted(browser, vp, jsErrors);
  try {

    for(const t of WRONG) await page.click(`.tok[data-token="${t}"]`, { timeout: 5000 });
    await page.click('#runBtn');
    await waitForPhase(page, 'AWAITING_PREDICTION');
    await page.waitForSelector('#predictBar.show', { timeout: 5000 });
    await page.click('.predict-btn[data-rows="3"]');

    await waitForPhase(page, 'QUERY_REJECTED');
    await page.screenshot({ path: path.join(shotDir, 'reject-01-QUERY_REJECTED.png') }).catch(() => {});
    await page.waitForSelector('#ch1Sheet.show', { timeout: 5000 });
    await page.click('#ch1SheetPrimary'); // 「修正する」→ シートを閉じるのみ (phaseはまだQUERY_REJECTED)
    // QUERY_REJECTED → QUERY_DRAFTING への実際の遷移条件はトークンの追加(addToken)。
    // 実プレイと同じくUndoで誤答を消し、正しい値を打ち直す。
    await page.click('#undoBtn');
    await page.click(`.tok[data-token="'S4'"]`, { timeout: 5000 });
    await waitForPhase(page, 'QUERY_DRAFTING');
    await page.screenshot({ path: path.join(shotDir, 'reject-02-QUERY_DRAFTING.png') }).catch(() => {});

    pushOrderCheck(results, vpName, 'reject', REJECT_ORDER, await readPhaseLog(page));
  } finally {
    await ctx.close();
  }
}

// ---- CANCEL PATH: 予測をキャンセルして QUERY_DRAFTING に戻る (draft保持) ----
async function runCancelPath(browser, vpName, vp, shotDir, results, jsErrors){
  const { ctx, page } = await openBooted(browser, vp, jsErrors);
  try {

    for(const t of RIGHT) await page.click(`.tok[data-token="${t}"]`, { timeout: 5000 });
    await page.click('#runBtn');
    await waitForPhase(page, 'AWAITING_PREDICTION');
    await page.waitForSelector('#predictBar.show', { timeout: 5000 });
    await page.screenshot({ path: path.join(shotDir, 'cancel-01-AWAITING_PREDICTION.png') }).catch(() => {});

    await page.click('#predictCancel');
    await waitForPhase(page, 'QUERY_DRAFTING');
    await page.screenshot({ path: path.join(shotDir, 'cancel-02-QUERY_DRAFTING.png') }).catch(() => {});

    const monitorText = await page.textContent('#monitor');
    const draftKept = monitorText.includes('S4');
    results.push({
      viewport: vpName, state: 'TRANSITION', check: 'cancel:draftKept',
      pass: draftKept, message: draftKept ? '' : `monitor="${monitorText}"`
    });

    pushOrderCheck(results, vpName, 'cancel', CANCEL_ORDER, await readPhaseLog(page));
  } finally {
    await ctx.close();
  }
}

async function runViewport(browser, vpName, vp){
  const shotDir = path.join(ARTIFACT_DIR, vpName);
  mkdirSync(shotDir, { recursive: true });
  const t0 = Date.now();
  const results = [];

  const jsErrors = [];
  await runHappyPath(browser, vpName, vp, shotDir, results, jsErrors);
  await runRejectPath(browser, vpName, vp, shotDir, results, jsErrors);
  await runCancelPath(browser, vpName, vp, shotDir, results, jsErrors);

  results.push({
    viewport: vpName, state: 'RUNTIME', check: 'noJsError',
    pass: jsErrors.length === 0, message: jsErrors.slice(0, 3).join(' | ')
  });

  return { results, elapsedMs: Date.now() - t0 };
}

async function main(){
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const viewportEntries = Object.entries(CONTRACTS.viewports);
  const allResults = [];
  const viewportReports = {};

  try {
    for(const [name, vp] of viewportEntries){
      const { results, elapsedMs } = await runViewport(browser, name, vp);
      allResults.push(...results);
      viewportReports[name] = { elapsedMs, summary: summarize(results) };
      for(const r of results){
        console.log(`${r.pass ? 'PASS' : 'FAIL'}  [${r.viewport}][${r.state}] ${r.check}${r.message ? '  ' + r.message : ''}`);
      }
    }
  } finally {
    await browser.close();
  }

  const summary = summarize(allResults);
  const report = {
    decoder: 'A',
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
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
