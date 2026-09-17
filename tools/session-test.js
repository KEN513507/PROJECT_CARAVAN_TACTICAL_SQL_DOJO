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
    const s = freshAwaitingPrediction();
    const ok = s.cancelPrediction();
    assertEqual('[正常遷移] AWAITING_PREDICTION --cancelPrediction--> QUERY_DRAFTING (戻り値)', ok, true);
    assertEqual('[正常遷移] AWAITING_PREDICTION --cancelPrediction--> QUERY_DRAFTING (phase)', s.phase, Phase.QUERY_DRAFTING);
  }
  {
    const s = freshAwaitingPrediction();
    const tokenCountBefore = s.draft.tokens.length;
    s.cancelPrediction();
    assertEqual('[正常遷移] cancelPrediction後もdraftは保持される', s.draft.tokens.length, tokenCountBefore);
  }
  {
    const s = freshDrafting();
    const ok = s.cancelPrediction();
    assertEqual('[不正遷移ガード] QUERY_DRAFTING.cancelPrediction() は false を返す', ok, false);
  }
  {
    const s = freshExecuting();
    const ok = s.cancelPrediction();
    assertEqual('[不正遷移ガード] QUERY_EXECUTING.cancelPrediction() は false を返す', ok, false);
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

  // ================= P0: CH1 assistanceLevel 二重管理の解消 =================
  // 手動Hintの段階 (概念/構造/穴あき/完成) を模した requestHint() 連打での Clear タイプ判定。
  {
    const s = freshRevealed();
    s.requestHint(); // 概念ヒント (level 1)
    s.clear();
    assertEqual('[P0] 概念ヒント使用(requestHint x1) → ASSISTED', s.clearType, 'ASSISTED');
  }
  {
    const s = freshRevealed();
    s.requestHint(); s.requestHint(); // 構造ヒント (level 2)
    s.clear();
    assertEqual('[P0] 構造ヒント使用(requestHint x2) → ASSISTED', s.clearType, 'ASSISTED');
  }
  {
    const s = freshRevealed();
    s.requestHint(); s.requestHint(); s.requestHint(); // 穴あきSQL (level 3)
    s.clear();
    assertEqual('[P0] 穴あきSQL使用(requestHint x3) → ASSISTED', s.clearType, 'ASSISTED');
  }
  {
    const s = freshRevealed();
    s.requestHint(); s.requestHint(); s.requestHint(); s.requestHint(); // 完成SQL (level 4)
    s.clear();
    assertEqual('[P0] 完成SQL使用(requestHint x4) → PRACTICE', s.clearType, 'PRACTICE');
  }

  // markPartialAssistanceShown(): 自動段階Hintの「穴あき/構造支援」相当。ASSISTED帯に留まり続ける。
  {
    const s = freshRevealed();
    s.markPartialAssistanceShown();
    s.clear();
    assertEqual('[P0] markPartialAssistanceShown() → clear() → ASSISTED', s.clearType, 'ASSISTED');
  }
  {
    const s = freshRevealed();
    for(let i = 0; i < 10; i++) s.markPartialAssistanceShown();
    assertEqual('[P0] markPartialAssistanceShown() を何度呼んでも assistanceLevel は4に到達しない', s.assistanceLevel < 4, true);
  }

  // markFullAnswerShown(): 完成SQL提示の専用メソッド。PRACTICEを直接確定させる。
  {
    const s = freshRevealed();
    s.markFullAnswerShown();
    s.clear();
    assertEqual('[P0] markFullAnswerShown() → clear() → PRACTICE', s.clearType, 'PRACTICE');
  }
  {
    const s = freshRevealed();
    s.markFullAnswerShown();
    const before = s.assistanceLevel;
    s.markFullAnswerShown(); // 2回目はno-op
    assertEqual('[P0] markFullAnswerShown() は既に4ならno-op', s.assistanceLevel, before);
  }

  // markFullAnswerShown() → Retry相当(clearDraft()でdraftのみ空にする) → assistanceLevelが4のまま
  // (TIMEOUTやQUERY_REJECTEDからのRetryは QUERY_DRAFTING/QUERY_REJECTED/AWAITING_QUERY から行われ、
  //  それらはいずれも clearDraft() でガードされないため、draftだけがリセットされる状況を再現する)
  {
    const s = freshDrafting();
    s.markFullAnswerShown();
    const cleared = s.clearDraft();
    assertEqual('[P0] Retry(clearDraft)は成功する', cleared, true);
    assertEqual('[P0] Retry後もassistanceLevelは4のまま(0へ戻らない)', s.assistanceLevel, 4);
    assertEqual('[P0] Retry後はAWAITING_QUERYに戻る', s.phase, Phase.AWAITING_QUERY);
  }

  // ================= resumeDrafting (拒否後のUndo修正→再提出) =================
  {
    const s = freshExecuting();
    s.reject('sql_mismatch');
    const ok = s.resumeDrafting();
    assertEqual('[resumeDrafting] QUERY_REJECTED(draftあり) → true', ok, true);
    assertEqual('[resumeDrafting] QUERY_REJECTED → QUERY_DRAFTING', s.phase, Phase.QUERY_DRAFTING);
    assertEqual('[resumeDrafting] 再開後は submit() できる', s.submit(), true);
  }
  {
    const s = freshDrafting();
    assertEqual('[resumeDrafting] QUERY_DRAFTING では false', s.resumeDrafting(), false);
  }
  {
    const s = freshCleared();
    assertEqual('[resumeDrafting] CHAPTER_CLEARED では false', s.resumeDrafting(), false);
  }

  // ================= CHAPTER_CLEARED 後は支援状態を変更できない =================
  {
    const s = freshCleared(0);
    const levelBefore = s.assistanceLevel;
    const typeBefore = s.clearType;
    assertEqual('[P0] CHAPTER_CLEARED後のrequestHint()はfalse', s.requestHint(), false);
    assertEqual('[P0] CHAPTER_CLEARED後のmarkPartialAssistanceShown()はfalse', s.markPartialAssistanceShown(), false);
    assertEqual('[P0] CHAPTER_CLEARED後のmarkFullAnswerShown()はfalse', s.markFullAnswerShown(), false);
    assertEqual('[P0] CHAPTER_CLEARED後もassistanceLevelは不変', s.assistanceLevel, levelBefore);
    assertEqual('[P0] CHAPTER_CLEARED後もclearTypeは不変', s.clearType, typeBefore);
  }

  console.log('');
  console.log(`FAIL_COUNT: ${failCount}`);
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
