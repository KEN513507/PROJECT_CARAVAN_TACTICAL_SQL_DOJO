// js/display-labels.js
// DISPLAY TERMINOLOGY CONTRACT — 2 namespace の対応表。
//
//   INTERNAL SQL IDENTIFIER : SQL / parser / schema 内部。SQL Editor では必ずこちら。
//   CANONICAL DISPLAY LABEL : 人間向けUI（Table / Result / Evidence / Relation Task /
//                             Schema Viewer / 説明UI）。こちらを全画面で統一して使う。
//
// 禁止されるのは「同じfieldを画面ごとに 認証ID / credential / 認証番号 と揺らすこと」。
// 許可されるのは identifier ↔ display label の 1対1 対応そのもの。
//
// これは Presentation 層の定義であり、DB schema でも SQL identifier でもない。
// ここを変更してもデータ・SQL Engine・Story は一切変わらない。

// identifier → display label（1対1。同じ identifier は常に同じ label）
export const FIELD_LABELS = Object.freeze({
  // 住民 / 人物
  resident_id:            '住民ID',
  display_name:           '表示名',
  legal_name:             '戸籍名',
  status:                 '状態',
  last_sector:            '最終区画',
  credential_id:          '認証ID',

  // 物資搬送
  transfer_id:            '搬送ID',
  item:                   '品目',
  quantity:               '数量',
  shelf: '棚',
  desk: '依頼元',
  request_total: '依頼合計',
  'COUNT(*)': '件数',
  'SUM(quantity)': '数量合計',
  destination:            '行き先',

  // 移送バッチ
  batch_id:               '便ID',
  sector:                 '区画',
  people:                 '人数',

  // 通行記録
  log_id:                 '記録ID',
  gate:                   'ゲート',
  event:                  '事象',
  time:                   '時刻',

  // 経路
  route_state:            '経路状態',

  // 避難受付 / 端末
  reception_id:           '受付ID',
  terminal_id:            '端末ID',
  received_at:            '受付時刻',
  authenticated_resident: '認証住民',
  authenticated_at:       '認証時刻',

  // 集計結果の列（AS で付ける別名）
  total_quantity:         '合計数量',
  total_people:           '合計人数'
});

// display label → identifier（逆引き。1対1であることの検証にも使う）
export const LABEL_TO_FIELD = Object.freeze(
  Object.keys(FIELD_LABELS).reduce((acc, id) => {
    acc[FIELD_LABELS[id]] = id;
    return acc;
  }, {})
);

// 列の表示ラベル。未登録の identifier はそのまま返す（勝手な訳語を作らない）。
// 修飾列 (c.last_sector) や関数 (SUM(quantity)) もそのまま扱える。
export function fieldLabel(col){
  if(col === null || col === undefined) return '';
  const key = String(col);
  if(FIELD_LABELS[key]) return FIELD_LABELS[key];
  // 修飾列: c.last_sector → 最終区画
  const dot = key.indexOf('.');
  if(dot !== -1){
    const bare = key.slice(dot + 1);
    if(FIELD_LABELS[bare]) return FIELD_LABELS[bare];
  }
  return key;
}

// 表示ラベルを持つかどうか（Gateや補助表示の判定用）
export function hasFieldLabel(col){
  return fieldLabel(col) !== String(col);
}

// 表名は identifier のまま扱う（SQL Editor のトークンと一致させるため）。
// 表の説明が要る場面では、この関数ではなく Note / NORA 側の文で説明する。
export function tableLabel(name){ return ({ STOCK: '備品在庫', REQUESTS: '補充依頼' })[name] || String(name); }
