// tools/relation-task-test.js
// RELATION TASK Domain テスト（DOM非依存）。
//   initial state / source row selection / relation match / wrong submit /
//   correct submit / evidence transition / hint & assistanceLevel /
//   Canon整合（既存IDを使い、IDの再割当をしていないこと）
// 実行: node tools/relation-task-test.js

const { pathToFileURL } = require('url');
const path = require('path');

let failCount = 0;
function check(label, ok, detail){
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? '  ' + detail : ''}`);
  if(!ok) failCount++;
}
function eq(label, actual, expected){
  check(label, actual === expected, actual === expected ? '' : `actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
}

(async () => {
  const mod = await import(pathToFileURL(path.resolve(__dirname, '../js/relation-task.js')).href);
  const data = await import(pathToFileURL(path.resolve(__dirname, '../js/data.js')).href);
  const { RELATION_TASKS, RelationPhase, RelationTaskSession, evaluateRelation,
          getRelationTask, buildRelationTables, EvidenceType,
          evaluateRelationMatch, referencedValues } = mod;
  const TABLES = data.TABLES;

  const TASK_ID = 'EVAC_RECEPTION_RECOVERY_01';
  const task = getRelationTask(TASK_ID);
  const SLOT = 'resident_id_missing';
  const fresh = () => new RelationTaskSession(task);

  // ================= initial state =================
  {
    const s = fresh();
    eq('[initial] phase は STORY_CONTEXT', s.phase, RelationPhase.STORY_CONTEXT);
    eq('[initial] 回答は空', Object.keys(s.answers).length, 0);
    eq('[initial] attemptCount は0', s.attemptCount, 0);
    eq('[initial] assistanceLevel は0', s.assistanceLevel, 0);
    eq('[initial] clearType は未確定', s.clearType, null);
    eq('[initial] isComplete は false', s.isComplete(), false);
  }

  // ================= 関係照合: source行の選択で復元値が決まる =================
  {
    const s = fresh();
    s.beginSolving();
    eq('[solving] beginSolving で RELATION_SOLVING', s.phase, RelationPhase.RELATION_SOLVING);

    // 候補値を直接与えるAPIが存在しないこと（弱いRelation Taskに戻らない保証）
    check('[strong] 候補トークン配列を持たない', task.candidateTokens === undefined);
    check('[strong] setAnswer(候補直接指定)が存在しない', typeof s.setAnswer !== 'function');
    check('[strong] slotに関係(relation)が定義されている', !!task.slots[0].relation);

    eq('[source] 対応するsource行を選べる', s.selectSource(SLOT, 'T-S4-03', TABLES), true);
    eq('[source] 選択が記録される', s.sources[SLOT], 'T-S4-03');
    eq('[source] 復元値はsource行から導出される', s.answers[SLOT], 'R005');
    eq('[source] isComplete が true', s.isComplete(), true);
    eq('[source] 全キー一致', s.matchOf(SLOT).allMatch, true);

    eq('[source] 対応しないsource行も選べる（誤答経路を残す）', s.selectSource(SLOT, 'T-S4-02', TABLES), true);
    eq('[source] その行の値が入る', s.answers[SLOT], 'R004');
    eq('[source] 不一致として判定される', s.matchOf(SLOT).allMatch, false);

    eq('[source] 存在しないsource行は拒否', s.selectSource(SLOT, 'T-S9-99', TABLES), false);
    eq('[source] 存在しないslotは拒否', s.selectSource('nope', 'T-S4-03', TABLES), false);
    eq('[source] clearAnswerで選択も消える', s.clearAnswer(SLOT) && s.sources[SLOT], undefined);
    eq('[source] clear後はisCompleteがfalse', s.isComplete(), false);
  }

  // ================= 照合キーごとのMATCH/MISMATCH =================
  {
    const slot = task.slots[0];
    const m = evaluateRelationMatch(task, slot, 'T-S4-03', TABLES);
    eq('[match] 照合キーは2件(terminal_id / received_at)', m.keys.length, 2);
    eq('[match] terminal_id が一致', m.keys[0].match, true);
    eq('[match] terminal_id の突合値', `${m.keys[0].targetValue}=${m.keys[0].sourceValue}`, 'T-S4-03=T-S4-03');
    eq('[match] received_at ↔ authenticated_at が一致', m.keys[1].match, true);
    eq('[match] 時刻の突合値', `${m.keys[1].targetValue}=${m.keys[1].sourceValue}`, '23:09=23:09');
    eq('[match] 復元に使う列', m.valueCol, 'authenticated_resident');
    eq('[match] 復元値', m.restoredValue, 'R005');

    const bad = evaluateRelationMatch(task, slot, 'T-S4-02', TABLES);
    eq('[match] 非対応行は両キー不一致', bad.keys.filter(k => !k.match).length, 2);
    eq('[match] 非対応行はallMatch=false', bad.allMatch, false);

    const bad2 = evaluateRelationMatch(task, slot, 'T-S4-01', TABLES);
    eq('[match] T-S4-01 も不一致', bad2.allMatch, false);

    // 一致する source 行が一意であること（正解が関係から一意に決まる）
    const all = task.fixtureTables.find(t => t.name === 'TERMINAL_LOG').rows.map(r => r[0]);
    const matched = all.filter(k => evaluateRelationMatch(task, slot, k, TABLES).allMatch);
    eq('[match] allMatchとなるsource行は1件だけ', matched.length, 1);
    eq('[match] それがT-S4-03', matched[0], 'T-S4-03');
  }

  // ================= submit ガード =================
  {
    const s = fresh();
    eq('[guard] STORY_CONTEXTではsubmit不可', s.submit(), false);
    s.beginSolving();
    eq('[guard] 未回答ではsubmit不可', s.submit(), false);
  }

  // ================= wrong submit =================
  {
    const s = fresh();
    s.beginSolving();
    s.selectSource(SLOT, 'T-S4-02', TABLES);
    eq('[wrong] submit できる', s.submit(), true);
    eq('[wrong] phase は RELATION_SUBMITTED', s.phase, RelationPhase.RELATION_SUBMITTED);
    const r = evaluateRelation(task, s.answers);
    eq('[wrong] evaluator が不正解と判定', r.ok, false);
    eq('[wrong] 誤りslotを返す', r.wrongSlots.join(','), SLOT);
    eq('[wrong] reject できる', s.reject('relation_mismatch'), true);
    eq('[wrong] phase は RELATION_REJECTED', s.phase, RelationPhase.RELATION_REJECTED);
    eq('[wrong] attemptCount が増える', s.attemptCount, 1);
    eq('[wrong] 再開できる(RELATION_SOLVINGへ)', s.beginSolving() && s.phase, RelationPhase.RELATION_SOLVING);
    eq('[wrong] 再開後もsubmitできる', s.selectSource(SLOT, 'T-S4-03', TABLES) && s.submit(), true);
  }

  // ================= correct submit → cleared → evidence =================
  {
    const s = fresh();
    s.beginSolving();
    s.selectSource(SLOT, 'T-S4-03', TABLES);
    s.submit();
    const r = evaluateRelation(task, s.answers);
    eq('[correct] evaluator が正解と判定', r.ok, true);
    eq('[correct] clear できる', s.clear(), true);
    eq('[correct] phase は RELATION_CLEARED', s.phase, RelationPhase.RELATION_CLEARED);
    eq('[correct] 自力なので INDEPENDENT', s.clearType, 'INDEPENDENT');
    eq('[correct] revealEvidence できる', s.revealEvidence(), true);
    eq('[correct] phase は EVIDENCE_REVEALED', s.phase, RelationPhase.EVIDENCE_REVEALED);
    eq('[correct] Evidence種別は RECONSTRUCTED_FACT', s.evidence.type, EvidenceType.RECONSTRUCTED_FACT);
    check('[correct] Evidence本文にR005が含まれる', /R005/.test(s.evidence.text), s.evidence.text);
    eq('[correct] clear後は選択を変更できない', s.selectSource(SLOT, 'T-S4-02', TABLES), false);
    eq('[correct] clear後のrequestHintは無効', s.requestHint(), null);
  }

  // ================= hint と assistanceLevel =================
  {
    const s = fresh();
    s.beginSolving();
    const h1 = s.requestHint();
    // 1段目は照合キーの名前を明かさず「対応を探せ」までに留める（段階性）
    check('[hint] 1段目は列名を特定せず対応関係へ誘導する', !/terminal_id/.test(h1) && /対応/.test(h1), h1);
    check('[hint] 1段目は答え(R005)を言わない', !/R005/.test(h1), h1);
    eq('[hint] assistanceLevel が1', s.assistanceLevel, 1);
    const h2 = s.requestHint();
    check('[hint] 2段目で照合キー(terminal_id)を示す', /terminal_id/.test(h2), h2);
    check('[hint] 2段目もR005を言わない', !/R005/.test(h2), h2);
    const h3 = s.requestHint();
    check('[hint] 最終段でもR005を言わない', !/R005/.test(h3), h3);
    eq('[hint] assistanceLevel は段数で止まる', s.assistanceLevel, task.hints.length);
    s.requestHint();
    eq('[hint] 上限を超えない', s.assistanceLevel, task.hints.length);
    s.selectSource(SLOT, 'T-S4-03', TABLES); s.submit(); s.clear();
    eq('[hint] ヒント使用時は ASSISTED', s.clearType, 'ASSISTED');
  }

  // ================= Definition / Canon整合 =================
  {
    eq('[def] interactionKind は RELATION_FILL', task.interactionKind, 'RELATION_FILL');
    eq('[def] 関係のsourceはTERMINAL_LOG', task.slots[0].relation.sourceTable, 'TERMINAL_LOG');
    eq('[def] 正解は R005', task.answer[SLOT], 'R005');
    check('[def] 問題文がE442の欠損復元を指示している', /E442/.test(task.prompt) && /resident_id/.test(task.prompt), task.prompt);
    check('[def] NORAの台詞が答えの導出手順を説明していない',
      !/T-S4-03/.test(task.evidence.nora) && !/TERMINAL_LOG/.test(task.evidence.nora), task.evidence.nora);
    check('[def] NORAがS2/S4の不一致を解説していない（後続調査の余地を残す）',
      !/S2/.test(task.evidence.nora) && !/矛盾/.test(task.evidence.nora), task.evidence.nora);

    // fixtureは TABLES を汚染しない（SQLエンジンの照会対象を変えない）
    check('[canon] EVAC_RECEPTION は TABLES に入っていない', !TABLES.EVAC_RECEPTION);
    check('[canon] TERMINAL_LOG は TABLES に入っていない', !TABLES.TERMINAL_LOG);

    // 既存人物へのID再割当をしていないこと
    const cache = TABLES.RESIDENT_CACHE;
    const idOf = name => (cache.rows.find(r => r[1] === name) || [])[0];
    eq('[canon] 羽鳥イオ は R004 のまま', idOf('羽鳥イオ'), 'R004');
    eq('[canon] 千葉ユノ は R005 のまま', idOf('千葉ユノ'), 'R005');
    eq('[canon] 七瀬セラ は R006 のまま', idOf('七瀬セラ'), 'R006');

    // fixtureが参照するIDは全てCanonに存在する
    const canonIds = cache.rows.map(r => r[0]);
    const used = referencedValues(task, /^R\d{3}$/);
    check('[canon] fixtureのresident_idは全てCanonに存在する',
      used.every(id => canonIds.includes(id)), used.join(','));
  }

  // ================= 表示用テーブル構築 =================
  {
    const tables = buildRelationTables(task, TABLES);
    eq('[tables] 3表を表示する', tables.length, 3);
    eq('[tables] 1つ目は正史のRESIDENT_CACHE', tables[0].name, 'RESIDENT_CACHE');
    eq('[tables] 正史表はfixtureが参照する3行に絞られる', tables[0].rows.length, 3);
    check('[tables] 正史表の行はTABLESと同一オブジェクト（複製していない）',
      tables[0].rows.every(r => TABLES.RESIDENT_CACHE.rows.includes(r)));
    check('[tables] 千葉ユノの行が S2 / MISSING のまま表示される',
      tables[0].rows.some(r => r[0] === 'R005' && r[2] === 'MISSING' && r[3] === 'S2'),
      JSON.stringify(tables[0].rows));
    eq('[tables] 2つ目は EVAC_RECEPTION', tables[1].name, 'EVAC_RECEPTION');
    eq('[tables] 3つ目は TERMINAL_LOG', tables[2].name, 'TERMINAL_LOG');

    const e442 = tables[1].rows.find(r => r[0] === 'E442');
    eq('[tables] E442のresident_idは欠損(null)', e442[1], null);
    eq('[tables] E442のterminal_idはT-S4-03', e442[2], 'T-S4-03');
    const t03 = tables[2].rows.find(r => r[0] === 'T-S4-03');
    eq('[tables] T-S4-03の認証住民はR005', t03[1], 'R005');
    eq('[tables] 時刻が一致している(23:09)', e442[3] === t03[2] && e442[3], '23:09');
  }

  // ================= 関係推論が一意に決まること（FE Learning Gate） =================
  {
    // E442 → terminal_id → TERMINAL_LOG → authenticated_resident が一意であること
    const rec = task.fixtureTables.find(t => t.name === 'EVAC_RECEPTION');
    const log = task.fixtureTables.find(t => t.name === 'TERMINAL_LOG');
    const e442 = rec.rows.find(r => r[0] === 'E442');
    const matches = log.rows.filter(r => r[0] === e442[2]);
    eq('[reasoning] E442のterminal_idに一致するTERMINAL_LOGは1件だけ', matches.length, 1);
    eq('[reasoning] その認証住民が正解と一致する', matches[0][1], task.answer[SLOT]);
    // 他の候補が同じ経路で導けないこと（正解が一意）
    const others = ['R004', 'R006'];
    check('[reasoning] 他候補はE442の端末では認証されていない',
      others.every(id => !matches.some(m => m[1] === id)), others.join(','));
  }

  console.log('');
  console.log(`FAIL_COUNT: ${failCount}`);
  process.exit(failCount === 0 ? 0 : 1);
})().catch(err => { console.error(err); process.exit(1); });
