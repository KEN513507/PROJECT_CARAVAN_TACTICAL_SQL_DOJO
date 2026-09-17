// tools/ch1-mobile-check.js
// CH1 2-Workspace UI の自動チェック (Human Visual Gate の前提条件)。
// 事前に `python -m http.server 8000` でアプリを配信しておくこと。
//   node tools/ch1-mobile-check.js            (通常)
//   node tools/ch1-mobile-check.js --timeout  (TIMEOUT→Retry経路も検証。+60秒/viewport)

const { chromium } = require('playwright');

const URL = 'http://127.0.0.1:8000/';
const VIEWPORTS = [
  { name: 'iPhone SE',  width: 375, height: 667 },
  { name: 'iPhone 16e', width: 393, height: 852 }
];
const RIGHT = ['SELECT', 'resident_id', 'display_name', 'FROM', 'RESIDENT_CACHE',
  'WHERE', 'status', '=', "'MISSING'", 'AND', 'last_sector', '=', "'S4'"];
const WITH_TIMEOUT = process.argv.includes('--timeout');

let failCount = 0;
function check(label, ok, detail){
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? '  ' + detail : ''}`);
  if(!ok) failCount++;
}

// 画面上で実際に見えている文字要素同士の重なり。一時Overlayの下に隠れた要素は数えない。
async function visibleOverlaps(page){
  return page.evaluate(() => {
    const vw = innerWidth, vh = innerHeight;
    const hasText = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    const hidden = el => { for(let n = el; n; n = n.parentElement){ const cs = getComputedStyle(n); if(cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return true; } return false; };
    function rectOf(el){
      const r = el.getBoundingClientRect();
      let l = r.left, t = r.top, R = r.right, B = r.bottom;
      for(let a = el.parentElement; a; a = a.parentElement){
        const cs = getComputedStyle(a);
        if(/(auto|hidden|scroll|clip)/.test(cs.overflow + cs.overflowX + cs.overflowY)){
          const ar = a.getBoundingClientRect();
          l = Math.max(l, ar.left); t = Math.max(t, ar.top); R = Math.min(R, ar.right); B = Math.min(B, ar.bottom);
        }
      }
      l = Math.max(l, 0); t = Math.max(t, 0); R = Math.min(R, vw); B = Math.min(B, vh);
      return (R - l > 0.5 && B - t > 0.5) ? { l, t, R, B } : null;
    }
    const describe = el => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : ''} "${el.textContent.trim().slice(0, 30)}"`;
    const items = [...document.querySelectorAll('body *')]
      .filter(el => hasText(el) && !hidden(el))
      .map(el => ({ el, r: rectOf(el) }))
      .filter(x => x.r)
      .filter(({ el, r }) => {
        const hit = document.elementFromPoint((r.l + r.R) / 2, (r.t + r.B) / 2);
        return hit && (hit === el || el.contains(hit) || hit.contains(el));
      });
    const out = [];
    for(let i = 0; i < items.length; i++) for(let j = i + 1; j < items.length; j++){
      const a = items[i], b = items[j];
      if(a.el.contains(b.el) || b.el.contains(a.el)) continue;
      if(a.r.l < b.r.R && a.r.R > b.r.l && a.r.t < b.r.B && a.r.B > b.r.t) out.push(`${describe(a.el)} x ${describe(b.el)}`);
    }
    return out;
  });
}

async function noPageScroll(page){
  return page.evaluate(() => {
    const app = document.getElementById('app');
    const se = document.scrollingElement;
    return se.scrollHeight <= innerHeight + 1 && app.scrollHeight <= app.clientHeight + 1;
  });
}

// 要素が実際にタップ可能か (中心点の最前面が自分自身) と、タップ領域の寸法
async function tappable(page, selector){
  return page.$$eval(selector, els => els.map(el => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      text: el.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height),
      inViewport: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
      onTop: hit === el || el.contains(hit)
    };
  }));
}

async function buildQuery(page, tokens){
  for(const t of tokens) await page.click(`.tok[data-token="${t}"]`, { timeout: 5000 });
}

async function runViewport(browser, vp){
  const tag = `[${vp.name}]`;
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const missing = [];
  page.on('response', r => { if(r.status() === 404) missing.push(r.url()); });
  page.on('pageerror', e => check(`${tag} JS error なし`, false, e.message));
  page.on('dialog', d => d.dismiss());

  await page.goto(URL, { waitUntil: 'networkidle' });

  // 初回起動: CIVIS boot → Opening Story → 調査画面（セリフは自動表示しない）
  await page.waitForSelector('#storyOverlay.show', { timeout: 10000 });
  await page.click('#storyContinueBtn');
  await page.waitForSelector('#tokenPad .tok', { timeout: 10000 });
  check(`${tag} CH1 レイアウト有効 (body.ch1-ui)`, await page.evaluate(() => document.body.classList.contains('ch1-ui')));
  check(`${tag} 起動直後にセリフを自動表示しない`, !(await page.isVisible('#ch1Sheet.show')));

  // 🗣 NORA LOG: セリフはボタンからのみ開く
  const noraBtn = (await tappable(page, '#noraBtn'))[0];
  check(`${tag} 🗣ボタンがタップ可能`, noraBtn.onTop && noraBtn.inViewport && noraBtn.h >= 40, JSON.stringify(noraBtn));
  await page.click('#noraBtn');
  await page.waitForSelector('#ch1Sheet.show', { timeout: 5000 });
  const sheetBtn = (await tappable(page, '#ch1SheetPrimary'))[0];
  check(`${tag} NORAシートのボタンがタップ可能`, sheetBtn.onTop && sheetBtn.inViewport && sheetBtn.h >= 44, JSON.stringify(sheetBtn));
  await page.click('#ch1SheetPrimary');
  check(`${tag} 閉じるとセリフは画面から消える`, !(await page.isVisible('#ch1Sheet.show')));

  // ---- QUERY WORKSPACE ----
  const q = await page.evaluate(() => {
    const vis = id => { const e = document.getElementById(id); return e && getComputedStyle(e).display !== 'none'; };
    const pad = document.getElementById('tokenPad');
    const toks = [...pad.querySelectorAll('.tok')].map(b => b.getBoundingClientRect());
    return {
      workspace: document.body.dataset.workspace,
      visible: { mission: vis('mission'), schema: vis('schemaPanel'), monitor: vis('monitorWrap'), tokenPad: vis('tokenPad'), actionBar: vis('actionBar') },
      hiddenPersistent: { tutorialPanel: !vis('tutorialPanel'), hintLine: !vis('hintLine'), feedback: !vis('feedback'), utilBar: !vis('utilBar'), predictBar: !vis('predictBar'), retryBtn: !vis('retryBtn'), orderBtn: !vis('orderBtn') },
      padH: Math.round(pad.clientHeight), padFitsAll: pad.scrollHeight <= pad.clientHeight + 1,
      minTokH: Math.round(Math.min(...toks.map(r => r.height))),
      schemaRowsVisible: [...document.querySelectorAll('#schemaPanel table.mini tbody tr')].every(tr => { const r = tr.getBoundingClientRect(); return r.bottom <= innerHeight && r.height > 0; })
    };
  });
  check(`${tag} QUERY workspace`, q.workspace === 'inspect', q.workspace);
  check(`${tag} 常時要素 (Mission/Schema/Monitor/TokenPad/Action) が表示`, Object.values(q.visible).every(Boolean), JSON.stringify(q.visible));
  check(`${tag} NORA/Hint/Feedback/Utility/Prediction/Retry/評価順 は常駐しない`, Object.values(q.hiddenPersistent).every(Boolean), JSON.stringify(q.hiddenPersistent));
  check(`${tag} RESIDENT_CACHE 全7行が見える`, q.schemaRowsVisible);
  check(`${tag} Token Pad 実用領域 (全トークンがスクロールなしで収まる / 各44px以上)`, q.padFitsAll && q.minTokH >= 44, `padH=${q.padH} minTokH=${q.minTokH}`);
  check(`${tag} page scroll なし (QUERY)`, await noPageScroll(page));
  const qOverlaps = await visibleOverlaps(page);
  check(`${tag} overlap 0 (QUERY)`, qOverlaps.length === 0, qOverlaps.join(' | '));

  // ---- 誤答 → シート → 修正 (Undo) → 再実行 ----
  await buildQuery(page, [...RIGHT.slice(0, -1), "'MISSING'"]); // 最後の値を 'MISSING' にした誤答
  await page.click('#runBtn');
  await page.waitForSelector('.predict-btn', { timeout: 5000 });
  await page.click('.predict-btn[data-rows="3"]');
  await page.waitForSelector('#ch1Sheet.show', { timeout: 5000 });
  const rejBtns = await tappable(page, '#ch1SheetActions button:not([hidden])');
  check(`${tag} 誤答シートのボタンがタップ可能`, rejBtns.every(b => b.onTop && b.inViewport && b.h >= 44), JSON.stringify(rejBtns));
  await page.click('#ch1SheetPrimary'); // 修正する
  await page.click('#undoBtn');
  await page.click(`.tok[data-token="'S4'"]`);

  // ---- ▶実行 → Prediction Overlay ----
  await page.click('#runBtn');
  await page.waitForSelector('#predictBar.show', { timeout: 5000 });
  const pred = await tappable(page, '.predict-btn');
  check(`${tag} Prediction 選択肢が全てタップ可能 (最前面・viewport内・44px以上)`,
    pred.length === 3 && pred.every(b => b.onTop && b.inViewport && b.h >= 44 && b.w >= 44), JSON.stringify(pred));
  const predFixed = await page.evaluate(() => getComputedStyle(document.getElementById('predictBar')).position);
  check(`${tag} Prediction は viewport 固定 Overlay`, predFixed === 'fixed', predFixed);
  check(`${tag} page scroll なし (Prediction)`, await noPageScroll(page));

  // ---- Prediction キャンセル: draft を保持したまま QUERY workspace に戻る ----
  const cancelBtn = (await tappable(page, '#predictCancel'))[0];
  check(`${tag} Predictionキャンセルボタンがタップ可能`, cancelBtn.onTop && cancelBtn.inViewport && cancelBtn.h >= 40, JSON.stringify(cancelBtn));
  await page.click('#predictCancel');
  const afterCancel = await page.evaluate(() => ({
    predictHidden: getComputedStyle(document.getElementById('predictBar')).display === 'none',
    workspace: document.body.dataset.workspace,
    monitorText: document.getElementById('monitor').textContent
  }));
  check(`${tag} キャンセル後: Predictionが閉じる`, afterCancel.predictHidden, JSON.stringify(afterCancel));
  check(`${tag} キャンセル後: QUERY workspaceに戻る`, afterCancel.workspace === 'compose', afterCancel.workspace);
  check(`${tag} キャンセル後: draftが保持される`, afterCancel.monitorText.includes('S4'), afterCancel.monitorText);

  // ---- 再度実行 → Prediction再表示 → 正常経路へ ----
  await page.click('#runBtn');
  await page.waitForSelector('#predictBar.show', { timeout: 5000 });
  await page.click('.predict-btn[data-rows="3"]');

  // ---- EVIDENCE WORKSPACE (沈黙0.8秒の後) ----
  await page.waitForFunction(() => document.body.dataset.workspace === 'success', null, { timeout: 5000 });
  await page.waitForTimeout(300);
  const ev = await page.evaluate(() => {
    const vis = id => { const e = document.getElementById(id); return e && getComputedStyle(e).display !== 'none'; };
    const rows = [...document.querySelectorAll('#zoneResultBody table.result tbody tr')].map(tr => tr.textContent.trim());
    const zoneRows = [...document.querySelectorAll('#zoneResultBody table.result tbody tr')].map(tr => tr.textContent.trim());
    return { tokenPadHidden: !vis('tokenPad'), schemaHidden: !vis('schemaPanel'), hintHidden: !vis('hintBtn'),
      resultShown: vis('successPanel') && vis('zoneResult'), rows: zoneRows,
      zones: ['zoneProblem','zoneResult','zoneComm'].map(id => document.getElementById(id).classList.contains('open')),
      run: document.getElementById('runBtn').textContent, feedback: document.getElementById('feedback').textContent };
  });
  check(`${tag} EVIDENCE: TokenPad/Schema/Hint を非表示`, ev.tokenPadHidden && ev.schemaHidden && ev.hintHidden);
  check(`${tag} EVIDENCE: ZONE2に結果セット3行を表示`, ev.resultShown && ev.rows.length === 3 && ev.rows.join().includes('R003'), JSON.stringify(ev.rows));
  check(`${tag} EVIDENCE: 既定はRESULTだけ開く`, ev.zones[0] === false && ev.zones[1] === true && ev.zones[2] === false, JSON.stringify(ev.zones));
  check(`${tag} EVIDENCE: 1タップで次へ進めるボタン`, /次の照会|次へ|続ける/.test(ev.run), ev.run);
  check(`${tag} EVIDENCE: 評価表示`, /MASTERED|CLEAR|PRACTICE/.test(ev.feedback), ev.feedback);
  const contBtn = (await tappable(page, '#runBtn'))[0];
  check(`${tag} 続けるボタンがタップ可能`, contBtn.onTop && contBtn.inViewport && contBtn.h >= 44, JSON.stringify(contBtn));
  check(`${tag} page scroll なし (EVIDENCE)`, await noPageScroll(page));
  const eOverlaps = await visibleOverlaps(page);
  check(`${tag} overlap 0 (EVIDENCE)`, eOverlaps.length === 0, eOverlaps.join(' | '));

  // ---- 続ける → CH2 は新Workspace CSSの対象外 ----
  await page.click('#runBtn');
  await page.waitForFunction(() => document.getElementById('stageLabel').textContent.includes('CH.2'), null, { timeout: 5000 });
  const ch2 = await page.evaluate(() => {
    const vis = id => { const e = document.getElementById(id); return e && getComputedStyle(e).display !== 'none'; };
    return { ch1ui: document.body.classList.contains('ch1-ui'), workspace: document.body.dataset.workspace || null,
      utilBar: vis('utilBar'), orderBtn: vis('orderBtn'), undoBtn: vis('undoBtn'), groupLabel: vis('tokenPad') && !!document.querySelector('.group-label') && getComputedStyle(document.querySelector('.group-label')).display !== 'none' };
  });
  check(`${tag} CH2: 新Workspace CSS 非適用`, !ch2.ch1ui && ch2.workspace === null && ch2.utilBar && ch2.orderBtn && !ch2.undoBtn && ch2.groupLabel, JSON.stringify(ch2));

  check(`${tag} protagonist.png 404 なし`, !missing.some(u => u.includes('protagonist')), missing.join(', '));
  const otherMissing = missing.filter(u => !u.includes('protagonist'));
  if(otherMissing.length) console.log(`NOTE  ${tag} CH1 UI 対象外の 404: ${otherMissing.join(', ')}`);
  await ctx.close();

  if(WITH_TIMEOUT) await runTimeout(browser, vp);
}

// P0 評価経路が新しいシートUIを通っても崩れないこと (1 viewport で十分)
async function runAssistPaths(browser, vp){
  const tag = `[${vp.name} P0]`;
  async function fresh(){
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.addInitScript(() => { localStorage.setItem('caravan_intro_seen', 'true'); localStorage.setItem('caravan_tutorial_seen', 'true'); });
    page.on('dialog', d => d.dismiss());
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('#tokenPad .tok', { timeout: 10000 });
    return { ctx, page };
  }
  async function solve(page){
    await buildQuery(page, RIGHT);
    await page.click('#runBtn');
    await page.click('.predict-btn[data-rows="3"]');
    await page.waitForFunction(() => document.body.dataset.workspace === 'success', null, { timeout: 5000 });
    return page.textContent('#feedback');
  }

  { const { ctx, page } = await fresh();
    await page.click('#hintBtn'); await page.click('#ch1SheetPrimary');
    const fb = await solve(page);
    check(`${tag} Hint1回 → ASSISTED`, fb.includes('CLEAR') && fb.includes('XP'), fb); await ctx.close(); }

  { const { ctx, page } = await fresh();
    for(let i = 0; i < 4; i++){ await page.click('#hintBtn'); await page.click('#ch1SheetPrimary'); }
    const fb = await solve(page);
    check(`${tag} 完成SQLを見る(Hint×4) → PRACTICE`, fb.includes('PRACTICE'), fb); await ctx.close(); }

  { const { ctx, page } = await fresh();
    for(let n = 1; n <= 5; n++){
      await buildQuery(page, [...RIGHT.slice(0, -1), "'MISSING'"]);
      await page.click('#runBtn');
      await page.click('.predict-btn[data-rows="3"]');
      await page.waitForSelector('#ch1Sheet.show', { timeout: 5000 });
      await page.click('#ch1SheetSecondary'); // 全消去 = Retry
    }
    const fb = await solve(page);
    check(`${tag} 5回失敗→完成SQL→Retry→正解 → PRACTICE`, fb.includes('PRACTICE'), fb); await ctx.close(); }
}

async function runTimeout(browser, vp){
  const tag = `[${vp.name} TIMEOUT]`;
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.addInitScript(() => { localStorage.setItem('caravan_intro_seen', 'true'); localStorage.setItem('caravan_tutorial_seen', 'true'); });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('#tokenPad .tok', { timeout: 10000 });
  await page.click('.tok[data-token="SELECT"]');
  await page.waitForSelector('#ch1Sheet.show', { timeout: 70000 });
  const btn = (await tappable(page, '#ch1SheetPrimary'))[0];
  check(`${tag} TIMEOUTシートの やり直す がタップ可能`, btn.onTop && btn.inViewport && btn.h >= 44, JSON.stringify(btn));
  await page.click('#ch1SheetScrim', { position: { x: 5, y: 5 } }); // 外側タップでは閉じない
  check(`${tag} TIMEOUTシートは外側タップで閉じない`, await page.isVisible('#ch1Sheet.show'));
  await page.click('#ch1SheetPrimary');
  await buildQuery(page, RIGHT);
  await page.click('#runBtn');
  await page.click('.predict-btn[data-rows="3"]');
  await page.waitForFunction(() => document.body.dataset.workspace === 'success', null, { timeout: 5000 });
  const fb = await page.textContent('#feedback');
  check(`${tag} TIMEOUT→Retry→正解 は PRACTICE`, fb.includes('PRACTICE'), fb);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    for(const vp of VIEWPORTS) await runViewport(browser, vp);
    await runAssistPaths(browser, VIEWPORTS[0]);
  } catch(err) {
    check('実行時例外なし', false, err.message);
  } finally {
    await browser.close();
  }
  console.log('');
  console.log(`FAIL_COUNT: ${failCount}`);
  process.exit(failCount === 0 ? 0 : 1);
})();
