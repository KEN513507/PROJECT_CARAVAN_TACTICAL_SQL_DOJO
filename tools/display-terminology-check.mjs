// tools/display-terminology-check.mjs
// DISPLAY TERMINOLOGY CONTRACT ゲート。
//   rule 1 端末別に表示名を変えない        → iPhone SE / 16e で同一ラベル集合
//   rule 2 1 field/table = 1 canonical label → 同一識別子が画面ごとに別表記にならない
//   rule 3 全UIで同じ表記                   → 表示ラベル = 内部識別子（漢字/カナ/英字の揺れ禁止）
//   rule 6 Table/Result/Evidence/Relation/Note は canonical label を使う
//   rule 8 省略表示（credenti...）を通常状態として許容しない
// SQL Editor / monitor / token pad は rule 5 により内部識別子のまま（監査対象外）。
// 事前に `python -m http.server 8000` (または UX_BASE_URL) が必要。
//   node tools/display-terminology-check.mjs

import { chromium } from 'playwright';

const BASE_URL = process.env.UX_BASE_URL || 'http://127.0.0.1:8000/';
const VIEWPORTS = {
  'iphone-se': { width: 375, height: 667 },
  'iphone-16e': { width: 393, height: 852 }
};

// CH4 の正解（INNER JOIN）。CH4 成功画面まで進めるために使う。
const CH4_SOLUTION = ['SELECT', 'p.legal_name', 'a.gate', 'a.time', 'FROM', 'PERSON_INDEX',
  'AS', 'p', 'INNER JOIN', 'ACCESS_LOG', 'AS', 'a', 'ON', 'p.credential_id', '=',
  'a.credential_id', 'WHERE', 'a.gate', '=', "'S4-P6'"];

// canonical label は内部識別子そのもの。装飾や言い換えを検出するための禁止パターン。
const DECORATION = /[📋📊表（）()、。]|^\s|\s$/;

let failCount = 0;
function check(label, ok, detail){
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined && detail !== '' ? '  ' + detail : ''}`);
  if(!ok) failCount++;
}

async function boot(ctx, stageIndex){
  const page = await ctx.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.addInitScript(idx => {
    window.__NEON_TEST_CONFIG__ = { enabled: true, evidenceSilenceMs: 300 };
    localStorage.setItem('caravan_intro_seen', 'true');
    localStorage.setItem('caravan_tutorial_seen', 'true');
    localStorage.setItem('caravan_progress', JSON.stringify({
      stage: idx, xp: 0,
      cleared: [true, true, true, true, false],
      clearTypes: [null, null, null, null, null]
    }));
  }, stageIndex);
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  const ov = await page.waitForSelector('#storyOverlay.show', { timeout: 4000 }).catch(() => null);
  if(ov) await page.click('#storyContinueBtn');
  const sh = await page.waitForSelector('#ch1Sheet.show', { timeout: 4000 }).catch(() => null);
  if(sh) await page.click('#ch1SheetPrimary');
  return { page, jsErrors };
}

// 表示ラベル要素を「文言 + 省略されているか」で採取する。
async function collect(page, screen, selector, kind){
  return page.$$eval(selector, (els, meta) => els
    .filter(e => e.checkVisibility ? e.checkVisibility() : true)
    .map(e => ({
      screen: meta.screen,
      kind: meta.kind,
      selector: meta.selector,
      text: e.textContent.trim(),
      // 実際に切り詰められているか（ellipsis / clip を問わず）
      clipped: e.scrollWidth > e.clientWidth + 1
    })), { screen, kind, selector });
}

async function auditViewport(browser, vpName){
  const ctx = await browser.newContext({ viewport: VIEWPORTS[vpName], hasTouch: true, isMobile: true });
  const labels = [];
  const errors = [];
  try {
    // ---- CH4: Query 画面（schema）→ Success 画面（ZONE 1 / ZONE 2） ----
    {
      const { page, jsErrors } = await boot(ctx, 3);
      await page.waitForSelector('#tokenPad .tok', { timeout: 30000 });
      labels.push(...await collect(page, 'QUERY', '.schema-card h4', 'table'));
      labels.push(...await collect(page, 'QUERY', '.schema-card table.mini th', 'field'));

      for(const t of CH4_SOLUTION){
        const el = await page.$(`.tok[data-token="${t}"]`);
        if(el && !(await el.isDisabled())) await el.click();
      }
      await page.click('#runBtn');
      const bar = await page.waitForSelector('#predictBar.show', { timeout: 8000 }).catch(() => null);
      if(bar) await page.click('.predict-btn[data-rows="1"]').catch(async () => {
        const btns = await page.$$('.predict-btn'); if(btns[1]) await btns[1].click();
      });
      await page.waitForFunction(() => document.body.dataset.workspace === 'success',
        null, { timeout: 15000 });

      await page.click('.zone-header[data-zone="problem"]');
      labels.push(...await collect(page, 'SUCCESS_ZONE1', '#zoneProblemBody .zone-table h5', 'table'));
      labels.push(...await collect(page, 'SUCCESS_ZONE1', '#zoneProblemBody .zone-grid th', 'field'));
      await page.click('.zone-header[data-zone="result"]');
      labels.push(...await collect(page, 'SUCCESS_ZONE2', '#zoneResultBody .zone-grid th', 'field'));
      errors.push(...jsErrors);
      await page.close();
    }
    // ---- CH5: Relation Task ----
    {
      const { page, jsErrors } = await boot(ctx, 4);
      await page.waitForSelector('#relationPanel.show', { timeout: 30000 });
      labels.push(...await collect(page, 'RELATION', '.rq-card-name', 'table'));
      labels.push(...await collect(page, 'RELATION', '.rq-k', 'field'));
      await page.click('.relation-missing');
      labels.push(...await collect(page, 'RELATION', '.rq-key-l', 'field'));
      labels.push(...await collect(page, 'RELATION', '.rq-table th', 'field'));
      await page.click('.relation-source-row[data-source="T-S4-03"]');
      labels.push(...await collect(page, 'RELATION_MATCH', '.rq-cmp-l', 'field'));
      errors.push(...jsErrors);
      await page.close();
    }
  } finally {
    await ctx.close();
  }
  return { labels, errors };
}

(async () => {
  const browser = await chromium.launch();
  const perVp = {};
  try {
    for(const vp of Object.keys(VIEWPORTS)){
      const r = await auditViewport(browser, vp);
      perVp[vp] = r;
      check(`[${vp}] JSエラーなし`, r.errors.length === 0, r.errors.slice(0, 2).join(' | '));
      check(`[${vp}] 表示ラベルを採取できた`, r.labels.length > 0, `count=${r.labels.length}`);
    }
  } catch(err){
    check('実行時例外なし', false, err.stack ? err.stack.split('\n')[0] : err.message);
  } finally {
    await browser.close();
  }
  if(failCount === 0){
    const A = perVp['iphone-se'].labels, B = perVp['iphone-16e'].labels;
    const sig = ls => ls.map(l => `${l.screen}|${l.kind}|${l.text}`).sort().join('\n');

    // ---- rule 1: 端末別に表示名を変えない ----
    const onlyA = sig(A).split('\n').filter(x => !sig(B).split('\n').includes(x));
    const onlyB = sig(B).split('\n').filter(x => !sig(A).split('\n').includes(x));
    check('[rule 1] SE と 16e で表示ラベルが一致する',
      onlyA.length === 0 && onlyB.length === 0,
      onlyA.concat(onlyB).slice(0, 4).join(' / '));

    // ---- rule 8: 省略表示を通常状態として許容しない ----
    const clipped = A.concat(B).filter(l => l.clipped);
    check('[rule 8] 省略された表示ラベルが無い', clipped.length === 0,
      clipped.slice(0, 6).map(l => `${l.screen}:${l.selector}"${l.text}"`).join(' / '));

    // ---- rule 3 / 6: 表示ラベルは内部識別子のまま（装飾・言い換え禁止） ----
    const decorated = A.filter(l => DECORATION.test(l.text));
    check('[rule 3/6] 表示ラベルに装飾・和訳の混入が無い', decorated.length === 0,
      decorated.slice(0, 6).map(l => `${l.screen}:"${l.text}"`).join(' / '));

    // ---- rule 2 / 7: 1識別子 = 1 canonical label ----
    // 同じ識別子の前置（terminal_id → terminal 等の短縮）が混在していないかを検出する。
    const texts = [...new Set(A.map(l => l.text))];
    const shortened = [];
    for(const a of texts){
      for(const b of texts){
        if(a !== b && b.startsWith(a) && /^[a-z_]+$/.test(a) && /^[a-z_]+$/.test(b)){
          shortened.push(`${a} ⊂ ${b}`);
        }
      }
    }
    check('[rule 2/7] 同一識別子の短縮表記が混在しない', shortened.length === 0,
      shortened.slice(0, 6).join(' / '));

    // ---- rule 2: 同じ field が画面をまたいで同じ表記であること（存在確認） ----
    const fieldScreens = {};
    for(const l of A.filter(l => l.kind === 'field')){
      (fieldScreens[l.text] ||= new Set()).add(l.screen);
    }
    const crossScreen = Object.entries(fieldScreens).filter(([, s]) => s.size > 1);
    check('[rule 2] 複数画面に出る field が同一表記で照合できる', crossScreen.length > 0,
      `${crossScreen.length} fields`);
  }
  console.log('');
  console.log(`FAIL_COUNT: ${failCount}`);
  process.exit(failCount === 0 ? 0 : 1);
})();
