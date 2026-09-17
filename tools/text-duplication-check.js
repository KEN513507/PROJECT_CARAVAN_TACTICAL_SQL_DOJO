// tools/text-duplication-check.js
// DUPLICATE_TEXT_GATE
// 同一または実質同一の日本語説明が MISSION / NOTE / HINT の2箇所以上に存在したらFAIL。
//
// 責務:
//   MISSION (prompt)      = WHAT    何を特定・出力するのか
//   NOTE    (note/context)= CONTEXT どの表に何があるのか（世界内・データ上の説明）
//   HINT    (hint1/hint2) = HOW     解法支援（SQL構文はここだけ）
//
// 実行: node tools/text-duplication-check.js

const { pathToFileURL } = require('url');
const path = require('path');

const SIM_THRESHOLD = 0.60;   // 文字bigramのJaccard類似度がこれ以上なら「実質同一」

let failCount = 0;
function check(label, ok, detail){
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? '  ' + detail : ''}`);
  if(!ok) failCount++;
}

// 記号・空白・かぎ括弧を落として比較する
function norm(s){
  return String(s || '')
    .replace(/[\s　]/g, '')
    .replace(/[「」『』（）()、。,.・:：;；──—\-─-╿]/g, '')
    .toLowerCase();
}

function bigrams(s){
  const out = new Set();
  for(let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

function similarity(a, b){
  const A = bigrams(norm(a)), B = bigrams(norm(b));
  if(!A.size || !B.size) return 0;
  let inter = 0;
  for(const g of A) if(B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}

// 片方がもう片方をほぼ丸ごと含む場合も「実質同一」とみなす
function containment(a, b){
  const x = norm(a), y = norm(b);
  if(!x || !y) return 0;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if(short.length < 12) return 0;          // 短すぎるラベルは対象外
  return long.includes(short) ? 1 : 0;
}

(async () => {
  const data = await import(pathToFileURL(path.resolve(__dirname, '../js/data.js')).href);
  const rel = await import(pathToFileURL(path.resolve(__dirname, '../js/relation-task.js')).href);
  const { STAGES } = data;

  // 各章の MISSION / NOTE / HINT を責務別に集める
  const chapters = STAGES.map((st, i) => {
    if(st.interactionKind === 'RELATION_FILL'){
      const task = rel.getRelationTask(st.relationTaskId);
      return {
        name: `CH${i + 1}`,
        kind: 'RELATION',
        mission: [['prompt', task.prompt]],
        note: [['storyContext', task.storyContext]],
        hint: (task.hints || []).map((h, k) => [`hints[${k}]`, h])
      };
    }
    return {
      name: `CH${i + 1}`,
      kind: 'QUERY',
      mission: [['prompt', st.prompt]],
      note: [['note', st.note]],
      hint: [['hint1', st.hint1], ['hint2', st.hint2]].filter(x => x[1])
    };
  });

  for(const ch of chapters){
    // ---- 各責務が存在すること ----
    check(`[${ch.name}] MISSION(WHAT)が存在する`, !!(ch.mission[0] && ch.mission[0][1]));
    check(`[${ch.name}] NOTE(CONTEXT)が存在する`, !!(ch.note[0] && ch.note[0][1]),
      ch.note[0] ? String(ch.note[0][1]).slice(0, 30) : '(none)');
    check(`[${ch.name}] HINT(HOW)が存在する`, ch.hint.length > 0, `${ch.hint.length}件`);

    // ---- 責務をまたぐ重複がないこと ----
    const groups = [['MISSION', ch.mission], ['NOTE', ch.note], ['HINT', ch.hint]];
    for(let i = 0; i < groups.length; i++){
      for(let j = i + 1; j < groups.length; j++){
        const [gaName, ga] = groups[i], [gbName, gb] = groups[j];
        for(const [ka, va] of ga){
          for(const [kb, vb] of gb){
            if(!va || !vb) continue;
            const sim = similarity(va, vb);
            const cont = containment(va, vb);
            const dup = sim >= SIM_THRESHOLD || cont === 1;
            check(`[${ch.name}] ${gaName}(${ka}) と ${gbName}(${kb}) が実質同一でない`,
              !dup, dup ? `sim=${sim.toFixed(2)} contained=${cont === 1}` : `sim=${sim.toFixed(2)}`);
          }
        }
      }
    }
  }

  // ---- MISSIONにSQL構文(HOW)を書かない ----
  // JOIN手順・別名指定・集約関数の構文はHINT側の責務。
  const HOW_IN_MISSION = [
    /INNER\s+JOIN/i, /\bJOIN\b/i, /\bON\b\s+\w+\./i, /別名\s*\(?AS\)?\s*付き/, /をキーに.*結合/,
    /GROUP\s+BY/i, /HAVING/i, /\bWHERE\b/i, /SUM\s*\(/i, /COUNT\s*\(/i, /\bAS\b\s+\w+/
  ];
  for(const ch of chapters){
    const m = ch.mission[0][1] || '';
    const hits = HOW_IN_MISSION.filter(re => re.test(m)).map(re => re.source);
    check(`[${ch.name}] MISSIONにSQL構文(HOW)を書かない`, hits.length === 0,
      hits.length ? `${hits.join(' / ')} :: ${m}` : '');
  }

  // ---- HINTにはHOWがあること（解法支援として機能しているか） ----
  const HOW_TOKENS = /WHERE|AND|GROUP\s+BY|HAVING|JOIN|AS|SUM|COUNT|照合|選ん|比較|絞/i;
  for(const ch of chapters){
    const joined = ch.hint.map(h => h[1]).join(' ');
    check(`[${ch.name}] HINTがHOWを示している`, HOW_TOKENS.test(joined), joined.slice(0, 44));
  }

  // ---- NOTEが解法(HOW)を先に明かしていないこと ----
  const HOW_IN_NOTE = [/INNER\s+JOIN/i, /GROUP\s+BY/i, /HAVING/i, /でJOIN/, /をJOIN/];
  for(const ch of chapters){
    const n = ch.note[0] ? (ch.note[0][1] || '') : '';
    const hits = HOW_IN_NOTE.filter(re => re.test(n)).map(re => re.source);
    check(`[${ch.name}] NOTEが解法(HOW)を先に明かさない`, hits.length === 0,
      hits.length ? `${hits.join(' / ')} :: ${n}` : '');
  }

  // ---- 参考: 章をまたいだ使い回しがないか（同じNOTEの貼り回し検出） ----
  for(let i = 0; i < chapters.length; i++){
    for(let j = i + 1; j < chapters.length; j++){
      const a = chapters[i].note[0] ? chapters[i].note[0][1] : '';
      const b = chapters[j].note[0] ? chapters[j].note[0][1] : '';
      if(!a || !b) continue;
      const sim = similarity(a, b);
      check(`[${chapters[i].name}/${chapters[j].name}] NOTEが章間で使い回されていない`,
        sim < SIM_THRESHOLD, `sim=${sim.toFixed(2)}`);
    }
  }

  console.log('');
  console.log(`FAIL_COUNT: ${failCount}`);
  process.exit(failCount === 0 ? 0 : 1);
})().catch(err => { console.error(err); process.exit(1); });
