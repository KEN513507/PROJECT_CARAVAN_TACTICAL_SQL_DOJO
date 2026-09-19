// tools/campaign-index.mjs
// CANONICAL CAMPAIGN のindex変換。
// campaign は M01〜M12（学習）+ CHAPTER 1〜6（本編）の一続き。
// ゲートは「本編の章番号」で書き、ここで campaign index へ変換する。
//
//   storyStage(0) === 12  → CHAPTER 1
//   storyStage(5) === 17  → CHAPTER 6

import { ONBOARDING_STAGES } from '../js/onboarding.js';
import { STAGES as STORY_STAGES } from '../js/data.js';

export const STORY_OFFSET = ONBOARDING_STAGES.length;
export const STORY_COUNT = STORY_STAGES.length;
export const CAMPAIGN_LENGTH = STORY_OFFSET + STORY_COUNT;

// 本編の章index(0始まり) → campaign index
export const storyStage = i => STORY_OFFSET + i;

// 本編の到達状況から campaign 全体の cleared 配列を作る。
// 学習章(M01〜M12)は全て完了済みとして扱う（本編を検証するための前提条件）。
export function campaignProgress({ story = 0, storyCleared = [], xp = 0, reconstructedFacts } = {}){
  const cleared = new Array(CAMPAIGN_LENGTH).fill(false);
  for(let i = 0; i < STORY_OFFSET; i++) cleared[i] = true;
  for(let i = 0; i < STORY_COUNT; i++) cleared[STORY_OFFSET + i] = !!storyCleared[i];
  const progress = {
    stage: storyStage(story), xp, cleared,
    clearTypes: new Array(CAMPAIGN_LENGTH).fill(null)
  };
  if(reconstructedFacts) progress.reconstructedFacts = reconstructedFacts;
  return progress;
}

// 学習章(M01〜M12)を完了済みにする専用ストレージの中身。
// campaign 進捗だけでは restoreLearning() が学習章へ引き戻すため、両方を積む。
export function learningCompletedPayload(){
  const completed = {};
  for(const st of ONBOARDING_STAGES){
    completed[st.id] = { tokens: tokensOf(st.answers[0]), assistance: 0 };
  }
  return { version: 2, stage: STORY_OFFSET, drafts: {}, completed };
}

// onboarding.js の queryTokens と同じ分割規則（テスト側で import せずに済むよう最小複製）
function tokensOf(sql){
  return (sql.match(/'(?:''|[^'])*'|(?:COUNT|SUM)\s*\([^)]*\)|GROUP BY|ORDER BY|[A-Za-z_][A-Za-z_0-9]*|\d+|<>|<=|>=|[=<>*,;□]/gi) || [])
    .filter(t => t !== ';')
    .map(t => ({ t, k: kindOf(t) }));
}
function kindOf(t){
  if(t === ',') return 'punct';
  if(/^(SELECT|FROM|WHERE|AND|OR|ORDER BY|GROUP BY|ASC|DESC|AS)$/i.test(t)) return 'clause';
  if(/^(COUNT|SUM)\(/i.test(t)) return 'func';
  if(/^(STOCK|REQUESTS)$/.test(t)) return 'table';
  if(/^(=|<|>|<=|>=|<>)$/.test(t)) return 'op';
  if(/^'|^\d/.test(t)) return 'lit';
  return 'col';
}
