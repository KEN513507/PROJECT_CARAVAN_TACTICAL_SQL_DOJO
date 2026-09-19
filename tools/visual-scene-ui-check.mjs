// tools/visual-scene-ui-check.mjs
// VISUAL SCENE の実DOM検証（スタブ）。
//   FLAG OFF : 何も起きない（DOMを作らない / 既存UIへ影響しない）
//   FLAG ON  : 一枚絵 + 話者 + セリフがマージ表示され、▽ペンディング → 送り →
//              テキスト入力 → 保留 → 確定 → 終了 まで遷移する
// 事前に `python -m http.server 8000` (または UX_BASE_URL) が必要。
//   node tools/visual-scene-ui-check.mjs

import { chromium } from 'playwright';
import { campaignProgress, learningCompletedPayload } from './campaign-index.mjs';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'tools/ux-artifacts/scene');
const BASE_URL = process.env.UX_BASE_URL || 'http://127.0.0.1:8000/';
const VIEWPORTS = [
  { name: 'iPhone SE',  width: 375, height: 667, slug: 'iphone-se' },
  { name: 'iPhone 16e', width: 393, height: 852, slug: 'iphone-16e' }
];
const MIN_TAP = 44;

let failCount = 0;
function check(label, ok, detail){
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? '  ' + detail : ''}`);
  if(!ok) failCount++;
}

async function openApp(browser, vp){
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.addInitScript(seed => {
    localStorage.setItem('caravan_intro_seen', 'true');
    localStorage.setItem('caravan_tutorial_seen', 'true');
    // campaign は M01〜M12 + CHAPTER 1〜6。既存Query UIの非退行は本編CHAPTER 1で見る。
    localStorage.setItem('neon_relay_campaign_v2', JSON.stringify(seed.learning));
    localStorage.setItem('caravan_progress', JSON.stringify(seed.progress));
  }, { learning: learningCompletedPayload(), progress: campaignProgress({ story: 0 }) });
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForSelector('#tokenPad .tok', { timeout: 30000 });
  return { ctx, page, jsErrors };
}

async function tapInfo(page, selector){
  return page.$$eval(selector, els => els.map(el => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { h: Math.round(r.height), w: Math.round(r.width),
      inViewport: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
      onTop: !!hit && (hit === el || el.contains(hit)) };
  }));
}

async function noPageScroll(page){
  return page.evaluate(() => {
    const se = document.scrollingElement;
    return se.scrollHeight <= innerHeight + 1 && se.scrollWidth <= innerWidth + 1;
  });
}

async function runViewport(browser, vp){
  const tag = `[${vp.name}]`;
  const shotDir = path.join(SHOT_DIR, vp.slug);
  mkdirSync(shotDir, { recursive: true });
  const { ctx, page, jsErrors } = await openApp(browser, vp);
  try {
    // ================= FLAG OFF =================
    const off = await page.evaluate(() => ({
      sceneEl: !!document.getElementById('visualScene'),
      styleEl: !!document.getElementById('neon-visual-scene-style'),
      tokenPad: getComputedStyle(document.getElementById('tokenPad')).display !== 'none',
      flags: typeof window.__NEON_SCENE_FLAGS__
    }));
    check(`${tag} FLAG OFF: シーンDOMを作らない`, !off.sceneEl && !off.styleEl, JSON.stringify(off));
    check(`${tag} FLAG OFF: 既存UI(Token Pad)は通常どおり`, off.tokenPad);
    check(`${tag} FLAG OFF: フラグは未定義`, off.flags === 'undefined', off.flags);

    // mount を呼んでもフラグOFFなら何も起きないこと
    const offMount = await page.evaluate(async () => {
      const m = await import('./js/visual-scene.js');
      const r = m.mountVisualScene({});
      return { mounted: r !== null, sceneEl: !!document.getElementById('visualScene') };
    });
    check(`${tag} FLAG OFF: mountがnullでDOMも作られない`,
      !offMount.mounted && !offMount.sceneEl, JSON.stringify(offMount));

    // ================= FLAG ON =================
    const on = await page.evaluate(async () => {
      const m = await import('./js/visual-scene.js');
      window.__NEON_SCENE_FLAGS__ = { [m.SceneFlag.VISUAL_SCENE_STUB]: true };
      window.__scene = m.mountVisualScene({});
      const el = document.getElementById('visualScene');
      const img = document.getElementById('visualSceneImage');
      return {
        mounted: !!window.__scene,
        shown: el.classList.contains('show'),
        phase: window.__scene.session.phase,
        speaker: document.getElementById('visualSceneName').textContent,
        image: img.style.backgroundImage,
        advanceShown: document.getElementById('visualSceneAdvance').classList.contains('show'),
        inputShown: document.getElementById('visualSceneInput').classList.contains('show'),
        imgCovers: (() => { const r = img.getBoundingClientRect();
          return Math.round(r.width) >= innerWidth && Math.round(r.height) >= innerHeight; })()
      };
    });
    check(`${tag} FLAG ON: mountされ画面に出る`, on.mounted && on.shown, JSON.stringify({ m: on.mounted, s: on.shown }));
    check(`${tag} FLAG ON: 一枚絵が全面に敷かれる`,
      /itimaie_sixyuzinnkou_sasie\.png/.test(on.image) && on.imgCovers, on.image.slice(0, 60));
    check(`${tag} FLAG ON: 話者名が出る`, on.speaker === 'PLACEHOLDER', on.speaker);
    check(`${tag} FLAG ON: 画像待ちを抜けて送り出しへ`, on.phase === 'LINE_REVEALING', on.phase);
    check(`${tag} FLAG ON: 送り出し中は▽を出さない`, !on.advanceShown);
    check(`${tag} FLAG ON: 入力欄はまだ出ない`, !on.inputShown);
    check(`${tag} FLAG ON: page scroll なし`, await noPageScroll(page));
    await page.screenshot({ path: path.join(shotDir, 'A-revealing.png') }).catch(() => {});

    // ---- 画面タップで全文表示 → ペンディング（▽） ----
    await page.click('#visualScene', { position: { x: 20, y: 20 } });
    const pend = await page.evaluate(() => ({
      phase: window.__scene.session.phase,
      text: document.getElementById('visualSceneText').textContent,
      advanceShown: document.getElementById('visualSceneAdvance').classList.contains('show')
    }));
    check(`${tag} タップで全文表示しLINE_PENDING`, pend.phase === 'LINE_PENDING', pend.phase);
    check(`${tag} ペンディングで▽が出る`, pend.advanceShown);
    check(`${tag} セリフ本文が表示される`, pend.text === 'PLACEHOLDER LINE 1', pend.text);
    await page.screenshot({ path: path.join(shotDir, 'B-pending.png') }).catch(() => {});

    // ---- 次送り → 2行目 → 全文 → 入力待ち ----
    await page.click('#visualScene', { position: { x: 20, y: 20 } }); // 2行目へ
    await page.click('#visualScene', { position: { x: 20, y: 20 } }); // 全文表示
    await page.click('#visualScene', { position: { x: 20, y: 20 } }); // 入力待ちへ
    const awaiting = await page.evaluate(() => ({
      phase: window.__scene.session.phase,
      text: document.getElementById('visualSceneText').textContent,
      inputShown: document.getElementById('visualSceneInput').classList.contains('show'),
      fieldDisabled: document.getElementById('visualSceneInputField').disabled,
      submitDisabled: document.getElementById('visualSceneInputSubmit').disabled,
      maxLength: document.getElementById('visualSceneInputField').maxLength
    }));
    check(`${tag} 入力要求行でAWAITING_INPUT`, awaiting.phase === 'AWAITING_INPUT', awaiting.phase);
    check(`${tag} 2行目のセリフが出ている`, awaiting.text === 'PLACEHOLDER LINE 2', awaiting.text);
    check(`${tag} 入力欄が出る`, awaiting.inputShown && !awaiting.fieldDisabled);
    check(`${tag} 空入力では送信できない`, awaiting.submitDisabled);
    check(`${tag} maxLengthが反映される`, awaiting.maxLength === 24, String(awaiting.maxLength));
    const field = (await tapInfo(page, '#visualSceneInputField'))[0];
    const submit = (await tapInfo(page, '#visualSceneInputSubmit'))[0];
    check(`${tag} 入力欄が44px以上で操作可能`,
      field.onTop && field.inViewport && field.h >= MIN_TAP, JSON.stringify(field));
    check(`${tag} 送信ボタンが44px以上で操作可能`,
      submit.inViewport && submit.h >= MIN_TAP, JSON.stringify(submit));
    check(`${tag} page scroll なし (入力待ち)`, await noPageScroll(page));
    await page.screenshot({ path: path.join(shotDir, 'C-awaiting-input.png') }).catch(() => {});

    // ---- テキスト入力 → 送信（保留） ----
    await page.fill('#visualSceneInputField', 'テスト送信');
    const typed = await page.evaluate(() => ({
      value: window.__scene.session.input.value,
      submitDisabled: document.getElementById('visualSceneInputSubmit').disabled
    }));
    check(`${tag} 入力がSessionへ反映される`, typed.value === 'テスト送信', typed.value);
    check(`${tag} 入力があれば送信できる`, !typed.submitDisabled);

    await page.click('#visualSceneInputSubmit');
    const pending = await page.evaluate(() => ({
      phase: window.__scene.session.phase,
      fieldDisabled: document.getElementById('visualSceneInputField').disabled,
      isPending: window.__scene.session.isPending
    }));
    check(`${tag} 送信でINPUT_PENDING（確定待ち）`, pending.phase === 'INPUT_PENDING', pending.phase);
    check(`${tag} 確定待ちはペンディング扱い`, pending.isPending);
    check(`${tag} 確定待ち中は入力欄を触れない`, pending.fieldDisabled);
    await page.screenshot({ path: path.join(shotDir, 'D-input-pending.png') }).catch(() => {});

    // ---- 確定 → 終了 ----
    await page.click('#visualScene', { position: { x: 20, y: 20 } });
    const done = await page.evaluate(() => ({
      phase: window.__scene.session.phase,
      inputs: window.__scene.session.inputs,
      inputShown: document.getElementById('visualSceneInput').classList.contains('show')
    }));
    check(`${tag} 確定でSCENE_CLEARED`, done.phase === 'SCENE_CLEARED', done.phase);
    check(`${tag} 入力値が保持される`, done.inputs.reply === 'テスト送信', JSON.stringify(done.inputs));
    check(`${tag} 終了後は入力欄を出さない`, !done.inputShown);
    await page.screenshot({ path: path.join(shotDir, 'E-cleared.png') }).catch(() => {});

    // ---- 後始末で既存UIへ影響が残らないこと ----
    const after = await page.evaluate(() => {
      window.__scene.renderer.destroy();
      return {
        sceneEl: !!document.getElementById('visualScene'),
        styleEl: !!document.getElementById('neon-visual-scene-style'),
        tokenPad: getComputedStyle(document.getElementById('tokenPad')).display !== 'none',
        workspace: document.body.dataset.workspace
      };
    });
    check(`${tag} destroyでDOMとstyleを撤去できる`, !after.sceneEl && !after.styleEl, JSON.stringify(after));
    check(`${tag} 既存Query UIは無傷`, after.tokenPad && after.workspace === 'inspect', JSON.stringify(after));
    check(`${tag} JSエラーなし`, jsErrors.length === 0, jsErrors.slice(0, 2).join(' | '));
  } finally {
    await ctx.close();
  }
}

(async () => {
  mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    for(const vp of VIEWPORTS) await runViewport(browser, vp);
  } catch(err){
    check('実行時例外なし', false, err.message);
  } finally {
    await browser.close();
  }
  console.log('');
  console.log(`Scene screenshots: ${path.relative(ROOT, SHOT_DIR)}`);
  console.log(`FAIL_COUNT: ${failCount}`);
  process.exit(failCount === 0 ? 0 : 1);
})();
