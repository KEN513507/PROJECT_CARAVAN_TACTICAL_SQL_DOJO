// tools/shell-state-check.mjs
// ============================================================
// SHELL STATE CONTRACT のゲート (SSOT: js/shell-state.js)
// 画面もブラウザも要らない。遷移表そのものを総当たりで確かめる。
// ============================================================
import { Screen, Event, Effect, initial, reduce, allowed, options, transitions } from '../js/shell-state.js';

let failed = 0;
const check = (name, ok, detail = '') => {
  if(ok) console.log(`  PASS  ${name}`);
  else { failed++; console.log(`  FAIL  ${name}${detail ? '  -- ' + detail : ''}`); }
};

const SAVED = { hasSave: true };
const EMPTY = { hasSave: false };
// 状態から操作を並べて辿る小道具
const walk = (ctx, ...events) => {
  let s = initial(), fx = [];
  for(const e of events){
    const r = reduce(s, e, ctx);
    if(!r) return { state: s, effects: fx, stuckAt: e };
    s = r.state; fx = fx.concat(r.effects);
  }
  return { state: s, effects: fx, stuckAt: null };
};

console.log('[起動]');
check('最初は BOOT', initial().screen === Screen.BOOT);
check('READY でスタート画面へ', reduce(initial(), Event.READY).state.screen === Screen.TITLE);
check('起動直後に勝手に遊びが始まらない', reduce(initial(), Event.READY).effects.length === 0);

console.log('[保存が無いとき]');
let s = walk(EMPTY, Event.READY).state;
check('「つづきから」は選べない', !allowed(s, Event.CONTINUE, EMPTY));
check('スタート画面で選べるのは ニューゲーム と 設定',
      options(s, EMPTY).sort().join(',') === [Event.NEW_GAME, Event.OPEN_SETTINGS].sort().join(','),
      options(s, EMPTY).join(','));
let r = reduce(s, Event.NEW_GAME, EMPTY);
check('ニューゲームは確認を挟まずそのまま始まる', r.state.screen === Screen.PLAY, r.state.screen);
check('始めるときの仕事は 消去 と 開始', r.effects.join(',') === `${Effect.WIPE},${Effect.START}`, r.effects.join(','));

console.log('[保存があるとき]');
s = walk(SAVED, Event.READY).state;
check('「つづきから」が選べる', allowed(s, Event.CONTINUE, SAVED));
check('スタート画面で3つとも選べる', options(s, SAVED).length === 3, options(s, SAVED).join(','));
r = reduce(s, Event.CONTINUE, SAVED);
check('つづきからは再開の仕事だけ', r.state.screen === Screen.PLAY && r.effects.join(',') === Effect.RESUME, r.effects.join(','));
check('つづきからで保存を消さない', !r.effects.includes(Effect.WIPE));
r = reduce(s, Event.NEW_GAME, SAVED);
check('ニューゲームは必ず確認を挟む', r.state.screen === Screen.CONFIRM_NEW, r.state.screen);
check('確認の時点では何も起きない（まだ消さない）', r.effects.length === 0, r.effects.join(','));

console.log('[上書きの確認]');
const confirmed = walk(SAVED, Event.READY, Event.NEW_GAME, Event.CONFIRM);
check('確認したら最初から始まる', confirmed.state.screen === Screen.PLAY, confirmed.state.screen);
check('確認して初めて保存が消える', confirmed.effects.join(',') === `${Effect.WIPE},${Effect.START}`, confirmed.effects.join(','));
for(const back of [Event.CANCEL, Event.BACK]){
  const cancelled = walk(SAVED, Event.READY, Event.NEW_GAME, back);
  check(`${back} でスタート画面へ戻る`, cancelled.state.screen === Screen.TITLE, cancelled.state.screen);
  check(`${back} では保存を消さない`, !cancelled.effects.includes(Effect.WIPE), cancelled.effects.join(','));
}

console.log('[設定は来た画面へ戻る]');
const fromTitle = walk(SAVED, Event.READY, Event.OPEN_SETTINGS);
check('スタート画面から設定を開ける', fromTitle.state.screen === Screen.SETTINGS);
check('設定から戻るとスタート画面', reduce(fromTitle.state, Event.BACK, SAVED).state.screen === Screen.TITLE);
const fromPlay = walk(SAVED, Event.READY, Event.CONTINUE, Event.OPEN_SETTINGS);
check('プレイ中から設定を開ける', fromPlay.state.screen === Screen.SETTINGS);
check('設定から戻るとプレイに戻る', reduce(fromPlay.state, Event.BACK, SAVED).state.screen === Screen.PLAY);
check('設定を開いても仕事は起きない', fromPlay.effects.filter(e => e !== Effect.RESUME).length === 0, fromPlay.effects.join(','));

console.log('[プレイからの離脱]');
const quitFromSettings = reduce(fromPlay.state, Event.QUIT, SAVED);
check('プレイ中に開いた設定からタイトルへ戻れる', quitFromSettings.state.screen === Screen.TITLE);
check('そのとき保存は消さない', quitFromSettings.effects.join(',') === Effect.LEAVE, quitFromSettings.effects.join(','));
check('タイトルから開いた設定ではタイトルへ戻る操作は出ない', !allowed(fromTitle.state, Event.QUIT, SAVED));
const quit = reduce(walk(SAVED, Event.READY, Event.CONTINUE).state, Event.QUIT, SAVED);
check('プレイからスタート画面へ戻れる', quit.state.screen === Screen.TITLE, quit.state.screen);
check('戻るときは畳む仕事だけ（保存は消さない）', quit.effects.join(',') === Effect.LEAVE, quit.effects.join(','));

console.log('[遷移表そのものの法則]');
const TABLE = transitions();
const screens = Object.values(Screen);
check('全ての画面が遷移表に載っている',
      screens.every(x => TABLE[x]), screens.filter(x => !TABLE[x]).join(','));

// BOOT から全画面へ到達できるか（保存あり／なしの両方で総当たり）
for(const [label, ctx] of [['保存あり', SAVED], ['保存なし', EMPTY]]){
  const seen = new Set();
  const queue = [initial()];
  const key = st => st.screen + '<' + st.from;
  while(queue.length){
    const st = queue.shift();
    if(seen.has(key(st))) continue;
    seen.add(key(st));
    for(const e of Object.values(Event)){
      const next = reduce(st, e, ctx);
      if(next && !seen.has(key(next.state))) queue.push(next.state);
    }
  }
  const reached = new Set([...seen].map(k => k.split('<')[0]));
  const missing = screens.filter(x => !reached.has(x) && !(ctx === EMPTY && x === Screen.CONFIRM_NEW));
  check(`${label}: 到達できない画面が無い`, missing.length === 0, missing.join(','));
  check(`${label}: 保存が無いのに上書き確認へ行かない`,
        ctx === SAVED || !reached.has(Screen.CONFIRM_NEW));
}

// 行き止まりが無い（どの画面からも操作が1つ以上ある）
for(const x of screens){
  const st = { screen: x, from: Screen.TITLE };
  check(`${x} に行き止まりが無い`, options(st, SAVED).length > 0, options(st, SAVED).join(','));
}

// 宣言されていない仕事を出さない
const known = new Set(Object.values(Effect));
const allEffects = new Set();
for(const byEvent of Object.values(TABLE))
  for(const rules of Object.values(byEvent))
    for(const rule of [].concat(rules))
      for(const e of rule.effects || []) allEffects.add(e);
check('出てくる仕事は宣言された4種だけ', [...allEffects].every(e => known.has(e)), [...allEffects].join(','));

console.log('[壊れない]');
check('知らない操作は null を返す', reduce({ screen: Screen.TITLE, from: null }, 'NO_SUCH_EVENT', SAVED) === null);
check('知らない画面でも落ちない', reduce({ screen: 'NOWHERE', from: null }, Event.BACK, SAVED) === null);
check('状態を渡さなくても落ちない', reduce(null, Event.BACK, SAVED) === null);
const before = { screen: Screen.TITLE, from: null };
reduce(before, Event.NEW_GAME, SAVED);
check('渡した状態を書き換えない', before.screen === Screen.TITLE && before.from === null);
check('文脈を省いても落ちない', reduce({ screen: Screen.TITLE, from: null }, Event.CONTINUE) === null);

console.log(failed ? `\nSHELL STATE GATE: FAIL (${failed})` : '\nSHELL STATE GATE: PASS');
process.exit(failed ? 1 : 0);
