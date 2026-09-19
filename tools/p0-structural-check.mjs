// tools/p0-structural-check.mjs
// STRUCTURAL STABILIZATION / P0 VERIFICATION
//
// 構造監査で指摘された疑いを、推測ではなく再現テストで確定する。
//   A ASYNC CHAPTER IDENTITY  : 実行中に章が変わると、古い結果が新しい章へcommitされる
//   B SESSION REUSE           : 同章retry / 別章遷移で state が誤って再利用される
//   C RESTART STATE BOUNDARY  : NEW GAME / RETRY / RESTART / NEXT で reset/preserve が崩れる
//   F SOURCE DATA OWNERSHIP   : Engineへ渡した表と、UIへ出した表が食い違う
//   G ALTERNATIVE SQL TEXT    : 別解を受理するのに「唯一の正解」と表示する
//
// D (SELECT * + ORDER BY) と E (NULL/""/0) は tools/sql-engine-test.js 側で検証する。
// 事前に `python -m http.server 8000` (または UX_BASE_URL) が必要。
//   node tools/p0-structural-check.mjs

import { chromium } from 'playwright';
import { campaignProgress, learningCompletedPayload, storyStage, STORY_OFFSET } from './campaign-index.mjs';

const BASE_URL = process.env.UX_BASE_URL || 'http://127.0.0.1:8000/';
const VP = { width: 393, height: 852 };

const CH1 = ['SELECT', 'resident_id', 'display_name', 'FROM', 'RESIDENT_CACHE',
  'WHERE', 'status', '=', "'MISSING'", 'AND', 'last_sector', '=', "'S4'"];

let failCount = 0;
function check(label, ok, detail){
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined && detail !== '' ? '  ' + detail : ''}`);
  if(!ok) failCount++;
}

async function boot(ctx, opts = {}){
  const page = await ctx.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.addInitScript(o => {
    window.__NEON_TEST_CONFIG__ = { enabled: true, evidenceSilenceMs: o.silence ?? 300 };
    localStorage.setItem('caravan_intro_seen', 'true');
    localStorage.setItem('caravan_tutorial_seen', 'true');
    // campaign は M01〜M12 + CHAPTER 1〜6。本編を検証するので学習章は完了済みにする。
    localStorage.setItem('neon_relay_campaign_v2', JSON.stringify(o.learning));
    localStorage.setItem('caravan_progress', JSON.stringify(o.progress));
  }, { ...opts, learning: learningCompletedPayload(),
       progress: opts.progress || campaignProgress({ story: 0 }) });
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  const ov = await page.waitForSelector('#storyOverlay.show', { timeout: 4000 }).catch(() => null);
  if(ov) await page.click('#storyContinueBtn');
  const sh = await page.waitForSelector('#ch1Sheet.show', { timeout: 4000 }).catch(() => null);
  if(sh) await page.click('#ch1SheetPrimary');
  await page.waitForSelector('#tokenPad .tok', { timeout: 30000 }).catch(() => {});
  return { page, jsErrors };
}

async function tapAll(page, tokens){
  for(const t of tokens){
    const el = await page.$(`.tok[data-token="${t}"]`);
    if(el && !(await el.isDisabled())) await el.click();
  }
}

async function gotoStage(page, i){
  await page.click('#stageLabel');
  await page.waitForSelector('#stageDrawer.show', { timeout: 5000 });
  await page.click(`#stageDrawerBody .stage-item[data-stage="${i}"]`);
  await page.waitForFunction(() => !document.getElementById('stageDrawer').classList.contains('show'),
    null, { timeout: 5000 });
}

const progressOf = page => page.evaluate(() => {
  try { return JSON.parse(localStorage.getItem('caravan_progress')) || null; } catch(e){ return null; }
});

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VP, hasTouch: true, isMobile: true });
  try {
    // ================= A: ASYNC CHAPTER IDENTITY =================
    // CH1 は正解後に沈黙演出の await がある。その最中に別章へ移動する。
    {
      const { page, jsErrors } = await boot(ctx, { silence: 4000 });
      await tapAll(page, CH1);
      await page.click('#runBtn');
      await page.waitForSelector('#predictBar.show', { timeout: 8000 });
      await page.click('.predict-btn[data-rows="3"]');
      // await 中であることを確認してから CH3 へ移動する
      await page.waitForFunction(() => document.body.dataset.phase === 'EVIDENCE_REVEALED',
        null, { timeout: 8000 });
      await gotoStage(page, storyStage(2));
      const movedAt = await page.evaluate(() => ({
        level: document.getElementById('missionLevel').textContent.trim(),
        xp: document.getElementById('xp').textContent.trim()
      }));
      // 沈黙が明けるのを待つ（古い実行が commit されるならこの間に起きる）
      await page.waitForTimeout(5000);
      const after = await page.evaluate(() => ({
        level: document.getElementById('missionLevel').textContent.trim(),
        workspace: document.body.dataset.workspace || null,
        stageLabel: document.getElementById('stageLabel').textContent.replace(/\s/g, ''),
        xp: document.getElementById('xp').textContent.trim(),
        tokenPadVisible: document.getElementById('tokenPad').checkVisibility()
      }));
      const prog = await progressOf(page);
      check('[A] 実行中に章が変わっても、古い結果が新章へcommitされない',
        after.workspace !== 'success' && /CHAPTER 3/.test(after.level),
        JSON.stringify({ movedAt: movedAt.level, after }));
      // progress が保存されていないこと自体が「commitしていない」証拠。
      // 保存されている場合は、移動先の章が cleared になっていないことを要求する。
      check('[A] 移動先の章が勝手にclearedにならない',
        !prog || prog.cleared[storyStage(2)] === false, JSON.stringify(prog && prog.cleared));
      check('[A] 移動後もSQL組み立てUIが使える（成功画面に乗っ取られない）',
        after.tokenPadVisible, JSON.stringify(after));
      check('[A] JSエラーなし', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | '));
      await page.close();
    }

    // ================= B: SESSION REUSE =================
    // CH1 を正解 → CH2 へ移動したとき、CH1 の draft / assist / success が残らないこと。
    {
      const { page } = await boot(ctx, { silence: 300 });
      // assist state を作る（CH1 は専用レイアウトでヒントボタンが隠れることがある）
      const hintBtn = await page.$('#hintBtn');
      if(hintBtn && await hintBtn.isVisible()) await hintBtn.click().catch(() => {});
      // ヒントがシートで開く場合、スクリムが後続のタップを塞ぐので閉じる
      const hintSheet = await page.$('#ch1Sheet.show');
      if(hintSheet) await page.click('#ch1SheetPrimary').catch(() => {});
      await page.waitForTimeout(200);
      await tapAll(page, CH1.slice(0, 3));             // draft を作る
      const ch1Draft = (await page.textContent('#monitor')).trim();
      await gotoStage(page, storyStage(1));
      const ch2 = await page.evaluate(() => ({
        monitor: document.getElementById('monitor').textContent.trim(),
        assist: document.querySelectorAll('.assist-dot.on, .assist-on').length,
        hintVisible: document.getElementById('hintLine').checkVisibility(),
        workspace: document.body.dataset.workspace || null,
        feedback: document.getElementById('feedback').textContent.trim()
      }));
      check('[B] 章を移るとSQL draftが持ち越されない',
        ch2.monitor !== ch1Draft && !/resident_id/.test(ch2.monitor),
        `ch1="${ch1Draft}" ch2="${ch2.monitor}"`);
      check('[B] 章を移るとヒント表示が持ち越されない', !ch2.hintVisible, JSON.stringify(ch2));
      check('[B] 章を移ると feedback が持ち越されない', ch2.feedback === '', `"${ch2.feedback}"`);

      // 同章 retry: draft は消え、assist は Mission 単位で維持されるべきか確認する
      await tapAll(page, ['SELECT', 'destination']);
      const before = (await page.textContent('#monitor')).trim();
      await page.click('[data-util="clear"]');
      const afterClear = (await page.textContent('#monitor')).trim();
      check('[B] 同章内の全消去でdraftだけが消える',
        before !== afterClear && afterClear.replace(/\s/g, '').length === 0,
        `before="${before}" after="${afterClear}"`);
      await page.close();
    }

    // ================= C: RESTART STATE BOUNDARY =================
    // 復元事実を持った状態で NEW GAME 相当（進捗なしで起動）した場合の残留を見る。
    {
      // 1) CH5 を解いて reconstructedFacts を作る
      const { page } = await boot(ctx, {
        silence: 300,
        progress: campaignProgress({ story: 4, storyCleared: [true, true, true, true, false, false] })
      });
      await page.waitForSelector('#relationPanel.show', { timeout: 20000 });
      await page.click('.relation-missing');
      await page.click('.relation-source-row[data-source="T-S4-03"]');
      await page.click('#runBtn');
      await page.waitForTimeout(600);
      const saved = await progressOf(page);
      check('[C] Relation成功で reconstructedFacts が保存される',
        !!saved && !!saved.reconstructedFacts && saved.reconstructedFacts['EVAC_RECEPTION.E442.resident_id'] === 'R005',
        JSON.stringify(saved && saved.reconstructedFacts));

      // 2) 同じ localStorage のまま「最初から」= 再開を断る経路を通す
      await page.evaluate(() => {
        const p = JSON.parse(localStorage.getItem('caravan_progress'));
        p.stage = 3;            // 再開ダイアログが出る状態にする
        localStorage.setItem('caravan_progress', JSON.stringify(p));
      });
      await page.close();

      const ctx2 = await browser.newContext({ viewport: VP, hasTouch: true, isMobile: true });
      const p2 = await ctx2.newPage();
      p2.on('dialog', d => d.dismiss());   // 「続きから再開しますか？」に No
      await p2.addInitScript(seed => {
        window.__NEON_TEST_CONFIG__ = { enabled: true, evidenceSilenceMs: 300 };
        localStorage.setItem('caravan_intro_seen', 'true');
        localStorage.setItem('caravan_tutorial_seen', 'true');
        localStorage.setItem('neon_relay_campaign_v2', JSON.stringify(seed.learning));
        localStorage.setItem('caravan_progress', JSON.stringify(seed.progress));
      }, { learning: learningCompletedPayload(),
           progress: campaignProgress({ story: 3, xp: 500,
             storyCleared: [true, true, true, true, true, false],
             reconstructedFacts: { 'EVAC_RECEPTION.E442.resident_id': 'R005' } }) });
      await p2.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await p2.waitForSelector('#tokenPad .tok', { timeout: 30000 }).catch(() => {});
      const reset = await progressOf(p2);
      check('[C] NEW GAME（再開しない）で reconstructedFacts が残らない',
        !!reset && (!reset.reconstructedFacts || Object.keys(reset.reconstructedFacts).length === 0),
        JSON.stringify(reset && reset.reconstructedFacts));
      check('[C] NEW GAME で xp / cleared もリセットされる',
        !!reset && reset.xp === 0 && reset.cleared.every(c => c === false),
        JSON.stringify(reset && { xp: reset.xp, cleared: reset.cleared }));
      await ctx2.close();
    }

    // ================= F: SOURCE DATA OWNERSHIP =================
    // Engineへ渡した表(queryTables) と UIへ出した表 が一致すること。
    {
      const { page } = await boot(ctx, {
        silence: 300,
        progress: campaignProgress({ story: 5, storyCleared: [true, true, true, true, true, false],
          reconstructedFacts: { 'EVAC_RECEPTION.E442.resident_id': 'R005' } })
      });
      const shown = await page.evaluate(() => {
        const card = [...document.querySelectorAll('.schema-card')]
          .find(c => c.querySelector('.schema-name').textContent.includes('EVAC_RECEPTION'));
        if(!card) return null;
        if(!card.open) card.querySelector('summary').click();
        const tr = [...card.querySelectorAll('tbody tr')].find(r => r.textContent.includes('E442'));
        return tr ? [...tr.querySelectorAll('td')].map(t => t.textContent.trim()) : null;
      });
      check('[F] UIが出すSource表が復元後のsnapshotである（RAWのnullを出さない）',
        !!shown && shown.includes('R005') && !shown.includes('—'), JSON.stringify(shown));

      // 復元事実が無い状態では、同じ画面を描かないこと（CH5へ戻される）
      const { page: p3 } = await boot(ctx, {
        silence: 300,
        progress: campaignProgress({ story: 5, storyCleared: [true, true, true, true, false, false] })
      });
      await p3.waitForTimeout(1200);
      const gated = await p3.evaluate(() => ({
        relation: !!document.querySelector('#relationPanel.show'),
        level: document.getElementById('missionLevel').textContent.trim()
      }));
      check('[F] 復元前はCH6のSource表を描かない（RAW/RECONSTRUCTEDを混在させない）',
        gated.relation, JSON.stringify(gated));
      await p3.close();
      await page.close();
    }

    // ================= G: ALTERNATIVE SQL TEXT =================
    // 別解を受理する章で「この形が唯一の正解。」と表示していないこと。
    {
      // answers が1件しか無い章（CH2）でも、Engineは result-equivalent な別解を受理する。
      // したがって「この形が唯一の正解。」は事実に反する。
      const CH2 = ['SELECT', 'destination', 'SUM(quantity)', 'AS', 'total_quantity',
        'FROM', 'SUPPLY_TRANSFER_0911', 'GROUP BY', 'destination'];
      for(const [label, stage, tokens, rows] of [['CH1', 0, CH1, '3'], ['CH2', 1, CH2, '4']]){
        const { page } = await boot(ctx, { silence: 300 });
        if(stage !== 0) await gotoStage(page, storyStage(stage));
        await tapAll(page, tokens);
        await page.click('#runBtn');
        await page.waitForSelector('#predictBar.show', { timeout: 8000 });
        await page.click(`.predict-btn[data-rows="${rows}"]`);
        await page.waitForFunction(() => document.body.dataset.workspace === 'success',
          null, { timeout: 15000 });
        const zone = await page.evaluate(() => {
          const b = document.getElementById('zoneResultBody');
          return b ? b.textContent.replace(/\s+/g, ' ').trim() : '';
        });
        check(`[G] ${label}: 別解を受理する章で「唯一の正解」と断定していない`,
          !/唯一の正解/.test(zone), zone.slice(-90));
        await page.close();
      }
    }
  } catch(err){
    check('実行時例外なし', false, err.stack ? err.stack.split('\n').slice(0, 2).join(' ') : err.message);
  } finally {
    await ctx.close();
    await browser.close();
  }
  console.log('');
  console.log(`FAIL_COUNT: ${failCount}`);
  process.exit(failCount === 0 ? 0 : 1);
})();
