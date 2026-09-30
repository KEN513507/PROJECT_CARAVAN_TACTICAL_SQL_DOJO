// js/shell-state.js
// ============================================================
// SHELL STATE CONTRACT (SSOT)
// ------------------------------------------------------------
// アプリの一番外側の状態遷移。ここには DOM も保存も音も無い。
// 「どの画面に居て、何をしたら、どこへ行き、何が起きるか」だけを宣言する。
//
//   BOOT ──READY──▶ TITLE ──NEW_GAME──▶ (保存あり) CONFIRM_NEW ──CONFIRM──▶ PLAY
//                     │                 (保存なし) ───────────────────────▶ PLAY
//                     ├──CONTINUE─────▶ PLAY            ※保存があるときだけ
//                     └──OPEN_SETTINGS▶ SETTINGS ──BACK──▶ 来た画面へ戻る
//                                          ▲
//                   PLAY ──OPEN_SETTINGS───┘
//                   PLAY ──QUIT──▶ TITLE
//
// 守ること:
//   - 保存が無ければ CONTINUE は選べない（空の続きから始めない）
//   - 保存があるとき NEW_GAME は必ず確認を挟む（進捗を黙って消さない）
//   - 確認をやめたら何も起きない（WIPE は出ない）
//   - SETTINGS は必ず来た画面へ戻る（タイトルからでも、プレイ中からでも）
//   - 知らない操作が来ても状態は壊れない（null を返すだけ）
// ============================================================

// 画面。
export const Screen = {
  BOOT:        'BOOT',          // 起動直後。保存の有無を調べている
  TITLE:       'TITLE',         // スタート画面
  SETTINGS:    'SETTINGS',      // 設定画面
  CONFIRM_NEW: 'CONFIRM_NEW',   // ニューゲームの上書き確認
  PLAY:        'PLAY'           // キャンペーン本体
};

// プレイヤーの操作。
export const Event = {
  READY:         'READY',
  NEW_GAME:      'NEW_GAME',
  CONTINUE:      'CONTINUE',
  OPEN_SETTINGS: 'OPEN_SETTINGS',
  BACK:          'BACK',
  CONFIRM:       'CONFIRM',
  CANCEL:        'CANCEL',
  QUIT:          'QUIT'
};

// 遷移に伴って外側へ頼む仕事。ここでは名前を返すだけで、実行はしない。
export const Effect = {
  WIPE:   'WIPE',     // 保存を消す
  START:  'START',    // 最初から始める
  RESUME: 'RESUME',   // 保存から再開する
  LEAVE:  'LEAVE'     // 遊びを畳んでタイトルへ戻る
};

// 「来た画面へ戻る」を表す行き先。
const RETURN = '@return';

// 遷移表。画面 → 操作 → 規則。規則が配列なら上から最初に通ったものを採る。
//   when     : ctx のこの条件が真のときだけ通る
//   whenFrom : 来た画面がこれのときだけ通る
//   to      : 行き先の画面（RETURN なら来た画面）
//   effects : 外側へ頼む仕事
const TABLE = {
  [Screen.BOOT]: {
    [Event.READY]: { to: Screen.TITLE }
  },
  [Screen.TITLE]: {
    // 保存があるなら必ず確認を挟む。無いならそのまま始める。
    [Event.NEW_GAME]: [
      { when: 'hasSave', to: Screen.CONFIRM_NEW },
      { to: Screen.PLAY, effects: [Effect.WIPE, Effect.START] }
    ],
    // 保存が無ければ「つづきから」は存在しない。
    [Event.CONTINUE]: [
      { when: 'hasSave', to: Screen.PLAY, effects: [Effect.RESUME] }
    ],
    [Event.OPEN_SETTINGS]: { to: Screen.SETTINGS }
  },
  [Screen.SETTINGS]: {
    [Event.BACK]: { to: RETURN },
    // 設定からタイトルへ戻れるのは、遊んでいる途中で開いたときだけ。
    [Event.QUIT]: [{ whenFrom: Screen.PLAY, to: Screen.TITLE, effects: [Effect.LEAVE] }]
  },
  [Screen.CONFIRM_NEW]: {
    [Event.CONFIRM]: { to: Screen.PLAY, effects: [Effect.WIPE, Effect.START] },
    [Event.CANCEL]:  { to: Screen.TITLE },
    [Event.BACK]:    { to: Screen.TITLE }
  },
  [Screen.PLAY]: {
    [Event.OPEN_SETTINGS]: { to: Screen.SETTINGS },
    [Event.QUIT]:          { to: Screen.TITLE, effects: [Effect.LEAVE] }
  }
};

// 最初の状態。from は「戻り先」。
export const initial = () => ({ screen: Screen.BOOT, from: null });

// 状態 + 操作 + 文脈 → { state, effects }。起きない操作なら null。
// 純粋関数。渡された state は書き換えない。
export function reduce(state, event, ctx = {}){
  const rules = TABLE[state?.screen]?.[event];
  if(!rules) return null;
  for(const rule of [].concat(rules)){
    if(rule.when && !ctx[rule.when]) continue;
    if(rule.whenFrom && state.from !== rule.whenFrom) continue;
    const to = rule.to === RETURN ? (state.from || Screen.TITLE) : rule.to;
    return {
      state: { screen: to, from: state.screen },
      effects: rule.effects ? [...rule.effects] : []
    };
  }
  return null;
}

// その操作が今できるか。
export const allowed = (state, event, ctx = {}) => reduce(state, event, ctx) !== null;

// 今の画面で選べる操作の一覧。画面の描画はこれを見て組む。
export const options = (state, ctx = {}) =>
  Object.keys(TABLE[state?.screen] || {}).filter(e => allowed(state, e, ctx));

// 遷移表そのもの。ゲートが法則を確かめるために読む。
export const transitions = () => TABLE;
