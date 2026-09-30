// tools/character-art-check.mjs
// ============================================================
// CHARACTER ART CONTRACT のゲート (SSOT: js/tutor.js)
//
//   立ち絵が出るのは 問題冒頭 / ヒント / クリア画面 の3瞬間だけ。
//   出し方はカットイン。UIの上に大きく重なるが、必ず数秒で自分から抜ける。
//   SQLを編集している間は出ない。再生中に触られたら即座に打ち切る。
//   大きく被せるので pointer-events:none は絶対条件。
//   素材は軽い（アーティファクトに載る大きさ）。
// ============================================================
import { statSync } from 'node:fs';
import { chromium } from 'playwright';
import { boot, source, focusQuery, run, reopen } from './onboarding-ui-helpers.mjs';

let failed = 0;
const check = (name, ok, detail = '') => {
  if(ok) console.log(`  PASS  ${name}`);
  else { failed++; console.log(`  FAIL  ${name}${detail ? '  -- ' + detail : ''}`); }
};

// ---- 素材の重さ（アーティファクト配信できる大きさか） ----
console.log('[ASSETS]');
for(const file of ['assets/characters/tutor-sheet.webp', 'assets/characters/protagonist-sheet.webp']){
  const kb = Math.round(statSync(new URL('../' + file, import.meta.url)).size / 1024);
  check(`${file} は 200KB 以下 (${kb}KB)`, kb <= 200, `${kb}KB`);
}

const tutorState = page => page.evaluate(() => {
  const el = document.getElementById('tutor');
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    moment: document.body.dataset.tutor ?? null,
    pose: el.getAttribute('data-pose'),
    opacity: Number(cs.opacity),
    pointerEvents: cs.pointerEvents,
    zIndex: Number(cs.zIndex),
    animation: cs.animationName,
    width: Math.round(r.width),
    vw: window.innerWidth,
    tag: (document.getElementById('tutorTag')?.textContent || '').trim(),
    tagShown: Number(getComputedStyle(document.getElementById('tutorLink')).opacity) > 0.5,
    speaker: document.getElementById('tutorLink')?.getAttribute('data-speaker') ?? null,
    who: (document.querySelector('#tutorLine .tutor-who')?.textContent || '').trim(),
    say: (document.querySelector('#tutorLine .tutor-say')?.textContent || '').trim(),
    noraMark: !!document.querySelector('.nora-mark svg'),
    // ヒント／実行ボタンとの縦の重なり(px)。0 でなければ場所を取り合っている。
    barOverlap: ['hintBtn', 'runBtn'].reduce((mx, id) => {
      const b = document.getElementById(id);
      if(!b) return mx;
      const q = b.getBoundingClientRect();
      if(q.width <= 0 || q.height <= 0) return mx;
      return Math.max(mx, Math.round(Math.max(0, Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top))));
    }, 0)
  };
});
// 表示状態が落ち着くまで待つ（カットインの入り / 抜け）
// 抜けは「見えなくなった」だけでなく「body[data-tutor] が外れた」まで待つ。
// 透明になった瞬間はまだ再生中で、退場はそのあとの animationend で起きる。
const settle = (page, shown, timeout = 6000) =>
  page.waitForFunction(want => {
    const o = Number(getComputedStyle(document.getElementById('tutor')).opacity);
    return want ? o > 0.5 : (o < 0.05 && !document.body.dataset.tutor);
  }, shown, { timeout });

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const missing = [];
  page.on('response', r => { if(r.status() >= 400) missing.push(r.url()); });

  await boot(page);

  console.log('[M01 問題冒頭]');
  await settle(page, true);
  let s = await tutorState(page);
  check('問題冒頭でカットインが出る', s.moment === 'intro' && s.opacity > 0.5, JSON.stringify(s));
  check('問題冒頭のポーズは calm', s.pose === 'calm', s.pose);
  check('カットインのアニメーションが動いている', s.animation === 'tutorCutIn', s.animation);
  check('タップは必ず下のUIへ抜ける (pointer-events:none)', s.pointerEvents === 'none', s.pointerEvents);
  check('UIの上に重なるレイヤー (#app:10 より上)', s.zIndex > 10, String(s.zIndex));
  check('本編オーバーレイ(60)より下にいる', s.zIndex < 60, String(s.zIndex));
  check('小さく出していない (画面幅の70%以上)', s.width >= s.vw * 0.7, `${s.width}px / ${s.vw}px`);
  check('ヒント／実行ボタンと場所を取り合わない', s.barOverlap === 0, `重なり ${s.barOverlap}px`);
  check('端末カードが出ている', s.tagShown, String(s.tagShown));
  check('通信相手が NORA だと分かる', /NORA/.test(s.tag) && /LINK ESTABLISHED/.test(s.tag), s.tag);
  check('NORAの端末アイコンが在る', s.noraMark);
  check('問題冒頭は主人公の思考ログ', s.speaker === 'SELF' && s.who === '思考' && s.say.length > 0,
        `${s.speaker}/${s.who}/${s.say}`);

  console.log('[居座らない]');
  await settle(page, false);
  s = await tutorState(page);
  check('触らなくても自分から抜ける', s.moment === null && s.opacity < 0.05, JSON.stringify(s));
  check('抜けたあとアニメーションは残らない', s.animation === 'none', s.animation);

  console.log('[編集中]');
  await reopen(page);
  await page.locator('body.learning-ui').waitFor();
  await settle(page, true);
  await source(page, 0);                       // 表の列をタップ = 最初の編集操作
  await settle(page, false, 1500);             // 再生中でも打ち切られる
  s = await tutorState(page);
  check('再生中でも最初の編集操作で即座に打ち切る', s.moment === null && s.opacity < 0.05, JSON.stringify(s));

  console.log('[ヒント]');
  await page.locator('#hintBtn').click();
  await settle(page, true);
  s = await tutorState(page);
  check('ヒントを開くとカットインが出る', s.moment === 'hint' && s.opacity > 0.5, JSON.stringify(s));
  check('ヒントのポーズは thinking', s.pose === 'thinking', s.pose);
  check('ヒントでもボタンと場所を取り合わない', s.barOverlap === 0, `重なり ${s.barOverlap}px`);
  check('ヒントの回線状態', /ADVISORY/.test(s.tag), s.tag);
  check('ヒントはNORAの発話として出る', s.speaker === 'NORA' && s.who === 'NORA' && s.say.length > 0,
        `${s.speaker}/${s.who}/${s.say}`);
  await settle(page, false);
  check('ヒントの立ち絵も居座らない', (await tutorState(page)).moment === null);
  check('ヒント本文は出したまま', await page.locator('#hintLine').isVisible());

  console.log('[クリア画面]');
  await page.locator('#hintBtn').click();      // ヒントを閉じる
  await run(page);
  await settle(page, true);
  s = await tutorState(page);
  check('クリア画面でカットインが出る', s.moment === 'clear' && s.opacity > 0.5, JSON.stringify(s));
  check('クリアのポーズは happy', s.pose === 'happy', s.pose);
  check('クリアの回線状態', /QUERY CONFIRMED/.test(s.tag), s.tag);
  check('クリアもNORAの発話として出る', s.speaker === 'NORA' && s.say.length > 0,
        `${s.speaker}/${s.say}`);
  await settle(page, false);
  check('クリアの立ち絵も居座らない', (await tutorState(page)).moment === null);

  console.log('[M02 組み立て中はずっと出ない]');
  await page.locator('#runBtn').click();       // 次の照会へ
  await page.locator('body[data-workspace="compose"]').waitFor();
  await settle(page, true);
  check('次の問題でも冒頭には出る', (await tutorState(page)).moment === 'intro');
  await focusQuery(page);                      // SQL欄を操作しはじめる
  await settle(page, false, 1500);
  const seen = [(await tutorState(page)).moment];
  for(let i = 0; i < 3; i++){
    await page.locator('#tokenPad .tok').nth(i).click();
    seen.push((await tutorState(page)).moment);
  }
  await page.locator('[data-edit="end"]').click();
  seen.push((await tutorState(page)).moment);
  check('SQLを組み立てている間は一度も出ない', seen.every(m => m === null), JSON.stringify(seen));

  console.log('[読み込み]');
  const artMissing = missing.filter(u => /assets\/characters\//.test(u));
  check('立ち絵素材に404が無い', artMissing.length === 0, artMissing.join(', '));
  check('JSエラーが無い', errors.length === 0, errors.join(' | '));

  await context.close();
} finally {
  await browser.close();
}

console.log(failed ? `\nCHARACTER ART GATE: FAIL (${failed})` : '\nCHARACTER ART GATE: PASS');
process.exit(failed ? 1 : 0);
