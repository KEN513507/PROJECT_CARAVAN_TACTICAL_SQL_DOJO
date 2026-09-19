import test from 'node:test';
import assert from 'node:assert/strict';
import { ONBOARDING_STAGES as stages, ONBOARDING_TABLES as tables, queryTokens, queryText, editQuery } from '../js/onboarding.js';
import { executeSelect, judgeByResult } from '../js/sql-engine.js';
import { ChapterSession, Phase } from '../js/chapter-session.js';
import { fieldLabel, tableLabel } from '../js/display-labels.js';

test('M01–M12 run against canonical SQL engine with immutable source data', () => {
  const before = JSON.stringify(tables);
  assert.equal(stages.length, 12);
  for(const [i, stage] of stages.entries()){
    const result = judgeByResult(stage.answers[0], stage.resultSet, tables, { ordered: stage.ordered });
    assert.equal(result.ok, true, `${stage.id}: ${result.error}`);
    assert.equal(stage.tables[0], i < 6 ? 'STOCK' : 'REQUESTS');
    assert.equal(stage.time, 0);
    assert.equal(stage.learning, true);
    assert.ok(!/53|CIVIS|Aya|住民/.test(JSON.stringify(stage)));
    assert.notEqual(tableLabel(stage.tables[0]), stage.tables[0]);
    result.result.cols.forEach(col => assert.notEqual(fieldLabel(col), col));
  }
  assert.equal(JSON.stringify(tables), before);
  assert.throws(() => executeSelect('DELETE FROM STOCK', tables));
});

test('result-based alternatives and mission-specific ordering', () => {
  const m5 = stages[4];
  const sql = "SELECT quantity, shelf, item FROM STOCK WHERE shelf = 'B' AND quantity < 6";
  assert.ok(!m5.answers.includes(sql));
  assert.ok(judgeByResult(sql, m5.resultSet, tables, { ordered: false }).ok);
  assert.ok(judgeByResult(stages[0].answers[0] + ' ORDER BY item DESC', stages[0].resultSet, tables, { ordered: false }).ok);
  const m6 = stages[5];
  assert.equal(judgeByResult(m5.answers[0], m6.resultSet, tables, { ordered: true }).ok, false);
  assert.equal(judgeByResult(m6.answers[0] + ' DESC', m6.resultSet, tables, { ordered: true }).ok, false);
  const reversed = structuredClone(tables); reversed.STOCK.rows.reverse();
  assert.equal(judgeByResult(m5.answers[0], m6.resultSet, reversed, { ordered: true }).ok, false, 'accidental source order is not a stable sort');
  assert.equal(judgeByResult(stages[8].answers[0], stages[9].resultSet, tables).ok, false);
});

test('editing retains previous SQL, inserts commas only between projections, and permits retry', () => {
  const original = queryTokens('SELECT item FROM STOCK');
  let next = editQuery(original, { t: 'shelf', k: 'col' }, { index: 2, replace: false });
  next = editQuery(next.tokens, { t: 'quantity', k: 'col' }, next.cursor);
  assert.equal(queryText(next.tokens), 'SELECT item , shelf , quantity FROM STOCK');
  assert.equal(queryText(original), 'SELECT item FROM STOCK');
  const grouped = editQuery(queryTokens('SELECT item FROM STOCK GROUP BY'), { t: 'item', k: 'col' }, { index: 5, replace: false });
  assert.equal(queryText(grouped.tokens), 'SELECT item FROM STOCK GROUP BY item');
  const selected = editQuery(queryTokens('SELECT □ FROM STOCK'), { t: 'item', k: 'col' }, { index: 1, replace: true });
  assert.equal(queryText(selected.tokens), 'SELECT item FROM STOCK');
  const session = new ChapterSession('M01');
  session.replaceDraft(queryTokens('SELECT FROM STOCK'));
  session.requestHint();
  assert.ok(session.submitQuery());
  assert.equal(session.prediction, null);
  assert.equal(judgeByResult(queryText(session.draft.tokens), stages[0].resultSet, tables).ok, false);
  session.reject('sql_error');
  assert.equal(queryText(session.draft.tokens), 'SELECT FROM STOCK');
  assert.ok(session.replaceDraft(selected.tokens));
  assert.ok(session.submitQuery());
  assert.equal(session.executionCount, 2);
  session.revealEvidence({}); session.clear();
  assert.equal(session.phase, Phase.CHAPTER_CLEARED);
  assert.equal(session.clearType, 'ASSISTED');
  assert.equal(session.replaceDraft([]), false, 'cleared evidence cannot be silently edited');
});
