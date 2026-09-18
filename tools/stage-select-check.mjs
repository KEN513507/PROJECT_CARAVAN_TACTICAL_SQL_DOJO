// tools/stage-select-check.mjs
// DEBUG_ALL_STAGES: ステージセレクタから全章へ跳べること、
// および跳んだ先の画面が整合していること（前章のUIやタイマーが残らない）を検証する。
// 事前に `python -m http.server 8000` (または UX_BASE_URL) が必要。
//   node tools/stage-select-check.mjs

import { chromium } from 'playwright';

const BASE_URL = process.env.UX_BASE_URL || 'http://127.0.0.1:8000/';
const VP = { width: 393, height: 852 };

let failCount = 0;
function check(label, ok, detail){
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? '  ' + detail : ''}`);
  if(!ok) failCount++;
}

async function noPageScroll(page){
  return page.evaluate(() => {
    const se = document.scrollingElement;
    const app = document.getElementById('app');
    return se.scrollHeight <= innerHeight + 1 && app.scrollHeight <= app.clientHeight + 1;
  });
}

async function openSelector(page){
  await page.click('#stageLabel');
  await page.waitForSelector('#stageDrawer.show', { timeout: 5000 });
}

const STAGE_COUNT = 6;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VP, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', d => d.dismiss());
  try {
    await page.addInitScript(() => {
      localStorage.setItem('caravan_intro_seen', 'true');
      localStorage.setItem('caravan_tutorial_seen', 'true');
    });
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForSelector('#tokenPad .tok', { timeout: 30000 });

    // ---- セレクタに全章が並び、全て選択可能であること ----
    await openSelector(page);
    const items = await page.$$eval('#stageDrawerBody .stage-item', els => els.map(el => ({
      name: el.textContent.trim().replace(/\s+/g, ' '),
      disabled: el.disabled,
      locked: el.classList.contains('locked')
    })));
    const title = await page.textContent('#stageDrawerTitle');
    check('DEBUGであることがタイトルに出る', /DEBUG/.test(title), title.trim());
    check('全章がセレクタに並ぶ', items.length === STAGE_COUNT, `count=${items.length}`);
    check('未クリア章も disabled でない', items.every(i => !i.disabled), JSON.stringify(items.map(i => i.disabled)));
    check('未クリア章に locked クラスが付かない', items.every(i => !i.locked), JSON.stringify(items.map(i => i.locked)));
    check('CH5(Relation Task)も選べる', /CH\.5/.test(items[4].name), items[4].name);
    check('CH6(SQL Investigation)も選べる', /CH\.6/.test(items[5].name), items[5].name);

    // ---- 各章へ跳んで画面の整合を確認 ----
    // 期待: CH1=ch1-ui + Query / CH2〜4=通常Query / CH5=Relation
    const expected = [
      { idx: 0, kind: 'query',    ch1ui: true },
      { idx: 1, kind: 'query',    ch1ui: false },
      { idx: 2, kind: 'query',    ch1ui: false },
      { idx: 3, kind: 'query',    ch1ui: false },
      { idx: 4, kind: 'relation', ch1ui: false },
      // CH6 は復元事実を前提にするため、未復元でCH5へ戻されるのが正しい挙動。
      { idx: 5, kind: 'relation', ch1ui: false, redirectsTo: 4 }
    ];
    for(const exp of expected){
      if(!(await page.isVisible('#stageDrawer.show'))) await openSelector(page);
      await page.click(`#stageDrawerBody .stage-item[data-stage="${exp.idx}"]`);
      await page.waitForFunction(() => !document.getElementById('stageDrawer').classList.contains('show'), null, { timeout: 5000 });

      if(exp.kind === 'relation'){
        await page.waitForSelector('#relationPanel.show', { timeout: 10000 });
      } else {
        await page.waitForSelector('#tokenPad .tok', { timeout: 10000 });
      }

      const st = await page.evaluate(() => {
        const vis = id => { const e = document.getElementById(id); return e && getComputedStyle(e).display !== 'none'; };
        return {
          label: document.getElementById('stageLabel').textContent.replace(/\s/g, ''),
          workspace: document.body.dataset.workspace || null,
          ch1ui: document.body.classList.contains('ch1-ui'),
          relationShown: vis('relationPanel'),
          tokenPadShown: vis('tokenPad'),
          monitorShown: vis('monitorWrap'),
          schemaShown: vis('schemaPanel'),
          tokens: document.querySelectorAll('#tokenPad .tok').length,
          timer: document.getElementById('timer').textContent.trim(),
          runLabel: document.getElementById('runBtn').textContent.trim()
        };
      });

      const shownCh = exp.redirectsTo !== undefined ? exp.redirectsTo + 1 : exp.idx + 1;
      check(`CH${exp.idx + 1}: HUDが該当章を示す`, st.label.includes(`CH.${shownCh}/${STAGE_COUNT}`), st.label);
      check(`CH${exp.idx + 1}: ch1-uiが期待どおり`, st.ch1ui === exp.ch1ui, `ch1ui=${st.ch1ui}`);

      if(exp.kind === 'relation'){
        check(`CH${exp.idx + 1}: Relation画面が出る`, st.relationShown && st.workspace === 'relation', JSON.stringify(st));
        check(`CH${exp.idx + 1}: Query専用UIが残っていない`,
          !st.tokenPadShown && !st.monitorShown && !st.schemaShown, JSON.stringify(st));
        check(`CH${exp.idx + 1}: タイマーが停止表示`, st.timer === '⏱ —', st.timer);
        check(`CH${exp.idx + 1}: 検証ボタン`, /復元内容を検証/.test(st.runLabel), st.runLabel);
      } else {
        check(`CH${exp.idx + 1}: Query画面が出る`, st.tokenPadShown && st.monitorShown && st.tokens > 0, JSON.stringify(st));
        check(`CH${exp.idx + 1}: Relation画面が残っていない`, !st.relationShown, `relationShown=${st.relationShown}`);
        check(`CH${exp.idx + 1}: タイマーが動作`, /^⏱ \d+s$/.test(st.timer), st.timer);
        check(`CH${exp.idx + 1}: 実行ボタン`, /実行/.test(st.runLabel), st.runLabel);
      }
      check(`CH${exp.idx + 1}: page scroll なし`, await noPageScroll(page));
    }

    // ---- Relation章 → Query章へ戻っても壊れない（workspace属性の残留チェック） ----
    await openSelector(page);
    await page.click('#stageDrawerBody .stage-item[data-stage="1"]');
    await page.waitForSelector('#tokenPad .tok', { timeout: 10000 });
    const back = await page.evaluate(() => ({
      workspace: document.body.dataset.workspace || null,
      tokenPadShown: getComputedStyle(document.getElementById('tokenPad')).display !== 'none',
      relationShown: getComputedStyle(document.getElementById('relationPanel')).display !== 'none'
    }));
    check('Relation章から戻ってもQuery UIが復帰する',
      back.tokenPadShown && !back.relationShown && back.workspace === null, JSON.stringify(back));

    check('JSエラーなし', jsErrors.length === 0, jsErrors.slice(0, 3).join(' | '));
  } catch(err){
    check('実行時例外なし', false, err.message);
  } finally {
    await ctx.close();
    await browser.close();
  }
  console.log('');
  console.log(`FAIL_COUNT: ${failCount}`);
  process.exit(failCount === 0 ? 0 : 1);
})();
