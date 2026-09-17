// tools/relation-ui-check.mjs
// Q1 Relation Task の実機UI検証（iPhone portrait）。
//   情報設計: 段階表示（target → select → match）/ 主役カードが1つ / 3表同時表示なし
//   可読性  : 表示中テキストは全て13px以上、重要値は16px以上
//   操作性  : 欠損セル・source行・下部Actionが44px以上かつviewport内
//   関係推論: 照合キー提示 → source行選択 → MATCH/MISMATCH → R005復元
//   非退行  : 候補トークン不在 / page scroll 0 / overlap 0 / Query workspace非干渉
// 事前に `python -m http.server 8000` (または UX_BASE_URL) が必要。
//   node tools/relation-ui-check.mjs

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'tools/ux-artifacts/q1');

const BASE_URL = process.env.UX_BASE_URL || 'http://127.0.0.1:8000/';
const VIEWPORTS = [
  { name: 'iPhone SE',  width: 375, height: 667, slug: 'iphone-se' },
  { name: 'iPhone 16e', width: 393, height: 852, slug: 'iphone-16e' }
];
const RELATION_STAGE_INDEX = 4;

const MIN_FONT = 13;        // 13px未満は禁止
const MIN_VALUE_FONT = 16;  // 重要値の下限
const MIN_TAP = 44;

let failCount = 0;
function check(label, ok, detail){
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? '  ' + detail : ''}`);
  if(!ok) failCount++;
}

async function noPageScroll(page){
  return page.evaluate(() => {
    const se = document.scrollingElement, app = document.getElementById('app');
    return se.scrollHeight <= innerHeight + 1 && se.scrollWidth <= innerWidth + 1
      && app.scrollHeight <= app.clientHeight + 1;
  });
}

async function tapInfo(page, selector){
  return page.$$eval(selector, els => els.map(el => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      text: el.textContent.trim().slice(0, 16),
      w: Math.round(r.width), h: Math.round(r.height),
      inViewport: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
      onTop: !!hit && (hit === el || el.contains(hit))
    };
  }));
}

// checkVisibility() を使う。閉じた <details> の中身は「見えていない」として除外される。
async function stateProbe(page){
  return page.evaluate(({ minFont }) => {
    const shown = el => el.checkVisibility
      ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      : el.getClientRects().length > 0;

    const panel = document.getElementById('relationPanel');
    const textEls = [...panel.querySelectorAll('*')].filter(el =>
      shown(el) && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()));

    const small = textEls
      .map(el => ({ fs: parseFloat(getComputedStyle(el).fontSize),
                    cls: (el.className || el.tagName).toString().split(' ')[0],
                    text: el.textContent.trim().slice(0, 18) }))
      .filter(x => x.fs < minFont);

    const valueEls = [...panel.querySelectorAll('.rq-v, .rq-key-v, .rq-answer-v, .rq-missing')]
      .filter(shown)
      .map(el => ({ fs: parseFloat(getComputedStyle(el).fontSize), text: el.textContent.trim().slice(0, 12) }));

    const visibleTables = [...panel.querySelectorAll('table')].filter(shown).map(t => {
      const card = t.closest('.rq-card, details');
      return ((card && (card.querySelector('.rq-card-title, summary') || {}).textContent) || '?')
        .trim().split(/\s+/)[0];
    });

    const actives = [...panel.querySelectorAll('.rq-active')].filter(shown).map(el =>
      (((el.querySelector('.rq-card-name, .rq-verdict') || {}).textContent) || '').trim().split(/\s+/)[0]);

    const bg = el => el ? getComputedStyle(el).backgroundColor : null;
    const layers = {
      app: bg(document.getElementById('app')) || bg(document.body),
      secondary: bg(panel.querySelector('.rq-summary, .rq-details')),
      active: bg(panel.querySelector('.rq-active'))
    };

    const prose = [...panel.querySelectorAll('.rq-badge, .rq-lead, .rq-card-hint, .rq-keys-title, .rq-details summary')]
      .filter(shown).map(el => el.textContent.trim());

    // 祖先のスクロール領域でクリップされた分は「画面に出ていない」ので重なり判定から外す
    const clippedRect = el => {
      const r = el.getBoundingClientRect();
      let l = r.left, t2 = r.top, rt = r.right, b2 = r.bottom;
      for(let a = el.parentElement; a; a = a.parentElement){
        const cs = getComputedStyle(a);
        if(/(auto|hidden|scroll|clip)/.test(cs.overflow + cs.overflowX + cs.overflowY)){
          const ar = a.getBoundingClientRect();
          l = Math.max(l, ar.left); t2 = Math.max(t2, ar.top);
          rt = Math.min(rt, ar.right); b2 = Math.min(b2, ar.bottom);
        }
      }
      l = Math.max(l, 0); t2 = Math.max(t2, 0);
      rt = Math.min(rt, innerWidth); b2 = Math.min(b2, innerHeight);
      return (rt - l > 0.5 && b2 - t2 > 0.5) ? { left: l, top: t2, right: rt, bottom: b2 } : null;
    };
    const boxes = textEls.map(el => ({ el, r: clippedRect(el) })).filter(x => x.r);
    const overlaps = [];
    for(let i = 0; i < boxes.length; i++) for(let j = i + 1; j < boxes.length; j++){
      const a = boxes[i], b = boxes[j];
      if(a.el.contains(b.el) || b.el.contains(a.el)) continue;
      if(a.r.left < b.r.right && a.r.right > b.r.left && a.r.top < b.r.bottom && a.r.bottom > b.r.top){
        overlaps.push((a.el.className || a.el.tagName) + ' x ' + (b.el.className || b.el.tagName));
      }
    }

    return {
      state: panel.dataset.relationState,
      taskAttr: panel.dataset.relationTask,
      small, valueEls, visibleTables, actives, layers, prose,
      proseChars: prose.join('').length,
      overlaps: overlaps.slice(0, 4),
      lead: (panel.querySelector('.rq-lead') || {}).textContent || '',
      answerTag: (panel.querySelector('.rq-answer-l') || {}).textContent || '',
      answerValue: (panel.querySelector('.rq-answer-v') || {}).textContent || '',
      answerIsGreen: !!panel.querySelector('.rq-answer.ok'),
      answerIsPreview: !!panel.querySelector('.rq-answer.preview'),
      targetCellText: (panel.querySelector('.relation-missing') || {}).textContent || '',
      targetCellGreen: !!panel.querySelector('.relation-missing.filled'),
      missionVisible: (() => { const m = document.getElementById('mission');
        return !!m && getComputedStyle(m).display !== 'none'; })(),
      candidateTokens: panel.querySelectorAll('.relation-tok, [data-token]').length
    };
  }, { minFont: MIN_FONT });
}

async function commonStateChecks(page, tag, label, expectActive){
  const d = await stateProbe(page);
  check(`${tag} ${label}: 表示テキストが全て${MIN_FONT}px以上`, d.small.length === 0, JSON.stringify(d.small));
  check(`${tag} ${label}: 重要値が${MIN_VALUE_FONT}px以上`,
    d.valueEls.length > 0 && d.valueEls.every(v => v.fs >= MIN_VALUE_FONT), JSON.stringify(d.valueEls));
  check(`${tag} ${label}: 主役カードが1つだけ`, d.actives.length === 1, JSON.stringify(d.actives));
  check(`${tag} ${label}: 主役が ${expectActive}`, d.actives[0] === expectActive, JSON.stringify(d.actives));
  check(`${tag} ${label}: 3表同時表示でない`, d.visibleTables.length <= 1, JSON.stringify(d.visibleTables));
  check(`${tag} ${label}: 常時表示の説明文が短い`, d.proseChars <= 180, `${d.proseChars}字 ${JSON.stringify(d.prose)}`);
  check(`${tag} ${label}: テキスト重なりなし`, d.overlaps.length === 0, JSON.stringify(d.overlaps));
  check(`${tag} ${label}: page scroll なし`, await noPageScroll(page));
  const run = (await tapInfo(page, '#runBtn'))[0];
  check(`${tag} ${label}: 下部Actionが押せる`,
    run.onTop && run.inViewport && run.h >= MIN_TAP, JSON.stringify(run));
  return d;
}

async function open(browser, vp){
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.addInitScript(idx => {
    localStorage.setItem('caravan_intro_seen', 'true');
    localStorage.setItem('caravan_tutorial_seen', 'true');
    localStorage.setItem('caravan_progress', JSON.stringify({
      stage: idx, xp: 0, cleared: [true, true, true, true, false], clearTypes: [null, null, null, null, null]
    }));
  }, RELATION_STAGE_INDEX);
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForSelector('#relationPanel.show', { timeout: 30000 });
  return { ctx, page, jsErrors };
}

async function runViewport(browser, vp){
  const tag = `[${vp.name}]`;
  const shotDir = path.join(SHOT_DIR, vp.slug);
  mkdirSync(shotDir, { recursive: true });
  const { ctx, page, jsErrors } = await open(browser, vp);
  try {
    // ================= STATE A: 復元対象 =================
    const a = await stateProbe(page);
    check(`${tag} Q1スコープのdata属性が付く`, a.taskAttr === 'EVAC_RECEPTION_RECOVERY_01', a.taskAttr);
    check(`${tag} state=target`, a.state === 'target', a.state);
    check(`${tag} 候補トークンが存在しない`, a.candidateTokens === 0, `count=${a.candidateTokens}`);
    check(`${tag} 問題文をHeaderと二重表示しない(#mission非表示)`, !a.missionVisible);
    check(`${tag} 3階層の背景が区別される`,
      a.layers.app !== a.layers.active && a.layers.secondary !== a.layers.active, JSON.stringify(a.layers));
    await commonStateChecks(page, tag, 'A', 'EVAC_RECEPTION');
    check(`${tag} A: RESIDENT_CACHEは折りたたみ(既定で非表示)`, !(await page.isVisible('.rq-details table')));
    const miss = (await tapInfo(page, '.relation-missing'))[0];
    check(`${tag} A: 欠損セルが最重要Tapとして44px以上`,
      miss.onTop && miss.inViewport && miss.h >= MIN_TAP, JSON.stringify(miss));
    await page.screenshot({ path: path.join(shotDir, 'A-target.png') }).catch(() => {});

    // ================= STATE B/C: 照合キー + source選択 =================
    await page.click('.relation-missing');
    const bc = await commonStateChecks(page, tag, 'B/C', 'TERMINAL_LOG');
    check(`${tag} B/C: state=select`, bc.state === 'select', bc.state);
    const keys = await page.$$eval('.rq-key-v', els => els.map(e => e.textContent.trim()));
    check(`${tag} B/C: 照合キーの値が提示される`,
      keys.includes('T-S4-03') && keys.includes('23:09'), JSON.stringify(keys));
    check(`${tag} B/C: 列対応の技術説明を常時表示しない`,
      !/authenticated_at/.test(bc.prose.join('')), JSON.stringify(bc.prose));
    const rows = [];
    for(const k of ['T-S4-02', 'T-S4-03', 'T-S4-01']){
      const sel = `.relation-source-row[data-source="${k}"]`;
      await page.$eval(sel, el => el.scrollIntoView({ block: 'nearest' }));
      rows.push(Object.assign({ k }, (await tapInfo(page, sel))[0]));
    }
    check(`${tag} B/C: source行3件が44px以上・viewport内で押せる`,
      rows.length === 3 && rows.every(r => r.onTop && r.inViewport && r.h >= MIN_TAP),
      JSON.stringify(rows.map(r => `${r.k}:h${r.h}${r.onTop ? '' : '(covered)'}${r.inViewport ? '' : '(off)'}`)));
    await page.screenshot({ path: path.join(shotDir, 'B-select.png') }).catch(() => {});

    // ================= STATE D: MISMATCH =================
    await page.click('.relation-source-row[data-source="T-S4-02"]');
    const ng = await commonStateChecks(page, tag, 'D-mismatch', 'MISMATCH');
    check(`${tag} D-mismatch: 対応しない旨が1行で出る`, /対応しません/.test(ng.lead), ng.lead.trim());
    const ngCmp = await page.$$eval('.rq-cmp', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
    check(`${tag} D-mismatch: 不一致キーが値付きで見える`, ngCmp.some(t => t.includes('≠')), JSON.stringify(ngCmp));
    check(`${tag} D-mismatch: 答え(R005)を出さない`,
      !ngCmp.join('').includes('R005') && !/R005/.test(ng.lead), JSON.stringify(ngCmp));
    // FIX A: 誤った行を選んでも復元は確定しない
    check(`${tag} D-mismatch: 欠損セルは「欠損」のまま（R004を確定しない）`,
      ng.targetCellText.trim() === '欠損', ng.targetCellText.trim());
    check(`${tag} D-mismatch: 欠損セルに成功色(緑)を使わない`, !ng.targetCellGreen);
    check(`${tag} D-mismatch: 復元値欄は PREVIEW 表示`,
      ng.answerTag.trim() === 'PREVIEW' && ng.answerValue.trim() === 'R004',
      `${ng.answerTag.trim()} / ${ng.answerValue.trim()}`);
    check(`${tag} D-mismatch: 復元値欄に成功色(緑)を使わない`,
      !ng.answerIsGreen && ng.answerIsPreview, `green=${ng.answerIsGreen} preview=${ng.answerIsPreview}`);
    await page.screenshot({ path: path.join(shotDir, 'C-mismatch.png') }).catch(() => {});

    await page.click('#runBtn');
    await page.waitForFunction(() => document.body.dataset.phase === 'RELATION_REJECTED', null, { timeout: 5000 });
    const fb = await page.textContent('#feedback');
    check(`${tag} 不一致のまま検証すると拒否される`, /照合キー|terminal_id/.test(fb), fb.trim());
    check(`${tag} 拒否Feedbackが答えを言わない`, !/R005/.test(fb), fb.trim());

    // ================= STATE D: MATCH =================
    await page.click('.relation-source-row[data-source="T-S4-03"]');
    const ok = await commonStateChecks(page, tag, 'D-match', 'MATCH');
    check(`${tag} D-match: 一致した旨が1行で出る`, /一致/.test(ok.lead), ok.lead.trim());
    const okCmp = await page.$$eval('.rq-cmp', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
    check(`${tag} D-match: 両キーの一致が値付きで見える`,
      okCmp.length === 2 && okCmp.every(t => t.includes('=')), JSON.stringify(okCmp));
    check(`${tag} D-match: 復元値が RECONSTRUCTED として確定`,
      ok.answerTag.trim() === 'RECONSTRUCTED' && ok.answerValue.trim() === 'R005',
      `${ok.answerTag.trim()} / ${ok.answerValue.trim()}`);
    check(`${tag} D-match: 確定時のみ成功色(緑)を使う`, ok.answerIsGreen && !ok.answerIsPreview);
    check(`${tag} D-match: 欠損セルにR005が入る`, ok.targetCellText.trim() === 'R005', ok.targetCellText.trim());
    check(`${tag} D-match: 欠損セルが成功色になる`, ok.targetCellGreen);
    await page.screenshot({ path: path.join(shotDir, 'D-match.png') }).catch(() => {});

    // ================= STATE E: 復元確定（Evidence） =================
    await page.click('#runBtn');
    await page.waitForFunction(() => document.body.dataset.phase === 'EVIDENCE_REVEALED', null, { timeout: 8000 });
    await page.waitForFunction(() => document.body.dataset.phase === 'CHAPTER_CLEARED', null, { timeout: 8000 }).catch(() => {});
    const ev = await page.evaluate(() => {
      const vis = id => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none'; };
      const panel = document.getElementById('relationPanel');
      const cards = [...panel.querySelectorAll('.rq-card-name')].map(e => e.textContent.trim());
      const fields = [...panel.querySelectorAll('.rq-card.rq-done .rq-field')].map(e => e.textContent.replace(/\s+/g, ' ').trim());
      const source = [...panel.querySelectorAll('.rq-card.rq-summary .rq-field')].map(e => e.textContent.replace(/\s+/g, ' ').trim());
      return {
        workspace: document.body.dataset.workspace,
        relationState: panel.dataset.relationState,
        relationVisible: getComputedStyle(panel).display !== 'none',
        cards, fields, source,
        sqlUi: { monitor: vis('monitorWrap'), tokenPad: vis('tokenPad'), utilBar: vis('utilBar'),
                 orderBtn: vis('orderBtn'), undoBtn: vis('undoBtn'), resultPanel: vis('resultPanel'),
                 altPanel: vis('altPanel'), schema: vis('schemaPanel') },
        runLabel: document.getElementById('runBtn').textContent.trim(),
        panelText: panel.textContent.replace(/\s+/g, ' ').trim(),
        feedback: document.getElementById('feedback').textContent
      };
    });
    check(`${tag} E: Relation専用Evidence workspace`, ev.workspace === 'relation-evidence', ev.workspace);
    check(`${tag} E: relation state=done`, ev.relationState === 'done', ev.relationState);
    check(`${tag} E: Relation Evidenceが表示される`, ev.relationVisible);
    check(`${tag} E: RECORD RECONSTRUCTED が主役`,
      ev.cards.includes('RECORD RECONSTRUCTED'), JSON.stringify(ev.cards));
    check(`${tag} E: 復元されたE442の3項目が出る`,
      ev.fields.some(f => /resident_id R005/.test(f)) && ev.fields.some(f => /T-S4-03/.test(f))
      && ev.fields.some(f => /23:09/.test(f)), JSON.stringify(ev.fields));
    check(`${tag} E: SOURCE RECORDが根拠として出る`,
      ev.cards.includes('SOURCE RECORD') && ev.source.some(f => /R005/.test(f)), JSON.stringify(ev.source));
    // FIX B: SQL compose UI が一切出ていないこと
    check(`${tag} E: SQL UI（monitor/tokenPad/util/評価順/Undo/result/alt/schema）が非表示`,
      Object.values(ev.sqlUi).every(v => v === false), JSON.stringify(ev.sqlUi));
    check(`${tag} E: 主Actionが「記録の続きを見る」`, /記録の続き|続ける/.test(ev.runLabel), ev.runLabel);
    check(`${tag} E: S2/S4不一致をここで説明しない`,
      !/S2/.test(ev.panelText) && !/矛盾/.test(ev.panelText) && !/異常/.test(ev.panelText), '');
    check(`${tag} E: page scroll なし`, await noPageScroll(page));
    const evRun = (await tapInfo(page, '#runBtn'))[0];
    check(`${tag} E: 主Actionが44px以上で押せる`,
      evRun.onTop && evRun.inViewport && evRun.h >= MIN_TAP, JSON.stringify(evRun));
    await page.screenshot({ path: path.join(shotDir, 'E-reconstructed.png') }).catch(() => {});

    check(`${tag} JSエラーなし`, jsErrors.length === 0, jsErrors.slice(0, 2).join(' | '));
  } finally {
    await ctx.close();
  }
}

// Q1 UI改修後もCH1のQuery flowが壊れていないこと
async function queryRegression(browser){
  const vp = VIEWPORTS[1];
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', d => d.dismiss());
  await page.addInitScript(() => {
    localStorage.setItem('caravan_intro_seen', 'true');
    localStorage.setItem('caravan_tutorial_seen', 'true');
  });
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForSelector('#tokenPad .tok', { timeout: 30000 });
  const st = await page.evaluate(() => ({
    ws: document.body.dataset.workspace,
    relationHidden: getComputedStyle(document.getElementById('relationPanel')).display === 'none',
    tokenPad: getComputedStyle(document.getElementById('tokenPad')).display !== 'none',
    missionVisible: getComputedStyle(document.getElementById('mission')).display !== 'none',
    tokenFont: parseFloat(getComputedStyle(document.querySelector('.tok')).fontSize)
  }));
  check('[REGRESSION] CH1はQuery workspace', st.ws === 'inspect', st.ws);
  check('[REGRESSION] CH1でRelationPanel非表示', st.relationHidden);
  check('[REGRESSION] CH1でToken Pad表示', st.tokenPad);
  check('[REGRESSION] CH1の#missionは表示される(Q1だけ非表示)', st.missionVisible);
  check('[REGRESSION] CH1のtok字面が変わっていない', st.tokenFont === 14, `${st.tokenFont}px`);
  check('[REGRESSION] JSエラーなし', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | '));
  await ctx.close();
}

(async () => {
  mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    for(const vp of VIEWPORTS) await runViewport(browser, vp);
    await queryRegression(browser);
  } catch(err){
    check('実行時例外なし', false, err.message);
  } finally {
    await browser.close();
  }
  console.log('');
  console.log(`Human Gate screenshots: ${path.relative(ROOT, SHOT_DIR)}`);
  console.log(`FAIL_COUNT: ${failCount}`);
  process.exit(failCount === 0 ? 0 : 1);
})();
