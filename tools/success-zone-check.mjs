// tools/success-zone-check.mjs
// Query Task 成功画面（3領域アコーディオン）の実機検証。
//   既定状態   : PROBLEM=閉 / RESULT=開 / COMMUNICATION=閉
//   開閉       : header tap（ONE-OPEN）
//   1クリック次: 会話を開かなくても次へ進める / 開いた後でも進める
//   複数表     : CH4(2表)のsource tableがZONE 1に収まる
//   隠蔽禁止   : 会話の最終行まで読める（bottom stickyに隠れない）
//   SQL編集UI  : 成功後は非表示
//   重複禁止   : 同じ長文が画面上の2箇所に同時表示されない
// 事前に `python -m http.server 8000` (または UX_BASE_URL) が必要。
//   node tools/success-zone-check.mjs

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'tools/ux-artifacts/success');
const BASE_URL = process.env.UX_BASE_URL || 'http://127.0.0.1:8000/';
const MIN_TAP = 44;

// 各章の正解トークン順（既存テストと同じ並び）
const SOLUTIONS = {
  0: ['SELECT', 'resident_id', 'display_name', 'FROM', 'RESIDENT_CACHE', 'WHERE', 'status', '=', "'MISSING'", 'AND', 'last_sector', '=', "'S4'"],
  1: ['SELECT', 'destination', 'SUM(quantity)', 'AS', 'total_quantity', 'FROM', 'SUPPLY_TRANSFER_0911', 'GROUP BY', 'destination'],
  2: ['SELECT', 'sector', 'SUM(people)', 'AS', 'total_people', 'FROM', 'EVAC_BATCH_0911', 'GROUP BY', 'sector', 'HAVING', 'SUM(people)', '>', '30'],
  3: ['SELECT', 'p.legal_name', 'a.gate', 'a.time', 'FROM', 'PERSON_INDEX', 'AS', 'p', 'INNER JOIN', 'ACCESS_LOG', 'AS', 'a', 'ON', 'p.credential_id', '=', 'a.credential_id', 'WHERE', 'a.gate', '=', "'S4-P6'"]
};
const VIEWPORTS = [
  { name: 'iPhone SE',  width: 375, height: 667, slug: 'iphone-se' },
  { name: 'iPhone 16e', width: 393, height: 852, slug: 'iphone-16e' }
];

let failCount = 0;
function check(label, ok, detail){
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? '  ' + detail : ''}`);
  if(!ok) failCount++;
}

async function tapInfo(page, selector){
  return page.$$eval(selector, els => els.map(el => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { text: el.textContent.trim().slice(0, 18), h: Math.round(r.height),
      inViewport: r.top >= 0 && r.bottom <= innerHeight,
      onTop: !!hit && (hit === el || el.contains(hit)) };
  }));
}

async function noPageScroll(page){
  return page.evaluate(() => {
    const se = document.scrollingElement;
    return se.scrollHeight <= innerHeight + 1 && se.scrollWidth <= innerWidth + 1;
  });
}

async function zoneState(page){
  return page.evaluate(() => {
    const vis = id => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none'; };
    return {
      workspace: document.body.dataset.workspace,
      open: {
        problem: document.getElementById('zoneProblem').classList.contains('open'),
        result: document.getElementById('zoneResult').classList.contains('open'),
        comm: document.getElementById('zoneComm').classList.contains('open')
      },
      sqlUi: { monitor: vis('monitorWrap'), tokenPad: vis('tokenPad'), utilBar: vis('utilBar'),
               schema: vis('schemaPanel'), mission: vis('mission'), hintBtn: vis('hintBtn'),
               orderBtn: vis('orderBtn'), retryBtn: vis('retryBtn'),
               resultPanel: vis('resultPanel'), altPanel: vis('altPanel'), revealPanel: vis('revealPanel') },
      unread: document.getElementById('zoneCommUnread').classList.contains('show'),
      runLabel: document.getElementById('runBtn').textContent.trim(),
      tables: [...document.querySelectorAll('#zoneProblemBody .zone-table h5')].map(e => e.textContent.trim()),
      resultRows: document.querySelectorAll('#zoneResultBody table.result tbody tr').length,
      executedSql: (document.querySelector('#zoneResultBody .zone-sql') || {}).textContent || '',
      clearLine: (document.querySelector('.zone-clear') || {}).textContent || '',
      dialogueLines: [...document.querySelectorAll('#zoneCommBody .zone-say')].map(e => e.textContent.trim())
    };
  });
}

// 画面上に実際に見えている長文テキストの重複を検出する
async function visibleDuplicates(page){
  return page.evaluate(() => {
    const shown = el => el.checkVisibility
      ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      : el.getClientRects().length > 0;
    const norm = s => s.replace(/[\s　]/g, '').replace(/[「」『』（）()、。,.・:：;；]/g, '');
    const seen = new Map();
    const dups = [];
    for(const el of document.querySelectorAll('#app *')){
      if(!shown(el)) continue;
      const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
      if(own.length < 16) continue;           // 短いラベルは対象外
      const key = norm(own);
      if(!key) continue;
      if(seen.has(key)) dups.push(key.slice(0, 28));
      else seen.set(key, true);
    }
    return dups;
  });
}

async function solveStage(page, stageIndex){
  for(const t of SOLUTIONS[stageIndex]){
    const el = await page.$(`.tok[data-token="${t}"]`);
    if(el && !(await el.isDisabled())) await el.click();
  }
  await page.click('#runBtn');
  const bar = await page.$('#predictBar.show');
  if(bar){
    const rows = await page.$$('.predict-btn');
    // 正解の行数を選ぶ必要はない（予測はXPボーナスのみ）
    if(rows.length) await rows[1].click();
  }
  await page.waitForFunction(() => document.body.dataset.workspace === 'success', null, { timeout: 12000 });
}

async function openStage(browser, vp, stageIndex){
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.addInitScript(idx => {
    localStorage.setItem('caravan_intro_seen', 'true');
    localStorage.setItem('caravan_tutorial_seen', 'true');
    if(idx > 0){
      const cleared = [false, false, false, false, false].map((_, i) => i < idx);
      localStorage.setItem('caravan_progress', JSON.stringify({
        stage: idx, xp: 0, cleared, clearTypes: [null, null, null, null, null]
      }));
    }
  }, stageIndex);
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForSelector('#tokenPad .tok', { timeout: 30000 });
  return { ctx, page, jsErrors };
}

async function runChapter(browser, vp, stageIndex, expectTables){
  const tag = `[${vp.name} CH${stageIndex + 1}]`;
  const { ctx, page, jsErrors } = await openStage(browser, vp, stageIndex);
  try {
    await solveStage(page, stageIndex);

    // ---- 既定状態 ----
    let st = await zoneState(page);
    check(`${tag} 成功でsuccess workspaceへ`, st.workspace === 'success', st.workspace);
    check(`${tag} 既定: PROBLEM=閉 / RESULT=開 / COMM=閉`,
      st.open.problem === false && st.open.result === true && st.open.comm === false, JSON.stringify(st.open));
    check(`${tag} SQL編集UIと旧パネルが残らない`,
      Object.values(st.sqlUi).every(v => v === false), JSON.stringify(st.sqlUi));
    check(`${tag} ZONE2に実行SQLが出る`, st.executedSql.includes('SELECT'), st.executedSql.slice(0, 40));
    check(`${tag} ZONE2に結果行が出る`, st.resultRows > 0, `rows=${st.resultRows}`);
    check(`${tag} ZONE2に評価が出る`, /MASTERED|ASSISTED|PRACTICE/.test(st.clearLine), st.clearLine.trim());
    check(`${tag} 会話は未読マーク付きで閉じている`, st.unread === true);
    check(`${tag} page scroll なし`, await noPageScroll(page));

    // ---- 重複表示なし ----
    const dups = await visibleDuplicates(page);
    check(`${tag} 同じ長文が同時に2箇所へ出ない`, dups.length === 0, JSON.stringify(dups));

    // ---- header tap targets ----
    // #successZones は内部スクロール領域。各headerを可視化してからタップ可否を測る。
    const headerCount = (await page.$$('.zone-header')).length;
    const headers = [];
    for(const zone of ['problem', 'result', 'comm']){
      const sel = `.zone-header[data-zone="${zone}"]`;
      await page.$eval(sel, el => el.scrollIntoView({ block: 'nearest' }));
      headers.push(Object.assign({ zone }, (await tapInfo(page, sel))[0]));
    }
    check(`${tag} Zone header 3つが44px以上でタップ可能`,
      headerCount === 3 && headers.every(h => h.h >= MIN_TAP && h.onTop && h.inViewport),
      JSON.stringify(headers.map(h => `${h.zone}:h${h.h}${h.onTop ? '' : '(covered)'}${h.inViewport ? '' : '(off)'}`)));
    await page.$eval('#successZones', el => { el.scrollTop = 0; });
    const run = (await tapInfo(page, '#runBtn'))[0];
    check(`${tag} 次へボタンが44px以上でviewport内`,
      run.h >= MIN_TAP && run.onTop && run.inViewport, JSON.stringify(run));
    check(`${tag} 次へボタンが1クリックの主Action`, /次の照会|次へ/.test(st.runLabel), st.runLabel);

    // ---- PROBLEM を開く（ONE-OPENでRESULTが閉じる） ----
    await page.click('.zone-header[data-zone="problem"]');
    st = await zoneState(page);
    check(`${tag} PROBLEMを開ける`, st.open.problem === true, JSON.stringify(st.open));
    check(`${tag} ONE-OPEN: RESULTが閉じる`, st.open.result === false, JSON.stringify(st.open));
    check(`${tag} ZONE1にsource tableが揃う`,
      expectTables.every(t => st.tables.includes(t)) && st.tables.length === expectTables.length,
      JSON.stringify(st.tables));
    check(`${tag} page scroll なし (PROBLEM展開)`, await noPageScroll(page));

    // ---- COMMUNICATION を開く ----
    await page.click('.zone-header[data-zone="comm"]');
    st = await zoneState(page);
    check(`${tag} COMMUNICATIONを開ける`, st.open.comm === true, JSON.stringify(st.open));
    check(`${tag} 開いたら未読マークが消える`, st.unread === false);
    check(`${tag} 会話行が出る`, st.dialogueLines.length > 0, JSON.stringify(st.dialogueLines).slice(0, 80));
    check(`${tag} page scroll なし (COMM展開)`, await noPageScroll(page));

    // ---- 会話の最終行まで読める（bottom stickyに隠れない） ----
    const clip = await page.evaluate(() => {
      const zones = document.getElementById('successZones');
      zones.scrollTop = zones.scrollHeight;
      const lines = [...document.querySelectorAll('#zoneCommBody .zone-say, #zoneCommBody .zone-terminal')];
      const last = lines[lines.length - 1];
      if(!last) return { ok: false, reason: 'no dialogue' };
      const r = last.getBoundingClientRect();
      const zr = zones.getBoundingClientRect();
      const bar = document.getElementById('actionBar').getBoundingClientRect();
      return {
        ok: r.bottom <= zr.bottom + 1 && r.bottom <= bar.top + 1 && r.height > 0,
        lastBottom: Math.round(r.bottom), zoneBottom: Math.round(zr.bottom), barTop: Math.round(bar.top)
      };
    });
    check(`${tag} 会話の最終行がbottom Actionに隠れない`, clip.ok, JSON.stringify(clip));

    // ---- 会話を開いた後でも次へ進める ----
    const before = await page.evaluate(() => document.getElementById('stageLabel').textContent);
    await page.click('#runBtn');
    const advanced = await page.waitForFunction(prev =>
      document.getElementById('stageLabel').textContent !== prev || !!document.querySelector('#result.show, #storyOverlay.show'),
      before, { timeout: 8000 }).then(() => true).catch(() => false);
    check(`${tag} 会話を開いた後でも1クリックで次へ進める`, advanced);
    check(`${tag} JSエラーなし`, jsErrors.length === 0, jsErrors.slice(0, 2).join(' | '));
  } finally {
    await ctx.close();
  }
}

// 会話を開かずに次へ進めること（Dialogueを進行条件にしない）
async function skipDialogue(browser, vp, stageIndex){
  const tag = `[${vp.name} CH${stageIndex + 1} skip]`;
  const { ctx, page, jsErrors } = await openStage(browser, vp, stageIndex);
  try {
    await solveStage(page, stageIndex);
    const st = await zoneState(page);
    check(`${tag} 会話は閉じたまま`, st.open.comm === false);
    const before = await page.evaluate(() => document.getElementById('stageLabel').textContent);
    await page.click('#runBtn');
    const advanced = await page.waitForFunction(prev =>
      document.getElementById('stageLabel').textContent !== prev || !!document.querySelector('#result.show, #storyOverlay.show'),
      before, { timeout: 8000 }).then(() => true).catch(() => false);
    check(`${tag} 会話を開かず1クリックで次へ進める`, advanced);
    check(`${tag} JSエラーなし`, jsErrors.length === 0, jsErrors.slice(0, 2).join(' | '));
  } finally {
    await ctx.close();
  }
}

(async () => {
  mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    // CH2(1表) と CH4(2表) を両ビューポートで、CH1/CH3はSEで確認
    for(const vp of VIEWPORTS){
      await runChapter(browser, vp, 1, ['SUPPLY_TRANSFER_0911']);
      await runChapter(browser, vp, 3, ['PERSON_INDEX', 'ACCESS_LOG']);
    }
    await runChapter(browser, VIEWPORTS[0], 0, ['RESIDENT_CACHE']);
    await runChapter(browser, VIEWPORTS[0], 2, ['EVAC_BATCH_0911']);
    await skipDialogue(browser, VIEWPORTS[0], 1);
  } catch(err){
    check('実行時例外なし', false, err.message);
  } finally {
    await browser.close();
  }
  console.log('');
  console.log(`FAIL_COUNT: ${failCount}`);
  process.exit(failCount === 0 ? 0 : 1);
})();
