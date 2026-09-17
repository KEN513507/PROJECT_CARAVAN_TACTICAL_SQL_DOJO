// js/sql-engine.js
// NEON RELAY ― READ-ONLY SQL 実行エンジン
//
// docs/NEON_RELAY_FE_RTP_IMPLEMENTATION_ALIGNMENT.md の Vertical Slice。
// プレイヤーのクエリを実データ(js/data.js TABLES)へ適用し、結果を「計算」する。
// 文字列一致で正解を判定していた経路を置き換えるための最小実装であり、
// 完全なDBMSではない。対応範囲は同文書 MINIMUM_SQL_FEATURES に限定する。
//
// READ-ONLY: INSERT / UPDATE / DELETE / CREATE / DROP / ALTER は実行しない。

export class SqlError extends Error {}

const KEYWORDS = new Set(['SELECT', 'FROM', 'WHERE', 'GROUP', 'BY', 'HAVING', 'ORDER',
  'INNER', 'JOIN', 'ON', 'AS', 'AND', 'OR', 'NOT', 'IN', 'ASC', 'DESC']);
const AGGREGATES = new Set(['COUNT', 'SUM', 'AVG', 'MAX', 'MIN']);
const WRITE_STATEMENTS = ['INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'TRUNCATE', 'MERGE', 'REPLACE'];

// ---- Tokenizer ----
function tokenize(sql){
  const re = /\s*(?:(<=|>=|<>|!=|=|<|>)|([(),*])|('(?:[^']|'')*')|(\d+(?:\.\d+)?)|([A-Za-z_぀-ヿ一-鿿][A-Za-z0-9_぀-ヿ一-鿿]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?))/gy;
  const out = [];
  let pos = 0;
  const src = String(sql).replace(/;\s*$/, '');
  while(pos < src.length){
    re.lastIndex = pos;
    const m = re.exec(src);
    if(!m){
      if(/^\s+$/.test(src.slice(pos))) break;
      throw new SqlError(`解釈できない文字があります: "${src.slice(pos, pos + 12)}"`);
    }
    pos = re.lastIndex;
    if(m[1]) out.push({ type: 'op', value: m[1] === '!=' ? '<>' : m[1] });
    else if(m[2]) out.push({ type: 'punct', value: m[2] });
    else if(m[3]) out.push({ type: 'string', value: m[3].slice(1, -1).replace(/''/g, "'") });
    else if(m[4]) out.push({ type: 'number', value: m[4] });
    else {
      const raw = m[5], up = raw.toUpperCase();
      if(KEYWORDS.has(up)) out.push({ type: 'kw', value: up });
      else out.push({ type: 'name', value: raw, upper: up });
    }
  }
  return out;
}

// ---- Parser ----
class Parser {
  constructor(tokens){ this.t = tokens; this.i = 0; }
  peek(){ return this.t[this.i]; }
  atKw(kw){ const x = this.peek(); return !!x && x.type === 'kw' && x.value === kw; }
  atPunct(p){ const x = this.peek(); return !!x && x.type === 'punct' && x.value === p; }
  next(){ return this.t[this.i++]; }
  expectKw(kw){
    if(!this.atKw(kw)) throw new SqlError(`${kw} が必要です`);
    return this.next();
  }
  expectPunct(p){
    if(!this.atPunct(p)) throw new SqlError(`"${p}" が必要です`);
    return this.next();
  }
  expectName(){
    const x = this.peek();
    if(!x || x.type !== 'name') throw new SqlError('名前(列名・表名)が必要です');
    return this.next();
  }

  parseSelect(){
    this.expectKw('SELECT');
    const columns = this.parseSelectList();
    this.expectKw('FROM');
    const from = this.parseTableRef();
    const joins = [];
    while(this.atKw('INNER') || this.atKw('JOIN')){
      if(this.atKw('INNER')) this.next();
      this.expectKw('JOIN');
      const table = this.parseTableRef();
      this.expectKw('ON');
      const left = this.parseOperand();
      const opTok = this.peek();
      if(!opTok || opTok.type !== 'op') throw new SqlError('ON には比較条件が必要です');
      this.next();
      const right = this.parseOperand();
      joins.push({ table, on: { kind: 'cmp', left, op: opTok.value, right } });
    }
    let where = null, groupBy = null, having = null, orderBy = null;
    if(this.atKw('WHERE')){ this.next(); where = this.parseOr(); }
    if(this.atKw('GROUP')){
      this.next(); this.expectKw('BY');
      groupBy = [this.parseOperand()];
      while(this.atPunct(',')){ this.next(); groupBy.push(this.parseOperand()); }
    }
    if(this.atKw('HAVING')){ this.next(); having = this.parseOr(); }
    if(this.atKw('ORDER')){
      this.next(); this.expectKw('BY');
      orderBy = [];
      do {
        const expr = this.parseOperand();
        let dir = 'ASC';
        if(this.atKw('ASC')){ this.next(); }
        else if(this.atKw('DESC')){ this.next(); dir = 'DESC'; }
        orderBy.push({ expr, dir });
      } while(this.atPunct(',') && (this.next(), true));
    }
    if(this.i < this.t.length) throw new SqlError('文の後ろに余分な記述があります');
    return { columns, from, joins, where, groupBy, having, orderBy };
  }

  parseSelectList(){
    if(this.atPunct('*')){ this.next(); return [{ kind: 'star' }]; }
    const list = [];
    do {
      const expr = this.parseOperand();
      let alias = null;
      if(this.atKw('AS')){ this.next(); alias = this.expectName().value; }
      else if(this.peek() && this.peek().type === 'name' && expr.kind !== 'literal'){
        alias = this.next().value; // AS省略形
      }
      list.push({ kind: 'expr', expr, alias });
    } while(this.atPunct(',') && (this.next(), true));
    return list;
  }

  parseTableRef(){
    const name = this.expectName().value;
    let alias = null;
    if(this.atKw('AS')){ this.next(); alias = this.expectName().value; }
    else if(this.peek() && this.peek().type === 'name') alias = this.next().value;
    return { name, alias };
  }

  parseOperand(){
    const x = this.peek();
    if(!x) throw new SqlError('式が必要です');
    if(x.type === 'string'){ this.next(); return { kind: 'literal', value: x.value }; }
    if(x.type === 'number'){ this.next(); return { kind: 'literal', value: x.value }; }
    if(x.type === 'name'){
      // 集約関数か列参照か
      if(AGGREGATES.has(x.upper) && this.t[this.i + 1] && this.t[this.i + 1].type === 'punct' && this.t[this.i + 1].value === '('){
        this.next(); this.next();
        let arg;
        if(this.atPunct('*')){ this.next(); arg = { kind: 'star' }; }
        else arg = this.parseOperand();
        this.expectPunct(')');
        return { kind: 'agg', fn: x.upper, arg, text: `${x.upper}(${arg.kind === 'star' ? '*' : arg.name})` };
      }
      this.next();
      return { kind: 'col', name: x.value };
    }
    throw new SqlError('式が必要です');
  }

  parseOr(){
    let node = this.parseAnd();
    while(this.atKw('OR')){ this.next(); node = { kind: 'or', left: node, right: this.parseAnd() }; }
    return node;
  }
  parseAnd(){
    let node = this.parseNot();
    while(this.atKw('AND')){ this.next(); node = { kind: 'and', left: node, right: this.parseNot() }; }
    return node;
  }
  parseNot(){
    if(this.atKw('NOT')){ this.next(); return { kind: 'not', expr: this.parseNot() }; }
    return this.parsePredicate();
  }
  parsePredicate(){
    if(this.atPunct('(')){
      this.next();
      const inner = this.parseOr();
      this.expectPunct(')');
      return inner;
    }
    const left = this.parseOperand();
    if(this.atKw('NOT') && this.t[this.i + 1] && this.t[this.i + 1].type === 'kw' && this.t[this.i + 1].value === 'IN'){
      this.next(); this.next();
      return { kind: 'not', expr: this.parseInList(left) };
    }
    if(this.atKw('IN')){ this.next(); return this.parseInList(left); }
    const opTok = this.peek();
    if(!opTok || opTok.type !== 'op') throw new SqlError('比較演算子が必要です');
    this.next();
    return { kind: 'cmp', left, op: opTok.value, right: this.parseOperand() };
  }
  parseInList(left){
    this.expectPunct('(');
    const items = [];
    do { items.push(this.parseOperand()); } while(this.atPunct(',') && (this.next(), true));
    this.expectPunct(')');
    return { kind: 'in', left, items };
  }
}

// ---- 値の解釈 ----
function isNumericLike(v){ return v !== '' && v !== null && v !== undefined && !isNaN(Number(v)); }
function compareValues(a, b){
  if(isNumericLike(a) && isNumericLike(b)){
    const x = Number(a), y = Number(b);
    return x < y ? -1 : (x > y ? 1 : 0);
  }
  const x = String(a), y = String(b);
  return x < y ? -1 : (x > y ? 1 : 0);
}

// ---- Row(結合後の1行)から列値を取り出す ----
function resolveCol(row, name){
  if(Object.prototype.hasOwnProperty.call(row.values, name)){
    const v = row.values[name];
    if(v === '__AMBIGUOUS__') throw new SqlError(`列 ${name} はどの表のものか特定できません。表名を付けてください`);
    return v;
  }
  const hit = row.unqualified[name.toLowerCase()];
  if(hit === undefined){
    const known = Object.keys(row.values).join(', ');
    throw new SqlError(`列 ${name} が見つかりません (利用可能: ${known})`);
  }
  if(hit === '__AMBIGUOUS__') throw new SqlError(`列 ${name} はどの表のものか特定できません。表名を付けてください`);
  return hit;
}

function evalOperand(node, row, groupRows){
  if(node.kind === 'literal') return node.value;
  if(node.kind === 'col') return resolveCol(row, node.name);
  if(node.kind === 'agg') return evalAggregate(node, groupRows);
  throw new SqlError('式を評価できません');
}

function evalAggregate(node, groupRows){
  if(!groupRows) throw new SqlError('集約関数はここでは使えません');
  if(node.fn === 'COUNT'){
    if(node.arg.kind === 'star') return String(groupRows.length);
    return String(groupRows.filter(r => {
      const v = resolveCol(r, node.arg.name);
      return v !== null && v !== undefined && v !== '';
    }).length);
  }
  const nums = groupRows.map(r => resolveCol(r, node.arg.name)).filter(v => v !== null && v !== undefined && v !== '');
  if(!nums.length) return '';
  if(node.fn === 'MAX') return nums.reduce((a, b) => compareValues(a, b) >= 0 ? a : b);
  if(node.fn === 'MIN') return nums.reduce((a, b) => compareValues(a, b) <= 0 ? a : b);
  const total = nums.reduce((s, v) => {
    if(!isNumericLike(v)) throw new SqlError(`${node.fn} は数値列にしか使えません`);
    return s + Number(v);
  }, 0);
  if(node.fn === 'SUM') return String(total);
  return String(total / nums.length); // AVG
}

function evalCondition(node, row, groupRows){
  switch(node.kind){
    case 'and': return evalCondition(node.left, row, groupRows) && evalCondition(node.right, row, groupRows);
    case 'or':  return evalCondition(node.left, row, groupRows) || evalCondition(node.right, row, groupRows);
    case 'not': return !evalCondition(node.expr, row, groupRows);
    case 'in': {
      const l = evalOperand(node.left, row, groupRows);
      return node.items.some(it => compareValues(l, evalOperand(it, row, groupRows)) === 0);
    }
    case 'cmp': {
      const l = evalOperand(node.left, row, groupRows);
      const r = evalOperand(node.right, row, groupRows);
      const c = compareValues(l, r);
      switch(node.op){
        case '=':  return c === 0;
        case '<>': return c !== 0;
        case '>':  return c > 0;
        case '>=': return c >= 0;
        case '<':  return c < 0;
        case '<=': return c <= 0;
      }
      throw new SqlError(`未対応の演算子: ${node.op}`);
    }
  }
  throw new SqlError('条件を評価できません');
}

// ---- 表の読み込み（1行 → { values, unqualified } ） ----
function loadTable(tables, ref){
  const key = Object.keys(tables).find(k => k.toUpperCase() === ref.name.toUpperCase());
  if(!key) throw new SqlError(`表 ${ref.name} は存在しません`);
  const tb = tables[key];
  const prefix = ref.alias || key;
  return tb.rows.map(r => {
    const values = {};
    tb.cols.forEach((c, i) => {
      values[`${prefix}.${c}`] = r[i];
      values[c] = r[i];
    });
    return { values, cols: tb.cols.map(c => ({ prefix, col: c })) };
  });
}

function buildUnqualified(row){
  const map = {};
  for(const { col } of row.cols){
    const lower = col.toLowerCase();
    map[lower] = map[lower] === undefined ? row.values[col] : '__AMBIGUOUS__';
  }
  return map;
}

function mergeRows(a, b){
  const values = Object.assign({}, a.values, b.values);
  const cols = a.cols.concat(b.cols);
  // 非修飾名は、同名列が複数表にある場合は曖昧としてマークする
  const seen = {};
  for(const { prefix, col } of cols){
    seen[col] = seen[col] === undefined ? prefix : '__DUP__';
  }
  for(const col of Object.keys(seen)){
    if(seen[col] === '__DUP__') values[col] = '__AMBIGUOUS__';
  }
  return { values, cols };
}

// ---- 実行 ----
export function executeSelect(sql, tables){
  const text = String(sql || '').trim();
  if(!text) throw new SqlError('クエリが空です');
  const head = text.toUpperCase().replace(/^\s+/, '').split(/\s|\(/)[0];
  if(WRITE_STATEMENTS.includes(head)){
    throw new SqlError(`${head} は実行できません。この端末はREAD-ONLYです`);
  }
  const ast = new Parser(tokenize(text)).parseSelect();

  // FROM / JOIN
  let rows = loadTable(tables, ast.from);
  for(const j of ast.joins){
    const right = loadTable(tables, j.table);
    const joined = [];
    for(const l of rows){
      for(const r of right){
        const merged = mergeRows(l, r);
        merged.unqualified = buildUnqualified(merged);
        if(evalCondition(j.on, merged, null)) joined.push(merged);
      }
    }
    rows = joined;
  }
  rows.forEach(r => { r.unqualified = buildUnqualified(r); });

  // WHERE
  if(ast.where) rows = rows.filter(r => evalCondition(ast.where, r, null));

  // 集約の有無
  const selectExprs = ast.columns.filter(c => c.kind === 'expr').map(c => c.expr);
  const hasAgg = selectExprs.some(e => e.kind === 'agg') ||
    (ast.having ? JSON.stringify(ast.having).includes('"agg"') : false);

  let groups;
  if(ast.groupBy){
    const map = new Map();
    for(const r of rows){
      const key = ast.groupBy.map(g => String(evalOperand(g, r, null))).join('');
      if(!map.has(key)) map.set(key, { key: r, rows: [] });
      map.get(key).rows.push(r);
    }
    groups = [...map.values()];
  } else if(hasAgg){
    groups = [{ key: rows[0] || { values: {}, unqualified: {}, cols: [] }, rows }];
  } else {
    groups = rows.map(r => ({ key: r, rows: [r] }));
  }

  // HAVING
  if(ast.having) groups = groups.filter(g => evalCondition(ast.having, g.key, g.rows));

  // SELECT 射影
  let cols;
  if(ast.columns.length === 1 && ast.columns[0].kind === 'star'){
    cols = (rows[0] ? rows[0].cols.map(c => c.col) : []);
    const outRows = groups.map(g => cols.map(c => g.key.values[c]));
    return { cols, rows: outRows };
  }
  cols = ast.columns.map(c => {
    if(c.alias) return c.alias;
    if(c.expr.kind === 'col') return c.expr.name.includes('.') ? c.expr.name.split('.').pop() : c.expr.name;
    if(c.expr.kind === 'agg') return c.expr.text;
    return String(c.expr.value);
  });
  let outRows = groups.map(g => ast.columns.map(c =>
    String(evalOperand(c.expr, g.key, g.rows))));

  // ORDER BY
  if(ast.orderBy){
    const keyed = groups.map((g, idx) => ({ idx, g }));
    keyed.sort((A, B) => {
      for(const o of ast.orderBy){
        const a = evalOperand(o.expr, A.g.key, A.g.rows);
        const b = evalOperand(o.expr, B.g.key, B.g.rows);
        const c = compareValues(a, b);
        if(c !== 0) return o.dir === 'DESC' ? -c : c;
      }
      return 0;
    });
    outRows = keyed.map(k => outRows[k.idx]);
  }

  return { cols, rows: outRows, ordered: !!ast.orderBy };
}

// ---- 期待結果との比較（別解を受理するための意味比較） ----
// 列の並び順は問わない（列名の集合と、その列ごとの値が一致すればよい）。
// 行順は ORDER BY のあるクエリだけ厳密に見る。
export function resultsMatch(actual, expected, opts){
  if(!actual || !expected) return false;
  const a = actual.cols.map(c => String(c).toLowerCase());
  const e = expected.cols.map(c => String(c).toLowerCase());
  if(a.length !== e.length) return false;
  if([...a].sort().join('') !== [...e].sort().join('')) return false;
  if(actual.rows.length !== expected.rows.length) return false;

  // expectedの列順に合わせてactualを並べ替える
  const order = e.map(name => a.indexOf(name));
  const norm = rows => rows.map(r => order.map(i => normValue(r[i])));
  const aligned = norm(actual.rows);
  const target = expected.rows.map(r => r.map(normValue));

  const ordered = (opts && opts.ordered) || actual.ordered;
  if(ordered){
    return aligned.every((r, i) => r.join('') === target[i].join(''));
  }
  const bag = target.map(r => r.join(''));
  for(const r of aligned){
    const k = r.join('');
    const at = bag.indexOf(k);
    if(at === -1) return false;
    bag.splice(at, 1);
  }
  return bag.length === 0;
}

function normValue(v){
  if(v === null || v === undefined) return '';
  const s = String(v).trim();
  return isNumericLike(s) ? String(Number(s)) : s;
}

// ---- 正誤判定（結果ベース） ----
// 文字列一致ではなく、実データへ適用した結果が期待結果と一致するかで判定する。
// これにより、想定外だが正しい別解も受理される。
export function judgeByResult(sql, expectedResultSet, tables){
  const text = String(sql || '').trim();
  if(!text.replace(/\s/g, '').length) return { ok: false, empty: true, result: null, error: null };
  let result;
  try {
    result = executeSelect(text, tables);
  } catch(err){
    return { ok: false, empty: false, result: null, error: err instanceof SqlError ? err.message : String(err && err.message || err) };
  }
  return { ok: resultsMatch(result, expectedResultSet), empty: false, result, error: null };
}
