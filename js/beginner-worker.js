/* global initSqlJs */
importScripts('../node_modules/sql.js/dist/sql-wasm.js');
const ready = Promise.all([
  initSqlJs({ locateFile: file => `../node_modules/sql.js/dist/${file}` }),
  import('./beginner-data.js'), import('./beginner-sql.js'),
]);

self.onmessage = async ({ data }) => {
  try {
    const [SQL, { MISSIONS, tablesForMission }, { judgeQuery }] = await ready;
    const mission = MISSIONS[data.index];
    if (!mission) throw new Error('調査が見つかりません。');
    const judgment = judgeQuery(SQL, tablesForMission(data.index + 1), mission, data.sql, data.part);
    self.postMessage({ id: data.id, ...judgment });
  } catch (error) {
    const { explainSqlError } = await import('./beginner-sql.js');
    self.postMessage({ id: data.id, ok: false, error: explainSqlError(error.message) });
  }
};
