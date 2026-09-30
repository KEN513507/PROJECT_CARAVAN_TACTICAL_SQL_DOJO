// tools/mission-gate.mjs
// 全学習ミッションの機械検証。60問規模になると手作業では守れないため、
// 「1問ごとに必ず満たすべき条件」をここで固定する。
//   node tools/mission-gate.mjs

import { LEARNING_STAGES as stages, LEARNING_TABLES as TABLES } from '../js/campaign.js';
import { executeSelect, resultsMatch } from '../js/sql-engine.js';
import { queryTokens, queryText } from '../js/onboarding.js';

let fail = 0;
const check = (label, ok, detail) => {
  if(!ok){ fail++; console.log(`FAIL  ${label}${detail ? '  ' + detail : ''}`); }
};

const ids = new Set();
for(const st of stages){
  const tag = st.id;

  // ---- 一意性と必須項目 ----
  check(`${tag} idが重複しない`, !ids.has(st.id)); ids.add(st.id);
  check(`${tag} 指示文がある`, !!st.prompt && st.prompt.length >= 6, st.prompt);
  check(`${tag} 案内文がある`, !!st.guide && st.guide.length >= 6, st.guide);
  check(`${tag} 習得概念がある`, !!st.concept, st.concept);
  check(`${tag} 正解SQLがある`, Array.isArray(st.answers) && st.answers.length === 1);
  // 表が取れていないと、画面に表が出ないまま起動して落ちる（実際に起きた）
  check(`${tag} 参照する表が1つ以上ある`, st.tables.length >= 1, JSON.stringify(st.tables));
  check(`${tag} 参照する表が実在する`, st.tables.every(n => !!TABLES[n]), st.tables.join(','));

  // ---- 正解SQLが実際に動き、宣言された期待結果と一致する ----
  let r = null, err = null;
  try { r = executeSelect(st.answers[0], TABLES); } catch(e){ err = e.message; }
  check(`${tag} 正解SQLが実行できる`, !!r, err);
  if(!r) continue;
  check(`${tag} 期待結果と実行結果が一致する`,
    resultsMatch(r, st.resultSet, { ordered: st.ordered }),
    `sql=${st.answers[0]}`);

  // ---- 結果が空でない（解いても何も出ない問題を作らない） ----
  check(`${tag} 結果が1行以上ある`, r.rows.length > 0);

  // ---- 結果が元の表そのものでない（表を眺めるだけの問題にしない） ----
  const src = TABLES[st.tables[0]];
  if(src){
    const same = r.cols.length === src.cols.length && r.rows.length === src.rows.length
      && JSON.stringify(r.rows.map(x => x.map(String))) === JSON.stringify(src.rows.map(x => x.map(String)));
    check(`${tag} 結果が元の表と同一でない`, !same, `${st.tables[0]} と同じ内容`);
  }

  // ---- トークンパッドだけで正解を組み立てられる ----
  const pad = new Set(st.tokens.map(t => t.t));
  const need = queryTokens(st.answers[0]).map(t => t.t).filter(t => t !== ',');
  // トークン化が正解SQLを復元できること。
  // 例: MAX(quantity) が MAX と quantity に割れていると、押しても正解を作れない。
  const flat = x => x.replace(/\s+/g, '');
  check(`${tag} トークンから正解SQLを復元できる`,
    flat(queryText(queryTokens(st.answers[0]))) === flat(st.answers[0]),
    queryText(queryTokens(st.answers[0])));
  const missing = [...new Set(need)].filter(t => !pad.has(t));
  check(`${tag} 正解に必要な語がトークンに揃っている`, missing.length === 0, missing.join(' '));

  // ---- 画面に入る量 ----
  check(`${tag} トークンが多すぎない(<=20)`, st.tokens.length <= 20, `${st.tokens.length}個`);
  check(`${tag} 結果の行が多すぎない(<=10)`, r.rows.length <= 10, `${r.rows.length}行`);
  check(`${tag} 参照する表が2つ以下`, st.tables.length <= 2, st.tables.join(','));

  // ---- 並べ替えの章は、順序が実際に変わること ----
  if(st.ordered){
    const unordered = executeSelect(st.answers[0].replace(/\s+ORDER BY[\s\S]*$/i, ''), TABLES);
    check(`${tag} 並べ替えで順序が実際に変わる`,
      JSON.stringify(unordered.rows) !== JSON.stringify(r.rows));
  }
}

// ---- 概念の重複（同じことを続けて教えていないか） ----
for(let i = 1; i < stages.length; i++){
  check(`${stages[i].id} 直前と同じ概念ではない`,
    stages[i].concept !== stages[i - 1].concept, stages[i].concept);
}

console.log(`\n検証したミッション: ${stages.length}`);
console.log(`FAIL_COUNT: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
