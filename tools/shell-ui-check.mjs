// tools/shell-ui-check.mjs
// ============================================================
// SHELL の画面が遷移表どおりに動くかを実ブラウザで確かめる。
// （tools/shell-state-check.mjs は遷移表そのものの検証。こちらは画面と保存の実物）
//
//   初回起動: スタート画面が出る / 「つづきから」は無い
//   はじめから: そのまま M01 が始まる
//   再訪: 「つづきから」が出て、続きの場所が書いてある
//   つづきから: 進捗を消さずに再開する
//   はじめから(保存あり): 確認を挟む / やめれば消えない / 消して始めれば消える
//   設定: 来た画面へ戻る / 変更が残る
//   プレイ中の設定からタイトルへ戻れる
// ============================================================
import { chromium } from 'playwright';
import { BASE_URL, enterCampaign, solveMission } from './onboarding-ui-helpers.mjs';

let failed = 0;
const check = (name, ok, detail = '') => {
  if(ok) console.log(`  PASS  ${name}`);
  else { failed++; console.log(`  FAIL  ${name}${detail ? '  -- ' + detail : ''}`); }
};

const screen = page => page.evaluate(() => document.body.dataset.shell ?? null);
const btn = (page, event) => page.locator(`[data-shell-event="${event}"]`);
const saved = page => page.evaluate(() => ({
  progress: localStorage.getItem('caravan_progress'),
  learning: localStorage.getItem('neon_relay_campaign_v2')
}));

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('dialog', d => { failed++; console.log('  FAIL  ブラウザのダイアログが出た: ' + d.message()); d.dismiss(); });

console.log('[初回起動]');
await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
await page.locator('body[data-shell]').waitFor();
check('スタート画面が出る（いきなり始まらない）', await screen(page) === 'TITLE', await screen(page));
check('タイトルが見えている', (await page.locator('.shell-logo').textContent()).includes('NEON RELAY'));
check('保存が無いので「つづきから」は無い', await btn(page, 'CONTINUE').count() === 0);
check('「はじめから」がある', await btn(page, 'NEW_GAME').count() === 1);
check('「設定」がある', await btn(page, 'OPEN_SETTINGS').count() === 1);
check('本編のUIはまだ見えない', await page.locator('#shell').isVisible() && !(await page.evaluate(() => document.body.classList.contains('learning-ui'))));

console.log('[設定: スタート画面から]');
await btn(page, 'OPEN_SETTINGS').click();
check('設定画面へ移る', await screen(page) === 'SETTINGS', await screen(page));
check('タイトルから開いたので「タイトルへ戻る」は出ない', await btn(page, 'QUIT').count() === 0);
await page.locator('[data-setting="bgmVolume"]').fill('40');
// 実プレイと同じく、行（ラベル）をタップして切り替える
await page.locator('.shell-row').filter({ hasText: '音を鳴らす' }).click();
const storedVolume = await page.evaluate(() => localStorage.getItem('neon_relay_bgm_volume'));
const storedMute = await page.evaluate(() => localStorage.getItem('caravan_muted'));
check('BGM音量の変更がこの端末に残る', storedVolume === '0.4', String(storedVolume));
check('音のオンオフがこの端末に残る', storedMute === 'true', String(storedMute));
await btn(page, 'BACK').click();
check('戻るとスタート画面', await screen(page) === 'TITLE', await screen(page));

console.log('[はじめから]');
await btn(page, 'NEW_GAME').click();
check('保存が無いので確認は挟まない', await screen(page) === 'PLAY', await screen(page));
await page.locator('body.learning-ui').waitFor();
await page.locator('#monitor .query-token').first().waitFor();
check('M01 が始まる', (await page.locator('#stageLabel').textContent()).includes('M01'));
check('スタート画面は引っ込む', await page.locator('#shell').isHidden());

console.log('[プレイ中の設定]');
await page.locator('#settingsBtn').click();
check('プレイ中から設定を開ける', await screen(page) === 'SETTINGS', await screen(page));
check('プレイ中なので「タイトルへ戻る」が出る', await btn(page, 'QUIT').count() === 1);
check('設定で変えた値が引き継がれている', await page.locator('[data-setting="bgmVolume"]').inputValue() === '40');
await btn(page, 'BACK').click();
check('戻るとプレイに戻る', await screen(page) === 'PLAY', await screen(page));
check('照会の画面がそのまま残っている', await page.locator('#monitor .query-token').first().isVisible());

console.log('[進捗を作ってからタイトルへ戻る]');
await solveMission(page, 1);
await page.locator('#settingsBtn').click();
await btn(page, 'QUIT').click();
check('タイトルへ戻れる', await screen(page) === 'TITLE', await screen(page));
check('戻ったらスタート画面が見える', await page.locator('#shell').isVisible());
const afterQuit = await saved(page);
check('戻っても保存は消えない', !!afterQuit.learning);
check('「つづきから」が出るようになる', await btn(page, 'CONTINUE').count() === 1);
const summary = await page.locator('.shell-sub').textContent().catch(() => '');
check('続きの場所が書いてある', /M0\d|CHAPTER/.test(summary), summary);

console.log('[つづきから]');
await btn(page, 'CONTINUE').click();
check('プレイへ戻る', await screen(page) === 'PLAY', await screen(page));
await page.locator('body.learning-ui').waitFor();
const afterContinue = await saved(page);
check('つづきからで保存を消さない', !!afterContinue.learning);

console.log('[はじめから: 保存があるとき]');
await page.locator('#settingsBtn').click();
await btn(page, 'QUIT').click();
await btn(page, 'NEW_GAME').click();
check('いきなり始めずに確認を挟む', await screen(page) === 'CONFIRM_NEW', await screen(page));
check('確認の時点ではまだ消えていない', !!(await saved(page)).learning);
await btn(page, 'CANCEL').click();
check('やめるとスタート画面へ戻る', await screen(page) === 'TITLE', await screen(page));
check('やめたので保存は残っている', !!(await saved(page)).learning);
check('「つづきから」もまだある', await btn(page, 'CONTINUE').count() === 1);

await btn(page, 'NEW_GAME').click();
await btn(page, 'CONFIRM').click();
check('消して始めるとプレイへ移る', await screen(page) === 'PLAY', await screen(page));
await page.locator('body.learning-ui').waitFor();
const afterWipe = await saved(page);
check('本編の保存が消えている', !afterWipe.progress, String(afterWipe.progress));
const completed = afterWipe.learning ? Object.keys(JSON.parse(afterWipe.learning).completed || {}).length : 0;
check('学習の完了も消えている', completed === 0, String(completed));
check('M01 から始まる', (await page.locator('#stageLabel').textContent()).includes('M01'));

console.log('[後始末]');
check('JSエラーが無い', errors.length === 0, errors.join(' | '));

await browser.close();
console.log(failed ? `\nSHELL UI GATE: FAIL (${failed})` : '\nSHELL UI GATE: PASS');
process.exit(failed ? 1 : 0);
