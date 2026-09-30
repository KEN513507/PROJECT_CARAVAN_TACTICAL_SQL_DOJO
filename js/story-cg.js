// js/story-cg.js
// ============================================================
// STORY CG CONTRACT (SSOT)
// ------------------------------------------------------------
// イベントCG（1枚絵）の台帳と、出してよい条件。
//
// 如月アヤは CH1〜CH3 では姿を見せない。設計書 docs/NARRATIVE_SPINE.md の
// 「Aya Reveal」を守るため、解禁は CH4 の INNER JOIN 成功後に限る。
//
// ここで言う「見せない」は描画だけでなく読み込みも含む。
//   - CG の URL は CSS に一切書かない（背景指定があると先読みされうる）
//   - 未解禁の CG ブロックは DOM を作らない。src も background-image も出さない
//   - 判定は js/ui.js の showStoryOverlay が必ず通す
//
// 検査は tools/aya-reveal-check.mjs が行う。
// ============================================================

// CGの台帳。id → { file, unlock }
// unlock: 'always' はいつでも可。'ch4' は CH4 クリア後のみ。
export const STORY_CG = Object.freeze({
  'aya-appeal':   { file: 'assets/characters/aya-cg-appeal.webp',   unlock: 'ch4',
                    alt: '如月アヤ。こちらへ手を差し伸べている' },
  'aya-defiance': { file: 'assets/characters/aya-cg-defiance.webp', unlock: 'ch4',
                    alt: '如月アヤ。拳を握り、正面を見据えている' },
  'aya-strain':   { file: 'assets/characters/aya-cg-strain.webp',   unlock: 'ch4',
                    alt: '如月アヤ。頭を抱えて座り込んでいる' },
  'aya-withdraw': { file: 'assets/characters/aya-cg-withdraw.webp', unlock: 'ch4',
                    alt: '如月アヤ。膝を抱え、目を閉じている' }
});

// 本編の章index(0始まり)。CH4 = 3。
export const AYA_UNLOCK_CHAPTER = 3;

// そのCGを今出してよいか。unlocked は「CH4をクリア済みか」。
export function cgAllowed(id, unlocked){
  const cg = STORY_CG[id];
  if(!cg) return false;
  return cg.unlock === 'always' || !!unlocked;
}
