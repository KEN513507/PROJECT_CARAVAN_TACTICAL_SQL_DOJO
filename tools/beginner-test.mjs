import assert from 'node:assert/strict';
import initSqlJs from 'sql.js';
import { MISSIONS, LABELS, REQUIRED_FIELDS, tablesForMission, ABSENT_IDS } from '../js/beginner-data.js';
import { TABLES as original } from '../js/data.js';
import { createDatabase, executeQuery, sameResult, judgeQuery } from '../js/beginner-sql.js';

const SQL = await initSqlJs();
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
const run = (tables, sql) => { const db = createDatabase(SQL, tables); try { return executeQuery(db, sql); } finally { db.close(); } };
check('exactly 20 playable missions, all required fields', () => {
  assert.equal(MISSIONS.length, 20);
  assert.equal(new Set(MISSIONS.map(m => m.MISSION_ID)).size, 20);
  for (const m of MISSIONS) for (const f of REQUIRED_FIELDS) assert.notEqual(m[f], undefined, `${m.MISSION_ID}.${f}`);
});
for (const [index, m] of MISSIONS.entries()) {
  const tables = tablesForMission(index + 1);
  check(`${m.MISSION_ID} canonical SQL, expected result, counterexamples`, () => {
    const judged = judgeQuery(SQL, tables, m, m.CANONICAL_SQL);
    assert.equal(judged.ok, true, `${m.MISSION_ID}: ${judged.reason}`);
    assert(sameResult(run(tables, m.CANONICAL_SQL), m.EXPECTED_RESULT, { ordered: !!m.ordered, strictColumns: !!m.strictColumns }));
    for (const sql of m.equivalents || []) assert(judgeQuery(SQL, tables, m, sql).ok);
    if (m.followup) assert(judgeQuery(SQL, tables, m, m.followup.sql, 1).ok);
    for (const table of m.SOURCE_TABLES) {
      assert(tables[table], `unreleased table: ${table}`);
      assert(LABELS[table]);
      for (const col of tables[table].cols) assert(LABELS[col], `missing label: ${col}`);
    }
  });
}
check('no early AS, JOIN, NULL, HAVING, NOT EXISTS, or DISTINCT dependency', () => {
  MISSIONS.forEach((m, i) => {
    const sql = m.CANONICAL_SQL;
    if (i < 12) assert(!/\bAS\b/.test(sql));
    if (i < 13) assert(!/\bJOIN\b/.test(sql));
    if (i < 16) assert(!/\bNULL\b/.test(sql));
    if (i < 11) assert(!/\bHAVING\b/.test(sql));
    if (i < 18) assert(!/\bEXISTS\b/.test(sql));
    assert(!/\bDISTINCT\b/.test(sql));
  });
});
check('existing canon rows and incomplete legacy tables are preserved', () => {
  const full = tablesForMission(20);
  for (const name of ['RESIDENT_CACHE', 'SUPPLY_TRANSFER_0911', 'EVAC_BATCH_0911', 'PERSON_INDEX']) assert.deepEqual(full[name].rows, original[name].rows);
  for (const name of ['ACCESS_LOG', 'TRANSIT_SHADOW']) for (const row of original[name].rows) assert(full[name].rows.some(r => JSON.stringify(r) === JSON.stringify(row)));
  assert.equal(original.TRANSIT_SHADOW.rows.length, 3);
  assert.equal(original.ACCESS_LOG.rows.length, 6);
});
check('full manifests reconcile by batch and person, not repeated log count', () => {
  const t = tablesForMission(20);
  assert.equal(t.EVAC_MANIFEST.rows.length, 83);
  assert.equal(t.OFFICIAL_EVAC_REGISTER.rows.length, 30);
  assert.equal(ABSENT_IDS.length, 53);
  assert.equal(new Set(t.EVAC_MANIFEST.rows.map(r => r[0])).size, 83);
  assert.equal(new Set(t.EVAC_MANIFEST.rows.map(r => r[1])).size, 83);
  assert.equal(new Set(t.TRANSIT_SHADOW.rows.map(r => r[0])).size, 83);
  const batch = run(t, 'SELECT batch_id, COUNT(*) AS people FROM EVAC_MANIFEST GROUP BY batch_id;');
  assert.deepEqual(batch.rows, [['B06', 21], ['B07', 19], ['B08', 16], ['B09', 27]]);
  const entries = run(t, "SELECT credential_id, COUNT(*) FROM ACCESS_LOG WHERE gate = 'S4-P6' AND event = 'IN' GROUP BY credential_id;");
  assert.equal(entries.rows.length, 83);
  assert(entries.rows.every(r => r[1] === 1));
});
check('NULL, zero, and empty string remain distinct in SQLite and judging', () => {
  const t = tablesForMission(17);
  assert.deepEqual(run(t, 'SELECT reception_id FROM RECEPTION_AUDIT WHERE verified_count = NULL;').rows, []);
  assert.deepEqual(run(t, 'SELECT reception_id FROM RECEPTION_AUDIT WHERE verified_count = 0;').rows, [['E443']]);
  assert.deepEqual(run(t, "SELECT reception_id FROM RECEPTION_AUDIT WHERE operator_note = ''; ").rows, [['E444']]);
  assert.deepEqual(run(t, 'SELECT COUNT(operator_note) FROM RECEPTION_AUDIT;').rows, [[2]]);
  assert(!sameResult({ cols: ['x'], rows: [[null]] }, { cols: ['x'], rows: [['']] }));
  assert(!sameResult({ cols: ['x'], rows: [[0]] }, { cols: ['x'], rows: [['']] }));
});
check('semantic errors rejected: OR, WHERE-before-grouping, inner join, uncorrelated absence', () => {
  for (const [number, sql] of [
    [5, "SELECT resident_id, display_name FROM RESIDENT_CACHE WHERE status = 'MISSING' OR last_sector = 'S4';"],
    [12, 'SELECT sector, SUM(people) FROM EVAC_BATCH_0911 WHERE people > 30 GROUP BY sector;'],
    [18, "SELECT m.resident_id FROM EVAC_MANIFEST AS m INNER JOIN OFFICIAL_EVAC_REGISTER AS o ON m.resident_id=o.resident_id WHERE m.batch_id='B06' AND o.registration_id IS NULL;"],
    [19, 'SELECT m.resident_id FROM EVAC_MANIFEST AS m WHERE NOT EXISTS (SELECT 1 FROM OFFICIAL_EVAC_REGISTER);'],
  ]) assert.equal(judgeQuery(SQL, tablesForMission(number), MISSIONS[number - 1], sql).ok, false);
});
check('ORDER BY ties require the specified stable secondary order', () => {
  const m = MISSIONS[6];
  const good = m.CANONICAL_SQL;
  assert(judgeQuery(SQL, tablesForMission(7), m, good).ok);
  assert(!judgeQuery(SQL, tablesForMission(7), m, good.replace(', transfer_id ASC', ', transfer_id DESC')).ok);
});
check('final investigation accepts alternate join order, aliases, LEFT JOIN, and optional HAVING', () => {
  const sql = "SELECT t.destination AS place, COUNT(*) AS headcount FROM TRANSIT_SHADOW AS t INNER JOIN ACCESS_LOG AS a ON t.credential_id = a.credential_id INNER JOIN EVAC_MANIFEST AS m ON m.credential_id = a.credential_id LEFT JOIN OFFICIAL_EVAC_REGISTER AS o ON o.resident_id = m.resident_id WHERE a.event = 'IN' AND a.gate = 'S4-P6' AND o.registration_id IS NULL GROUP BY t.destination HAVING COUNT(*) > 0 ORDER BY t.destination;";
  assert(judgeQuery(SQL, tablesForMission(20), MISSIONS[19], sql).ok);
});
check('final investigation rejects matching totals without the necessary evidence relation', () => {
  const t = tablesForMission(20);
  const shortcut = "SELECT destination, COUNT(*) AS people FROM TRANSIT_SHADOW WHERE route_state='HIDDEN' GROUP BY destination;";
  assert(sameResult(run(t, shortcut), MISSIONS[19].EXPECTED_RESULT));
  assert(!judgeQuery(SQL, t, MISSIONS[19], shortcut).ok);
  assert(!judgeQuery(SQL, t, MISSIONS[19], "SELECT 'NORTH-LATTICE' AS destination, 53 AS people;").ok);
});
check('writes and multi-statements rejected, source records unchanged', () => {
  const t = tablesForMission(1);
  const db = createDatabase(SQL, t);
  try {
    for (const sql of ['DELETE FROM RESIDENT_CACHE;', "UPDATE RESIDENT_CACHE SET status='ACTIVE';", 'PRAGMA query_only=OFF;', 'SELECT resident_id FROM RESIDENT_CACHE; DELETE FROM RESIDENT_CACHE;', 'SELECT resident_id FROM RESIDENT_CACHE; SELECT status FROM RESIDENT_CACHE;']) assert.throws(() => executeQuery(db, sql));
    assert.equal(executeQuery(db, 'SELECT resident_id FROM RESIDENT_CACHE;').rows.length, 7);
  } finally { db.close(); }
});
console.log(`\n${checks} checks passed. All 20 missions verified with SQLite.`);
