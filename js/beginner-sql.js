// SQLiteをブラウザーWorkerとNodeの検証で共用する。
const identifier = name => {
  if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(name)) throw new Error('無効なSQL識別子です。');
  return `"${name}"`;
};

export function explainSqlError(message) {
  if (message.startsWith('no such table: ')) return `表が見つかりません：${message.slice(15)}。記録タブの表名を確認してください。`;
  if (message.startsWith('no such column: ')) return `列が見つかりません：${message.slice(16)}。表と列の英語識別子を確認してください。`;
  if (message.startsWith('ambiguous column name: ')) return `同名の列が複数あります：${message.slice(23)}。表の別名を付けて指定できます。`;
  if (message.includes('syntax error') || message.includes('incomplete input')) return `照会の書き方を確認してください。カンマ、引用符、括弧、FROMの位置を見直せます。詳細：${message}`;
  if (message.includes('misuse of aggregate')) return '集約関数を使う位置を確認してください。行の条件はWHERE、集計した結果の条件はHAVINGです。';
  return message;
}

export function createDatabase(SQL, tables) {
  const db = new SQL.Database();
  try {
    for (const [name, tb] of Object.entries(tables)) {
      const definitions = tb.cols.map((column, i) => {
        const values = tb.rows.map(row => row[i]).filter(v => v !== null);
        const numeric = values.length && values.every(v => v !== '' && Number.isFinite(Number(v)));
        return `${identifier(column)} ${numeric ? 'NUMERIC' : 'TEXT'}`;
      });
      if (tb.keys?.length) definitions.push(`PRIMARY KEY (${tb.keys.map(identifier).join(',')})`);
      db.run(`CREATE TABLE ${identifier(name)} (${definitions.join(',')})`);
      const insert = db.prepare(`INSERT INTO ${identifier(name)} VALUES (${tb.cols.map(() => '?').join(',')})`);
      try { for (const row of tb.rows) insert.run(row); } finally { insert.free(); }
    }
    db.run('PRAGMA query_only = ON');
    return db;
  } catch (error) { db.close(); throw error; }
}

export function executeQuery(db, sql) {
  if (typeof sql !== 'string' || sql.length > 12000) throw new Error('照会は12,000文字以内にしてください。');
  const clean = sql.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/, '');
  if (!/^SELECT\b/i.test(clean)) throw new Error('この監査端末ではSELECTによる照会を実行できます。');
  const iterator = db.iterateStatements(sql);
  let result = null;
  try {
    for (const statement of iterator) {
      if (result) throw new Error('一度に実行できる照会は1つです。');
      const cols = statement.getColumnNames();
      const rows = [];
      while (statement.step()) {
        if (rows.length >= 5000) throw new Error('結果が5,000行を超えました。対象を絞ってください。');
        rows.push(statement.get());
      }
      result = { cols, rows };
    }
  } finally { iterator.return?.(); }
  if (!result) throw new Error('照会を入力してください。');
  return result;
}

const valueKey = value => value === null ? ['null'] : ['value', String(value)];
const rowKey = row => JSON.stringify(row.map(valueKey));

export function sameResult(actual, expected, { ordered = false, strictColumns = false } = {}) {
  if (!actual || actual.cols.length !== expected.cols.length || actual.rows.length !== expected.rows.length) return false;
  const ac = actual.cols.map(c => c.toLowerCase());
  const ec = expected.cols.map(c => c.toLowerCase());
  const byName = ec.map(c => ac.indexOf(c));
  if (strictColumns && (byName.includes(-1) || new Set(byName).size !== ec.length)) return false;
  const order = byName.includes(-1) || new Set(byName).size !== ec.length ? ac.map((_, i) => i) : byName;
  const a = actual.rows.map(row => rowKey(order.map(i => row[i])));
  const e = expected.rows.map(rowKey);
  if (!ordered) { a.sort(); e.sort(); }
  return a.every((row, i) => row === e[i]);
}

export function verificationCases(number, source) {
  const variants = [];
  const change = fn => { const copy = structuredClone(source); fn(copy); variants.push(copy); };
  if (number <= 6 || number === 13 || number === 14) {
    change(t => t.RESIDENT_CACHE.rows.push(['R099', '臨時照合対象', 'MISSING', 'S1']));
    change(t => { t.RESIDENT_CACHE.rows[2][2] = 'ACTIVE'; t.RESIDENT_CACHE.rows[4][3] = 'S4'; });
  } else if (number <= 11) {
    change(t => t.SUPPLY_TRANSFER_0911.rows.push(['T11', 'WATER', 25, 'S4']));
    if (number === 7) change(t => { t.SUPPLY_TRANSFER_0911.rows[4][2] = 25; });
    if (number === 11) change(t => t.EVAC_BATCH_0911.rows.push(['B10', 'S1', 5]));
  } else if (number === 12) {
    change(t => t.EVAC_BATCH_0911.rows.push(['B10', 'S1', 31]));
  } else if (number === 15) {
    change(t => t.ACCESS_LOG.rows.push(['L07', 'C225', 'S4-P6', 'OUT', '23:16']));
    change(t => t.ACCESS_LOG.rows.push(['L08', 'C225', 'S4-P6', 'IN', '23:17']));
  } else if (number === 16) {
    change(t => { t.TERMINAL_LOG.rows[0][2] = 'R006'; });
  } else if (number === 17) {
    change(t => { t.RECEPTION_AUDIT.rows[0][1] = 0; t.RECEPTION_AUDIT.rows[1][1] = null; });
  } else if (number >= 18) {
    change(t => t.OFFICIAL_EVAC_REGISTER.rows.push(['O999', 'R003', 'S4']));
    change(t => { t.OFFICIAL_EVAC_REGISTER.rows = t.OFFICIAL_EVAC_REGISTER.rows.filter(row => row[1] !== 'R004'); });
    if (number === 20) {
      change(t => { t.TRANSIT_SHADOW.rows.find(row => row[0] === 'C225')[1] = 'CENTRAL'; });
      change(t => { t.ACCESS_LOG.rows.find(row => row[1] === 'C225')[2] = 'S2-EAST'; });
      change(t => { t.EVAC_MANIFEST.rows = t.EVAC_MANIFEST.rows.filter(row => row[0] !== 'R005'); });
    }
  }
  return variants;
}

export function judgeQuery(SQL, tables, mission, sql, part = 0) {
  const db = createDatabase(SQL, tables);
  let result;
  try { result = executeQuery(db, sql); } finally { db.close(); }
  const canonical = part === 1 && mission.followup ? mission.followup.sql : mission.CANONICAL_SQL;
  const expected = part === 1 && mission.followup ? mission.followup.result : mission.EXPECTED_RESULT;
  const options = { ordered: !!mission.ordered, strictColumns: !!mission.strictColumns };
  if (!sameResult(result, expected, options)) return { result, ok: false, reason: '結果を確認できました。調査対象・取り出す列・対応する記録を見直せます。' };
  if (mission.ordered && !/\bORDER\s+BY\b/i.test(sql)) return { result, ok: false, reason: '並び順も再現できる照会として保存してください。' };
  const number = Number(mission.MISSION_ID.slice(-2));
  for (const variant of verificationCases(number, tables)) {
    const probe = createDatabase(SQL, variant);
    try {
      if (!sameResult(executeQuery(probe, sql), executeQuery(probe, canonical), options)) {
        return { result, ok: false, reason: 'この記録では値が一致していますが、調査対象を再現する条件になっていません。固定のIDや件数ではなく、記録の関係を確認してください。' };
      }
    } finally { probe.close(); }
  }
  return { result, ok: true, reason: '照会結果を証拠として保全できます。' };
}
