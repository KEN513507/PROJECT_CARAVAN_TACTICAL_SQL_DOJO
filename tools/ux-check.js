// tools/ux-check.js
const { chromium } = require('playwright');

const URL = 'http://127.0.0.1:8000/';
const VIEWPORTS = [
  { name: 'iPhone 16e', width: 393, height: 852 },
  { name: 'iPhone SE',  width: 375, height: 667 },
  { name: 'PC',         width: 1280, height: 800 }
];

const REPORT = [];
let FAIL_COUNT = 0;

function log(view, step, status, note=''){
  const line = `[${view}] ${status} | ${step}${note ? ' | ' + note : ''}`;
  REPORT.push(line);
  if(status === 'FAIL') FAIL_COUNT++;
  console.log(line);
}

async function wait(ms){ return new Promise(r => setTimeout(r, ms)); }

async function tapToken(page, text, kind){
  const sel = kind
    ? `.tok[data-token="${text}"][data-kind="${kind}"]`
    : `.tok[data-token="${text}"]`;
  const el = await page.$(sel);
  if(!el){ throw new Error(`token not found: ${sel}`); }
  const disabled = await el.getAttribute('disabled');
  if(disabled !== null){ throw new Error(`token disabled: ${sel}`); }
  await el.click();
  await wait(80);
}

async function runViewport(browser, vp){
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height }
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => {
    if(m.type() === 'error'){
      const t = m.text();
      // AudioContext 警告は既知で無害なので除外
      if(t.includes('AudioContext was not allowed')) return;
      errors.push(t);
    }
  });
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));

  try {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await wait(400);

    // 1. スキーマ表示
    const schemaCount = await page.locator('.schema-card').count();
    log(vp.name, 'schema visible',
      schemaCount > 0 ? 'PASS' : 'FAIL', `cards=${schemaCount}`);

    // 2. 初期状態: SELECTのみ有効
    const enabled = await page.$$eval('.tok:not([disabled])',
      els => els.map(e => e.getAttribute('data-token')));
    log(vp.name, 'initial enabled tokens',
      enabled.length === 1 && enabled[0] === 'SELECT' ? 'PASS' : 'FAIL',
      JSON.stringify(enabled));

    // 3. トークンシーケンス（MISSION 1 の正解パス）
    const seq = [
      ['SELECT', 'clause'],
      ['resident_id', 'col'],
      ['display_name', 'col'],
      ['FROM', 'clause'],
      ['RESIDENT_CACHE', 'table'],
      ['WHERE', 'clause'],
      ['status', 'col'],
      ['=', 'op'],
      ["'MISSING'", 'lit'],
      ['AND', 'and'],
      ['last_sector', 'col'],
      ['=', 'op'],
      ["'S4'", 'lit']
    ];

    let seqOk = true;
    for(const [t, k] of seq){
      try { await tapToken(page, t, k); }
      catch(e){
        seqOk = false;
        log(vp.name, `tap ${t}`, 'FAIL', e.message);
        break;
      }
    }
    if(seqOk) log(vp.name, 'full token sequence', 'PASS');

    // 4. モニター内容の確認
    const monitorText = (await page.locator('#monitor').textContent()) || '';
    const monitorOk = monitorText.includes('SELECT')
      && monitorText.includes('RESIDENT_CACHE')
      && monitorText.includes("'MISSING'")
      && monitorText.includes("'S4'");
    log(vp.name, 'monitor content',
      monitorOk ? 'PASS' : 'FAIL',
      monitorText.slice(0, 80));

    // 5. 予測バーが出るか（実行前）
    const predictBefore = await page.locator('#predictBar.show').count();
    log(vp.name, 'predict bar shown after build',
      'INFO', `visible=${predictBefore}`);

    // 6. 実行ボタン押下
    const runBtn = await page.$('#runBtn');
    if(!runBtn){ log(vp.name, 'run button', 'FAIL', 'not found'); }
    else {
      await runBtn.click();
      await wait(300);

      // 6a. 予測バーが表示されたか（予測モーダルが出る場合）
      const predictShown = await page.locator('#predictBar.show').count();
      if(predictShown > 0){
        // 予測選択肢があれば「3行」をタップ（MISSION 1 の正解行数）
        const choices = await page.$$('#predictChoices .predict-btn');
        if(choices.length > 0){
          // 正解行数に対応するボタンを探す
          let tapped = false;
          for(const c of choices){
            const txt = await c.textContent();
            if(txt && txt.includes('3')){
              await c.click();
              tapped = true;
              break;
            }
          }
          if(!tapped) await choices[0].click();
          await wait(400);
        }
      }

      // 6b. 実行後の状態確認
      await wait(600);
    }

    // 7. 正解フィードバック
    const feedbackText = (await page.locator('#feedback').textContent()) || '';
    const feedbackOk = feedbackText.includes('正解') || feedbackText.includes('✅');
    log(vp.name, 'feedback on correct',
      feedbackOk ? 'PASS' : 'FAIL',
      feedbackText.slice(0, 60));

    // 8. 実行結果パネル
    const resultPanelShown = await page.locator('#resultPanel.show').count();
    log(vp.name, 'result panel',
      resultPanelShown > 0 ? 'PASS' : 'FAIL',
      `shown=${resultPanelShown}`);

    // 9. 別解パネル
    const altPanelShown = await page.locator('#altPanel.show').count();
    log(vp.name, 'alt answer panel',
      'INFO', `shown=${altPanelShown}`);

    // 10. NORA LOG / revealPanel
    const revealShown = await page.locator('#revealPanel.show').count();
    log(vp.name, 'nora log panel',
      'INFO', `shown=${revealShown}`);

    // 11. 次の照会ボタン
    const runText = (await page.locator('#runBtn').textContent()) || '';
    log(vp.name, 'next stage button',
      runText.includes('次') ? 'PASS' : 'FAIL',
      runText.trim());

    // 12. BGM 要素の存在
    const audioCount = await page.evaluate(
      () => document.querySelectorAll('audio').length);
    log(vp.name, 'audio element count',
      'INFO', `audio=${audioCount}`);

    // 13. Console エラー
    if(errors.length === 0){
      log(vp.name, 'console errors', 'PASS', 'none');
    } else {
      log(vp.name, 'console errors', 'FAIL', errors.slice(0, 3).join(' / '));
    }

    // 14. スクリーンショット
    const shot = `tools/ux-${vp.name.replace(/\s+/g,'_')}.png`;
    await page.screenshot({ path: shot, fullPage: false });
    log(vp.name, 'screenshot saved', 'INFO', shot);

  } catch(e){
    log(vp.name, 'exception', 'FAIL', e.message);
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  for(const vp of VIEWPORTS){
    console.log(`\n===== ${vp.name} (${vp.width}x${vp.height}) =====`);
    await runViewport(browser, vp);
  }
  await browser.close();

  console.log('\n===== SUMMARY =====');
  console.log(REPORT.join('\n'));
  console.log(`\nFAIL_COUNT=${FAIL_COUNT}`);
  process.exit(FAIL_COUNT > 0 ? 1 : 0);
})();