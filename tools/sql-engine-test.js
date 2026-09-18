// tools/sql-engine-test.js
// READ-ONLY SQL実行エンジンの検証。
//   REAL_SQL_GATE          : 各章の正解SQLが実データへ適用され、期待結果と一致する
//   ALTERNATIVE_QUERY_GATE : 別の合法クエリも実データから正しい結果を返す
//   READ_ONLY_GATE         : 書き込み文を拒否する
//   FE_SYLLABUS_GATE       : FE データ操作範囲の各機能が実際に計算される
// 実行: node tools/sql-engine-test.js

const { pathToFileURL } = require('url');
const path = require('path');

let failCount = 0;
function check(label, ok, detail){
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? '  ' + detail : ''}`);
  if(!ok) failCount++;
}

function rs(cols, rows){ return { cols, rows }; }

(async () => {
  const eng = await import(pathToFileURL(path.resolve(__dirname, '../js/sql-engine.js')).href);
  const data = await import(pathToFileURL(path.resolve(__dirname, '../js/data.js')).href);
  const rel = await import(pathToFileURL(path.resolve(__dirname, '../js/relation-task.js')).href);
  const { executeSelect, resultsMatch, judgeByResult, SqlError } = eng;
  const TABLES = data.TABLES, STAGES = data.STAGES;

  const run = sql => executeSelect(sql, TABLES);

  // ================= REAL_SQL_GATE: 各章の正解SQL =================
  // RELATION TASK等のSQL Query以外のstageは対象外（answersを持たない）。
  const QUERY_STAGES = STAGES.filter(st => Array.isArray(st.answers) && st.answers.length);
  check('[REAL_SQL] SQL Query stageを検出できる', QUERY_STAGES.length === 5, `count=${QUERY_STAGES.length}`);
  // requiresFact を持つ章は、Relation Taskで復元された事実を重ねてから照会される。
  // RAW FACT のままでは0件になるのが正しい（復元前を復元済みにしない）。
  const FACTS = { 'EVAC_RECEPTION.E442.resident_id': 'R005' };
  QUERY_STAGES.forEach((st, i) => {
    const tbls = st.requiresFact ? rel.applyReconstructedFacts(TABLES, FACTS) : TABLES;
    st.answers.forEach((ans, k) => {
      let r = null, err = null;
      try { r = executeSelect(ans, tbls); } catch(e){ err = e.message; }
      const ok = !!r && resultsMatch(r, st.resultSet);
      check(`[REAL_SQL] CH${i + 1} answers[${k}] が実データで期待結果と一致`, ok,
        err ? 'ERROR: ' + err : (r ? `rows=${r.rows.length} cols=${r.cols.join(',')}` : ''));
    });
  });

  // 期待結果そのものの実測確認（hardcodedと実計算の一致）
  {
    const r = run("SELECT destination, SUM(quantity) AS total_quantity FROM SUPPLY_TRANSFER_0911 GROUP BY destination");
    const s4 = r.rows.find(x => x[0] === 'S4');
    check('[REAL_SQL] CH2 S4合計が実計算で86', !!s4 && s4[1] === '86', s4 ? s4.join('=') : 'not found');
  }
  {
    const r = run("SELECT sector, SUM(people) AS total_people FROM EVAC_BATCH_0911 GROUP BY sector HAVING SUM(people) > 30");
    check('[REAL_SQL] CH3 HAVINGで S4/83 の1行だけが残る',
      r.rows.length === 1 && r.rows[0][0] === 'S4' && r.rows[0][1] === '83', JSON.stringify(r.rows));
  }
  {
    const r = run("SELECT p.legal_name, a.gate, a.time FROM PERSON_INDEX AS p INNER JOIN ACCESS_LOG AS a ON p.credential_id = a.credential_id WHERE a.gate = 'S4-P6'");
    check('[REAL_SQL] CH4 JOINで3行・如月アヤを含む',
      r.rows.length === 3 && r.rows.some(x => x[0] === '如月アヤ'), JSON.stringify(r.rows));
  }

  // ================= ALTERNATIVE_QUERY_GATE =================
  // 文字列一致では不正解になるが、結果は正しいクエリ群
  const ch1Expected = STAGES[0].resultSet;
  const alts = [
    ["条件の順序を入れ替え", "SELECT resident_id, display_name FROM RESIDENT_CACHE WHERE last_sector = 'S4' AND status = 'MISSING'"],
    ["IN を使った書き換え", "SELECT resident_id, display_name FROM RESIDENT_CACHE WHERE status IN ('MISSING') AND last_sector IN ('S4')"],
    ["括弧付き条件", "SELECT resident_id, display_name FROM RESIDENT_CACHE WHERE (status = 'MISSING') AND (last_sector = 'S4')"],
    ["NOT による同値表現", "SELECT resident_id, display_name FROM RESIDENT_CACHE WHERE status = 'MISSING' AND NOT last_sector <> 'S4'"],
    ["別名付きの表参照", "SELECT r.resident_id, r.display_name FROM RESIDENT_CACHE AS r WHERE r.status = 'MISSING' AND r.last_sector = 'S4'"]
  ];
  alts.forEach(([label, sql]) => {
    let r = null, err = null;
    try { r = run(sql); } catch(e){ err = e.message; }
    check(`[ALT_QUERY] CH1 別解が正しい結果を返す: ${label}`, !!r && resultsMatch(r, ch1Expected), err || '');
  });

  // 文字列一致judgeでは落ちることの確認（結果ベース判定の存在意義）
  {
    const { judge } = await import(pathToFileURL(path.resolve(__dirname, '../js/validator.js')).href);
    const sql = alts[0][1];
    const strOk = judge(sql, STAGES[0].answers).ok;
    const resOk = judgeByResult(sql, STAGES[0].resultSet, TABLES).ok;
    check('[ALT_QUERY] 文字列一致では不正解・結果ベースでは正解', strOk === false && resOk === true,
      `string=${strOk} result=${resOk}`);
  }

  // 誤答が正しく不正解になること
  const wrongs = [
    ["条件が緩い(WHEREひとつ)", "SELECT resident_id, display_name FROM RESIDENT_CACHE WHERE status = 'MISSING'"],
    ["値の取り違え", "SELECT resident_id, display_name FROM RESIDENT_CACHE WHERE status = 'MISSING' AND last_sector = 'MISSING'"],
    ["ORで広すぎる", "SELECT resident_id, display_name FROM RESIDENT_CACHE WHERE status = 'MISSING' OR last_sector = 'S4'"],
    ["列が足りない", "SELECT resident_id FROM RESIDENT_CACHE WHERE status = 'MISSING' AND last_sector = 'S4'"]
  ];
  wrongs.forEach(([label, sql]) => {
    const j = judgeByResult(sql, ch1Expected, TABLES);
    check(`[ALT_QUERY] 誤答は不正解と判定: ${label}`, j.ok === false, `rows=${j.result ? j.result.rows.length : 'err'}`);
  });

  // ================= READ_ONLY_GATE =================
  [
    "DELETE FROM RESIDENT_CACHE",
    "UPDATE RESIDENT_CACHE SET status = 'ACTIVE'",
    "INSERT INTO RESIDENT_CACHE VALUES ('R999','X','ACTIVE','S1')",
    "DROP TABLE RESIDENT_CACHE",
    "CREATE TABLE X (a INT)"
  ].forEach(sql => {
    let rejected = false, msg = '';
    try { run(sql); } catch(e){ rejected = e instanceof SqlError; msg = e.message; }
    check(`[READ_ONLY] 拒否: ${sql.split(' ')[0]}`, rejected, msg);
  });
  // 実データが書き換わっていないこと
  check('[READ_ONLY] RESIDENT_CACHEは7行のまま', TABLES.RESIDENT_CACHE.rows.length === 7,
    `rows=${TABLES.RESIDENT_CACHE.rows.length}`);

  // ================= FE_SYLLABUS_GATE: STEP ladder の各機能 =================
  const feCases = [
    ['STEP1 SELECT/FROM 列選択', "SELECT resident_id, display_name FROM RESIDENT_CACHE", r => r.rows.length === 7 && r.cols.length === 2],
    ['STEP1 SELECT *', "SELECT * FROM RESIDENT_CACHE", r => r.rows.length === 7 && r.cols.length === 4],
    ['STEP2 WHERE 比較演算子 =', "SELECT resident_id FROM RESIDENT_CACHE WHERE last_sector = 'S4'", r => r.rows.length === 3],
    ['STEP2 WHERE <>', "SELECT resident_id FROM RESIDENT_CACHE WHERE status <> 'MISSING'", r => r.rows.length === 3],
    ['STEP3 AND', "SELECT resident_id FROM RESIDENT_CACHE WHERE status = 'MISSING' AND last_sector = 'S4'", r => r.rows.length === 3],
    ['STEP4 OR', "SELECT resident_id FROM RESIDENT_CACHE WHERE last_sector = 'S1' OR last_sector = 'S3'", r => r.rows.length === 2],
    ['STEP4 NOT', "SELECT resident_id FROM RESIDENT_CACHE WHERE NOT status = 'ACTIVE'", r => r.rows.length === 4],
    ['STEP5 IN', "SELECT resident_id FROM RESIDENT_CACHE WHERE last_sector IN ('S1','S3')", r => r.rows.length === 2],
    ['STEP5 NOT IN', "SELECT resident_id FROM RESIDENT_CACHE WHERE last_sector NOT IN ('S4')", r => r.rows.length === 4],
    ['STEP5 IN と OR が同値(FE令和7科目A問6の形式)',
      "SELECT resident_id FROM RESIDENT_CACHE WHERE last_sector IN ('S1','S3')",
      r => resultsMatch(r, run("SELECT resident_id FROM RESIDENT_CACHE WHERE last_sector = 'S1' OR last_sector = 'S3'"))],
    ['STEP6 ORDER BY ASC', "SELECT transfer_id, quantity FROM SUPPLY_TRANSFER_0911 ORDER BY quantity ASC", r => r.rows[0][1] === '4'],
    ['STEP6 ORDER BY DESC', "SELECT transfer_id, quantity FROM SUPPLY_TRANSFER_0911 ORDER BY quantity DESC", r => r.rows[0][1] === '25'],
    ['STEP7 COUNT(*)', "SELECT COUNT(*) AS n FROM RESIDENT_CACHE WHERE status = 'MISSING'", r => r.rows[0][0] === '4'],
    ['STEP8 SUM', "SELECT SUM(quantity) AS t FROM SUPPLY_TRANSFER_0911", r => r.rows[0][0] === '138'],
    ['STEP8 MAX/MIN', "SELECT MAX(people) AS mx, MIN(people) AS mn FROM EVAC_BATCH_0911", r => r.rows[0][0] === '27' && r.rows[0][1] === '7'],
    ['STEP8 AVG', "SELECT AVG(people) AS a FROM EVAC_BATCH_0911 WHERE sector = 'S1'", r => r.rows[0][0] === '9.5'],
    ['STEP9 GROUP BY', "SELECT destination, SUM(quantity) AS t FROM SUPPLY_TRANSFER_0911 GROUP BY destination", r => r.rows.length === 4],
    ['STEP10 HAVING', "SELECT sector, SUM(people) AS t FROM EVAC_BATCH_0911 GROUP BY sector HAVING SUM(people) > 30", r => r.rows.length === 1],
    ['STEP10 WHEREとHAVINGの相違', "SELECT sector, SUM(people) AS t FROM EVAC_BATCH_0911 WHERE people > 20 GROUP BY sector", r => r.rows.length === 1 && r.rows[0][1] === '48'],
    ['STEP11 INNER JOIN', "SELECT p.legal_name, a.gate FROM PERSON_INDEX AS p INNER JOIN ACCESS_LOG AS a ON p.credential_id = a.credential_id", r => r.rows.length === 6],
    ['STEP12 JOIN + WHERE', "SELECT p.legal_name FROM PERSON_INDEX AS p INNER JOIN ACCESS_LOG AS a ON p.credential_id = a.credential_id WHERE a.gate = 'S4-P6'", r => r.rows.length === 3],
    ['STEP13 JOIN+GROUP BY+HAVING',
      "SELECT t.destination, COUNT(a.credential_id) AS people FROM ACCESS_LOG AS a INNER JOIN TRANSIT_SHADOW AS t ON a.credential_id = t.credential_id WHERE a.gate = 'S4-P6' GROUP BY t.destination HAVING COUNT(a.credential_id) >= 2",
      r => r.rows.length === 1 && r.rows[0][0] === 'NORTH-LATTICE' && r.rows[0][1] === '2'],
    ['STEP14 3表結合',
      "SELECT r.display_name, p.legal_name, a.time FROM RESIDENT_CACHE AS r INNER JOIN PERSON_INDEX AS p ON r.resident_id = p.resident_id INNER JOIN ACCESS_LOG AS a ON p.credential_id = a.credential_id WHERE a.gate = 'S4-P6'",
      r => r.rows.length === 3 && r.rows.some(x => x[0] === 'UNKNOWN-07' && x[1] === '如月アヤ')]
  ];
  feCases.forEach(([label, sql, pred]) => {
    let r = null, err = null;
    try { r = run(sql); } catch(e){ err = e.message; }
    let ok = false;
    try { ok = !!r && pred(r); } catch(e){ err = err || e.message; }
    check(`[FE_SYLLABUS] ${label}`, ok, err ? 'ERROR: ' + err : (r ? JSON.stringify(r.rows).slice(0, 90) : ''));
  });

  // ================= RTP_GATE: Derived Fact が実計算で成立する =================
  {
    // UNKNOWN-07 の正体は単一表には存在しない。関係づけて初めて出る。
    const raw = run("SELECT display_name FROM RESIDENT_CACHE WHERE resident_id = 'R003'");
    const derived = run("SELECT p.legal_name, a.gate, a.time FROM RESIDENT_CACHE AS r INNER JOIN PERSON_INDEX AS p ON r.resident_id = p.resident_id INNER JOIN ACCESS_LOG AS a ON p.credential_id = a.credential_id WHERE r.display_name = 'UNKNOWN-07' AND a.gate = 'S4-P6'");
    check('[RTP] RAW: R003の表示名はUNKNOWN-07のみ', raw.rows.length === 1 && raw.rows[0][0] === 'UNKNOWN-07');
    check('[RTP] DERIVED: 関係演算で如月アヤ/23:11が導出される',
      derived.rows.length === 1 && derived.rows[0][0] === '如月アヤ' && derived.rows[0][2] === '23:11',
      JSON.stringify(derived.rows));
  }
  {
    // 不存在の観測: ACCESS_LOGに記録が無い住民（LEVEL 5の素材が実データで成立するか）
    const noLog = run("SELECT p.legal_name FROM PERSON_INDEX AS p INNER JOIN ACCESS_LOG AS a ON p.credential_id = a.credential_id");
    check('[RTP] ACCESS_LOGに現れる人物は一部のみ（不在が存在する）', noLog.rows.length < 7 * 6, `joined=${noLog.rows.length}`);
  }

  // ================= エラーメッセージが学習者向けであること =================
  [
    ["存在しない表", "SELECT x FROM NO_SUCH_TABLE", /存在しません/],
    ["存在しない列", "SELECT nope FROM RESIDENT_CACHE", /見つかりません/],
    ["曖昧な列", "SELECT resident_id FROM RESIDENT_CACHE AS r INNER JOIN PERSON_INDEX AS p ON r.resident_id = p.resident_id", /特定できません/],
    ["FROM忘れ", "SELECT resident_id", /FROM/]
  ].forEach(([label, sql, re]) => {
    let msg = '';
    try { run(sql); } catch(e){ msg = e.message; }
    check(`[ERROR_MSG] ${label}`, re.test(msg), msg || '(例外なし)');
  });

  console.log('');
  console.log(`FAIL_COUNT: ${failCount}`);
  process.exit(failCount === 0 ? 0 : 1);
})().catch(err => { console.error(err); process.exit(1); });
