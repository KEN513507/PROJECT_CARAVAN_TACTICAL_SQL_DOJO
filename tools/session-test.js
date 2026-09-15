// tools/session-test.js
// ChapterSession (js/chapter-session.js) の契約のみを検証する単体テスト。
// UIには一切触らない。
//
// このファイルは CommonJS のまま (package.json に "type": "module" は追加しない)。
// js/chapter-session.js は ESM (export構文) なので、require() では読み込めない。
// そのため動的 import() を data: URL 経由で行う。
// data: import は Node が package.json の "type" フィールドに関係なく常に ESM として
// 解釈するため、リポジトリの CommonJS 既定を変えずに ESM モジュールを読み込める。

const fs = require('fs');
const path = require('path');

let failCount = 0;

function pass(label){
  console.log(`PASS  ${label}`);
}

function fail(label, expected, actual){
  console.log(`FAIL  ${label}  期待:${JSON.stringify(expected)} 実際:${JSON.stringify(actual)}`);
  failCount++;
}

function assertEqual(label, actual, expected){
  if(actual === expected) pass(label);
  else fail(label, expected, actual);
}

async function loadChapterSession(){
  const srcPath = path.join(__dirname, '..', 'js', 'chapter-session.js');
  const src = fs.readFileSync(srcPath, 'utf8');
  const dataUrl = 'data:text/javascript;base64,' + Buffer.from(src, 'utf8').toString('base64');
  return import(dataUrl);
}

async function main(){
  const { ChapterSession, Phase } = await loadChapterSession();

  // ---- helpers ----
  function freshDrafting(){
    const s = new ChapterSession('CH1');
    s.addToken({ t: 'SELECT', k: 'clause' });
    return s;
  }
  function freshAwaitingPrediction(){
    const s = freshDrafting();
    s.submit();
    return s;
  }
  function freshExecuting(){
    const s = freshAwaitingPrediction();
    s.submitPrediction(3);
    return s;
  }
  function freshRevealed(){
    const s = freshExecuting();
    s.revealEvidence({ rows: [] });
    return s;
  }
  function freshCleared(hintCount = 0){
    const s = freshRevealed();
    for(let i = 0; i < hintCount; i++) s.requestHint();
    s.clear();
    return s;
  }

  // ================= 正常遷移 =================
  {
    const s = freshDrafting();
    assertEqual('[正常遷移] AWAITING_QUERY --addToken--> QUERY_DRAFTING', s.phase, Phase.QUERY_DRAFTING);
  }
  {
    const s = freshAwaitingPrediction();
    assertEqual('[正常遷移] QUERY_DRAFTING --submit--> AWAITING_PREDICTION', s.phase, Phase.AWAITING_PREDICTION);
  }
  {
    const s = freshExecuting();
    assertEqual('[正常遷移] AWAITING_PREDICTION --submitPrediction--> QUERY_EXECUTING', s.phase, Phase.QUERY_EXECUTING);
  }
  {
    const s = freshExecuting();
    s.reject('sql_mismatch');
    assertEqual('[正常遷移] QUERY_EXECUTING --reject--> QUERY_REJECTED', s.phase, Phase.QUERY_REJECTED);
  }
  {
    const s = freshExecuting();
    s.reject('sql_mismatch');
    s.addToken({ t: 'FROM', k: 'clause' });
    assertEqual('[正常遷移] QUERY_REJECTED --addToken--> QUERY_DRAFTING', s.phase, Phase.QUERY_DRAFTING);
  }
  {
    const s = freshExecuting();
    s.revealEvidence({ rows: [] });
    assertEqual('[正常遷移] QUERY_EXECUTING --revealEvidence--> EVIDENCE_REVEALED', s.phase, Phase.EVIDENCE_REVEALED);
  }
  {
    const s = freshRevealed();
    s.clear();
    assertEqual('[正常遷移] EVIDENCE_REVEALED --clear--> CHAPTER_CLEARED', s.phase, Phase.CHAPTER_CLEARED);
  }

  // ================= 不正遷移ガード =================
  {
    const s = new ChapterSession('CH1');
    const result = s.reject('x');
    assertEqual('[不正遷移ガード] AWAITING_QUERY.reject() は false を返す', result, false);
    assertEqual('[不正遷移ガード] AWAITING_QUERY.reject() 後も phase は AWAITING_QUERY', s.phase, Phase.AWAITING_QUERY);
  }
  {
    const s = new ChapterSession('CH1');
    const result = s.clear();
    assertEqual('[不正遷移ガード] AWAITING_QUERY.clear() は false を返す', result, false);
    assertEqual('[不正遷移ガード] AWAITING_QUERY.clear() 後も phase は AWAITING_QUERY', s.phase, Phase.AWAITING_QUERY);
  }
  {
    const s = freshDrafting();
    const result = s.revealEvidence({ rows: [] });
    assertEqual('[不正遷移ガード] QUERY_DRAFTING.revealEvidence() は false を返す', result, false);
  }
  {
    const s = freshDrafting();
    const result = s.submitPrediction(3);
    assertEqual('[不正遷移ガード] QUERY_DRAFTING.submitPrediction() は false を返す', result, false);
  }
  {
    const s = freshCleared();
    const result = s.addToken({ t: 'SELECT', k: 'clause' });
    assertEqual('[不正遷移ガード] CHAPTER_CLEARED.addToken() は false を返す', result, false);
  }
  {
    const s = freshCleared();
    const result = s.requestHint();
    assertEqual('[不正遷移ガード] CHAPTER_CLEARED.requestHint() は false を返す', result, false);
  }
  {
    const s = freshRevealed();
    const result = s.reject('x');
    assertEqual('[不正遷移ガード] EVIDENCE_REVEALED.reject() は false を返す', result, false);
  }

  // ================= カウンタ分離 =================
  {
    const s = freshExecuting();
    assertEqual('[カウンタ分離] submitPrediction で executionCount++', s.executionCount, 1);
  }
  {
    const s = freshExecuting();
    s.reject('x');
    assertEqual('[カウンタ分離] reject で rejectionCount++', s.rejectionCount, 1);
  }
  {
    const s = freshCleared();
    assertEqual('[カウンタ分離] 成功経路では reject は呼ばれない (rejectionCount === 0)', s.rejectionCount, 0);
  }

  // ================= Clear タイプ判定 =================
  {
    const s = freshCleared(0);
    assertEqual('[Clearタイプ判定] assistanceLevel 0 → INDEPENDENT', s.clearType, 'INDEPENDENT');
  }
  [1, 2, 3].forEach(n => {
    const s = freshCleared(n);
    assertEqual(`[Clearタイプ判定] assistanceLevel ${n} → ASSISTED`, s.clearType, 'ASSISTED');
  });
  {
    const s = freshCleared(4);
    assertEqual('[Clearタイプ判定] assistanceLevel 4 → PRACTICE', s.clearType, 'PRACTICE');
  }

  // ================= requestHint の上限 =================
  {
    const s = new ChapterSession('CH1');
    const results = [];
    for(let i = 0; i < 6; i++) results.push(s.requestHint());
    assertEqual('[requestHint上限] 5回目の requestHint() は false', results[4], false);
    assertEqual('[requestHint上限] 6回目の requestHint() も false', results[5], false);
    assertEqual('[requestHint上限] assistanceLevel は 4 を超えない', s.assistanceLevel, 4);
  }

  console.log('');
  console.log(`FAIL_COUNT: ${failCount}`);
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
