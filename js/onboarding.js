// Canonical campaign opening. Data and token editing only; execution stays in sql-engine.js.
export const ONBOARDING_TABLES = {
  STOCK: { cols: ['item', 'shelf', 'quantity'], keys: [], rows: [
    ['鉛筆', 'A', 12], ['消しゴム', 'A', 3], ['定規', 'A', 5],
    ['鉛筆', 'B', 4], ['消しゴム', 'B', 8], ['定規', 'B', 2]
  ] },
  REQUESTS: { cols: ['item', 'desk', 'quantity'], keys: [], rows: [
    ['鉛筆', '受付', 3], ['消しゴム', '受付', 2], ['鉛筆', '倉庫', 5],
    ['定規', '倉庫', 1], ['鉛筆', '作業室', 4], ['消しゴム', '作業室', 3]
  ] }
};

export function queryTokens(sql) {
  return (sql.match(/'(?:''|[^'])*'|(?:COUNT|SUM)\s*\([^)]*\)|GROUP BY|ORDER BY|[A-Za-z_][A-Za-z_0-9]*|\d+|<>|<=|>=|[=<>*,;□]/gi) || [])
    .filter(t => t !== ';').map(t => ({ t, k: tokenKind(t) }));
}
export function tokenKind(t) {
  if (t === '□') return 'slot';
  if (t === ',') return 'punct';
  if (/^(SELECT|FROM|WHERE|AND|OR|ORDER BY|GROUP BY|ASC|DESC|AS)$/i.test(t)) return 'clause';
  if (/^(COUNT|SUM)\(/i.test(t)) return 'func';
  if (t in ONBOARDING_TABLES) return 'table';
  if (/^(=|<|>|<=|>=|<>)$/.test(t)) return 'op';
  if (/^'|^\d/.test(t)) return 'lit';
  return 'col';
}
export const queryText = tokens => tokens.map(t => t.t).join(' ');

// Cursor: replace a selected token, or insert at a boundary. No answer-dependent locking.
export function editQuery(tokens, token, cursor) {
  const next = tokens.map(t => ({ ...t }));
  const at = Math.max(0, Math.min(cursor.index, next.length));
  if (cursor.replace && at < next.length) next.splice(at, 1, { ...token });
  else {
    const before = next.slice(0, at);
    const inSelect = before.some(t => t.t === 'SELECT') && !before.some(t => t.t === 'FROM');
    const previous = next[at - 1];
    const following = next[at];
    const column = t => t && (t.k === 'col' || t.k === 'func');
    const insert = [];
    if (inSelect && column(previous) && column(token)) insert.push({ t: ',', k: 'punct' });
    insert.push({ ...token });
    if (inSelect && column(following) && column(token)) insert.push({ t: ',', k: 'punct' });
    next.splice(at, 0, ...insert);
    return { tokens: next, cursor: { index: at + insert.length, replace: false } };
  }
  return { tokens: next, cursor: { index: at + 1, replace: false } };
}

const specs = [
  ['備品名を取り出す', '備品名だけを表示してください。', 'SELECT item FROM STOCK',
    ['item'], ONBOARDING_TABLES.STOCK.rows.map(r => [r[0]]),
    '表の「品目」をタップすると、選んだ列をSQLに入れられます。', 'SELECT □ FROM STOCK'],
  ['列を増やす', '品目・棚・数量を一緒に表示してください。', 'SELECT item, shelf, quantity FROM STOCK',
    ['item', 'shelf', 'quantity'], ONBOARDING_TABLES.STOCK.rows,
    'SQLの品目の後ろに追加位置を選び、棚と数量を追加します。カンマは自動で入ります。'],
  ['B棚を見る', 'B棚の備品だけを表示してください。', "SELECT item, shelf, quantity FROM STOCK WHERE shelf = 'B'",
    ['item', 'shelf', 'quantity'], ONBOARDING_TABLES.STOCK.rows.filter(r => r[1] === 'B'),
    '末尾にWHEREを追加して、棚がBと一致する条件を作ります。'],
  ['少ない在庫を探す', '棚に関係なく、数量が6未満の備品を表示してください。', 'SELECT item, shelf, quantity FROM STOCK WHERE quantity < 6',
    ['item', 'shelf', 'quantity'], ONBOARDING_TABLES.STOCK.rows.filter(r => r[2] < 6),
    '前回の条件を編集します。棚を数量に、＝を＜に、Bを6に置き換えます。'],
  ['二つの条件で探す', 'B棚で、数量が6未満の備品を表示してください。', "SELECT item, shelf, quantity FROM STOCK WHERE quantity < 6 AND shelf = 'B'",
    ['item', 'shelf', 'quantity'], ONBOARDING_TABLES.STOCK.rows.filter(r => r[1] === 'B' && r[2] < 6),
    '数量の条件を残し、ANDで「棚がB」を追加します。'],
  ['少ない順に並べる', 'そのB棚の備品を、数量の少ない順に並べてください。', "SELECT item, shelf, quantity FROM STOCK WHERE quantity < 6 AND shelf = 'B' ORDER BY quantity",
    ['item', 'shelf', 'quantity'], [['定規', 'B', 2], ['鉛筆', 'B', 4]],
    '行を選ぶ条件はそのまま。末尾にORDER BYと数量の列を追加します。'],
  ['補充依頼を見る', '受付から届いた補充依頼を表示してください。', "SELECT item, desk, quantity FROM REQUESTS WHERE desk = '受付'",
    ['item', 'desk', 'quantity'], ONBOARDING_TABLES.REQUESTS.rows.filter(r => r[1] === '受付'),
    '今度は一行が一件の補充依頼です。WHEREで依頼元が受付の行を選びます。', 'SELECT item, desk, quantity FROM REQUESTS WHERE desk = □'],
  ['対象を広げる', '受付または倉庫から届いた依頼を表示してください。', "SELECT item, desk, quantity FROM REQUESTS WHERE desk = '受付' OR desk = '倉庫'",
    ['item', 'desk', 'quantity'], ONBOARDING_TABLES.REQUESTS.rows.filter(r => r[1] !== '作業室'),
    'どちらかの条件でよいときはORです。受付の条件に倉庫の条件を追加します。'],
  ['依頼を数える', '鉛筆の補充依頼は何件ありますか。', "SELECT COUNT(*) FROM REQUESTS WHERE item = '鉛筆'",
    ['COUNT(*)'], [[3]], 'COUNT(*)は行を数えます。鉛筆の行だけに絞って数えましょう。', 'SELECT □ FROM REQUESTS WHERE item = \'鉛筆\''],
  ['数量を合計する', '鉛筆は合計いくつ依頼されていますか。', "SELECT SUM(quantity) FROM REQUESTS WHERE item = '鉛筆'",
    ['SUM(quantity)'], [[12]], '件数ではなく数量を足します。COUNT(*)をSUM(quantity)に置き換えます。'],
  ['集計列に名前を付ける', '鉛筆の合計の列に request_total という名前を付けてください。', "SELECT SUM(quantity) AS request_total FROM REQUESTS WHERE item = '鉛筆'",
    ['request_total'], [[12]], 'SUM(quantity)の直後へ、ASとrequest_totalを挿入します。'],
  ['備品ごとにまとめる', 'すべての備品について、品目ごとの依頼数量を集計してください。合計列は request_total とします。', 'SELECT item, SUM(quantity) AS request_total FROM REQUESTS GROUP BY item',
    ['item', 'request_total'], [['鉛筆', 12], ['消しゴム', 5], ['定規', 1]],
    '鉛筆だけのWHERE条件を削除し、GROUP BYで品目ごとのまとまりを作ります。SELECTにも品目を追加します。']
];
const concepts = ['列の選択', '複数列の選択', '文字列の一致', '数値の比較', 'AND', 'ORDER BY', '業務表への転用', 'OR', 'COUNT', 'SUM', 'AS', 'GROUP BY'];
export const ONBOARDING_STAGES = specs.map((s, i) => {
  const table = i < 6 ? 'STOCK' : 'REQUESTS';
  const words = ['SELECT', 'FROM', ...ONBOARDING_TABLES[table].cols, table];
  if (i >= 2) words.push('WHERE', '=', "'A'", "'B'");
  if (i >= 3) words.push('<', '>', '6');
  if (i >= 4) words.push('AND');
  if (i >= 5) words.push('ORDER BY', 'ASC', 'DESC');
  if (i >= 6) words.push("'受付'", "'倉庫'", "'作業室'", "'鉛筆'", "'消しゴム'", "'定規'");
  if (i >= 7) words.push('OR');
  if (i >= 8) words.push('COUNT(*)');
  if (i >= 9) words.push('SUM(quantity)');
  if (i >= 10) words.push('AS', 'request_total');
  if (i >= 11) words.push('GROUP BY');
  return {
    id: `M${String(i + 1).padStart(2, '0')}`, learning: true, time: 0,
    level: `M${String(i + 1).padStart(2, '0')} · ${s[0]}`, chapterTitle: s[0],
    prompt: s[1], brief: s[1], concept: concepts[i], tables: [table],
    note: i < 6 ? '一行は、一つの棚にある一種類の備品。在庫数を数量に記録しています。' : '一行は一件の補充依頼。数量は依頼された個数です。',
    // 仕様配列は [題名, 指示, 正解SQL, 列, 行, ガイド文, 初期SQL(任意)]。
    // 以前は guide=s[6] / starter=s[7] と1つずれており、ガイド文の代わりにSQLが出て、
    // 初期SQLを持つ M01/M07/M09 でそれが適用されなかった。
    guide: s[5], hint1: s[5], hint2: `必要な操作：${concepts[i]}。表の見出しもタップできます。`,
    skeleton: s[6] || s[2].replace(/SELECT .*? FROM/, 'SELECT □ FROM'),
    answers: [s[2]], resultSet: { cols: s[3], rows: s[4].map(r => [...r]) },
    ordered: i === 5, starter: s[6], tokens: [...new Set(words)].map(t => ({ t, k: tokenKind(t) })),
    reveal: { text: i === 11 ? '備品ごとの補充数量を確認できました。今回の12件の作業は完了です。' : '照会結果を作業記録に保存しました。' }
  };
});
