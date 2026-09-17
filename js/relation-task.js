// js/relation-task.js
// NEON RELAY ― RELATION TASK (Q1 Vertical Slice)
//
// SQL Query Task とは別のInteraction。ただし別モードではない。
// 主人公が2043年のカナタで行っている「同期障害で破損した都市記録の復元」作業そのもの。
//
// 責務分離（1ファイル内・class増殖はしない）:
//   RELATION_TASKS        … Definition（問題データ / mission-local fixture）
//   RelationTaskSession   … 回答状態とphase（Presentationを知らない）
//   evaluateRelation      … 正誤判定のみ（DOM非依存）
//
// fixtureは js/data.js の TABLES へ入れない。
// TABLES はSQLエンジンの照会対象であり、正史データの面を変えないため。

export const RelationPhase = Object.freeze({
  STORY_CONTEXT:     'STORY_CONTEXT',
  RELATION_SOLVING:  'RELATION_SOLVING',
  RELATION_SUBMITTED:'RELATION_SUBMITTED',
  RELATION_REJECTED: 'RELATION_REJECTED',
  RELATION_CLEARED:  'RELATION_CLEARED',
  EVIDENCE_REVEALED: 'EVIDENCE_REVEALED'
});

// 復元された事実は RAW_FACT / DERIVED_FACT と区別する。
export const EvidenceType = Object.freeze({
  RECONSTRUCTED_FACT: 'RECONSTRUCTED_FACT'
});

export const RELATION_TASKS = {
  EVAC_RECEPTION_RECOVERY_01: {
    id: 'EVAC_RECEPTION_RECOVERY_01',
    title: '欠損した住民ID',
    level: 'CHAPTER 5 / RECOVERY 1 : 記録復元 ─ 欠損した住民ID',
    chapterTitle: 'CHAPTER 5　欠損した住民ID',
    skill: 'Relational reconstruction (表間の対応関係)',
    brief: 'E442の欠けたresident_idを復元する',

    // Story上の作業指示。NORAは答えの導出手順を先に説明しない。
    storyContext: '同期喪失の直後、第4セクター避難受付端末から回収された記録に欠損がある。受付時刻と端末番号は残っている。',
    prompt: 'EVAC_RECEPTION の E442 で欠損している resident_id を、関連する記録から復元してください。',

    // ---- mission-local fixture（新規Story Fact） ----
    // 既存人物のIDはCanonのまま使う（R004/R005/R006）。IDの再割当はしない。
    fixtureTables: [
      {
        name: 'EVAC_RECEPTION',
        label: 'EVAC_RECEPTION 表（回収された受付記録）',
        cols: ['reception_id', 'resident_id', 'terminal_id', 'received_at'],
        keys: ['reception_id'],
        rows: [
          ['E441', 'R004', 'T-S4-02', '23:08'],
          ['E442', null,   'T-S4-03', '23:09'],
          ['E443', 'R006', 'T-S4-01', '23:10']
        ]
      },
      {
        name: 'TERMINAL_LOG',
        label: 'TERMINAL_LOG 表（端末の認証記録）',
        cols: ['terminal_id', 'authenticated_resident', 'authenticated_at'],
        keys: ['terminal_id'],
        rows: [
          ['T-S4-02', 'R004', '23:08'],
          ['T-S4-03', 'R005', '23:09'],
          ['T-S4-01', 'R006', '23:10']
        ]
      }
    ],

    // 正史テーブルから参照する（複製しない）。表示行は fixture から参照されているIDだけに絞る。
    canonTableRef: { name: 'RESIDENT_CACHE', label: 'RESIDENT_CACHE 表（住民キャッシュ）', filterCol: 'resident_id' },

    interactionKind: 'RELATION_FILL',
    slots: [{
      id: 'resident_id_missing',
      type: 'RESIDENT_ID',
      label: 'resident_id',
      // 表内の欠損セルへ同期表示するための位置
      target: { table: 'EVAC_RECEPTION', rowKey: 'E442', col: 'resident_id' },
      // 関係の定義。プレイヤーはこの照合キーを使って source 側の行を自分で選ぶ。
      // 候補値そのものを選ばせない（RTP §5 の弱いRelation Taskに退化させない）。
      relation: {
        sourceTable: 'TERMINAL_LOG',
        sourceRowKey: 'terminal_id',
        valueCol: 'authenticated_resident',
        keys: [
          { targetCol: 'terminal_id', sourceCol: 'terminal_id' },
          { targetCol: 'received_at', sourceCol: 'authenticated_at' }
        ]
      }
    }],
    answer: { resident_id_missing: 'R005' },

    // 段階ヒント。答えそのものは最後まで言わない（既存Hint policyに合わせる）。
    hints: [
      'E442 のどの列が、別の表と対応しているかを確認してください。',
      'TERMINAL_LOG は端末ごとに、認証された住民と時刻を記録しています。E442 と同じ terminal_id の行を選んでください。',
      'E442 の terminal_id は T-S4-03、受付時刻は 23:09 です。TERMINAL_LOG で同じ端末・同じ時刻の行を選ぶと、認証された住民が分かります。'
    ],

    // 正解後のEvidence。過剰演出はしない。
    evidence: {
      type: EvidenceType.RECONSTRUCTED_FACT,
      text: 'E442の受付記録はR005として復元された。',
      // NORAはここでS2/S4の不一致を解説しない（プレイヤーが後で気づく余地を残す）。
      nora: '復元しました。受付記録の欠損は埋まりました。'
    }
  }
};

export function getRelationTask(id){
  const task = RELATION_TASKS[id];
  if(!task) throw new Error(`unknown relation task: ${id}`);
  return task;
}

// fixture内に現れる値の集合（正史表の表示行を絞るために使う）
export function referencedValues(task, pattern){
  const found = new Set();
  task.fixtureTables.forEach(t => t.rows.forEach(r => r.forEach(v => {
    if(typeof v === 'string' && pattern.test(v)) found.add(v);
  })));
  return [...found];
}

// 表示用の表データを組み立てる。canon表は TABLES から読み、複製しない。
export function buildRelationTables(task, canonTables){
  const out = [];
  if(task.canonTableRef){
    const ref = task.canonTableRef;
    const src = canonTables[ref.name];
    if(src){
      const idx = src.cols.indexOf(ref.filterCol);
      const ids = referencedValues(task, /^R\d{3}$/);
      const rows = src.rows.filter(r => ids.includes(r[idx]));
      out.push({ name: ref.name, label: ref.label, cols: src.cols, keys: src.keys || [], rows, canon: true });
    }
  }
  for(const t of task.fixtureTables){
    out.push({ name: t.name, label: t.label, cols: t.cols, keys: t.keys || [], rows: t.rows, canon: false });
  }
  return out;
}

// ---- 表アクセスの小さなヘルパ（fixture / canon 双方に使う） ----
function findTable(task, canonTables, name){
  const fx = task.fixtureTables.find(t => t.name === name);
  if(fx) return fx;
  const ref = task.canonTableRef;
  if(ref && ref.name === name && canonTables && canonTables[name]){
    const src = canonTables[name];
    return { name, cols: src.cols, keys: src.keys || [], rows: src.rows };
  }
  return null;
}

function rowByKey(table, keyCol, keyValue){
  const i = table.cols.indexOf(keyCol);
  return table.rows.find(r => r[i] === keyValue) || null;
}

function cell(table, row, col){
  const i = table.cols.indexOf(col);
  return i === -1 ? undefined : row[i];
}

// 選んだ source 行が、target レコードに本当に対応しているかを照合キーごとに判定する。
// 「候補から答えを当てる」のではなく「関係が成立しているか」を見えるようにするための関数。
export function evaluateRelationMatch(task, slot, sourceRowKey, canonTables){
  const rel = slot.relation;
  const targetTable = findTable(task, canonTables, rel ? slot.target.table : null);
  const sourceTable = findTable(task, canonTables, rel.sourceTable);
  if(!targetTable || !sourceTable) throw new Error('relation tables not found');

  const targetRow = rowByKey(targetTable, targetTable.cols[0], slot.target.rowKey);
  const sourceRow = rowByKey(sourceTable, rel.sourceRowKey, sourceRowKey);
  if(!targetRow || !sourceRow) return null;

  const keys = rel.keys.map(k => {
    const targetValue = cell(targetTable, targetRow, k.targetCol);
    const sourceValue = cell(sourceTable, sourceRow, k.sourceCol);
    return { targetCol: k.targetCol, sourceCol: k.sourceCol, targetValue, sourceValue, match: targetValue === sourceValue };
  });

  return {
    sourceRowKey,
    keys,
    allMatch: keys.every(k => k.match),
    restoredValue: cell(sourceTable, sourceRow, rel.valueCol),
    valueCol: rel.valueCol
  };
}

export class RelationTaskSession {
  constructor(task){
    this.task = task;
    this.phase = RelationPhase.STORY_CONTEXT;

    // Domain状態（Presentation専用状態と混同しない）
    this.answers = {};          // slotId -> 復元値（source行から導出された値）
    this.sources = {};          // slotId -> 選択した source 行のキー
    this.matches = {};          // slotId -> 照合結果（keyごとのMATCH/MISMATCH）
    this.attemptCount = 0;
    this.assistanceLevel = 0;   // 0: 自力 / 1..: ヒント使用
    this.clearType = null;      // INDEPENDENT | ASSISTED
    this.evidence = null;

    this._listeners = [];
  }

  on(event, handler){
    this._listeners.push({ event, handler });
    return () => { this._listeners = this._listeners.filter(l => l.handler !== handler); };
  }
  _emit(event, payload){
    for(const l of this._listeners){
      if(l.event === event){
        try { l.handler(payload); } catch(e){ console.error('RelationTaskSession listener error:', e); }
      }
    }
  }
  _transition(next){
    const prev = this.phase;
    if(prev === next) return;
    this.phase = next;
    this._emit('PhaseChanged', { from: prev, to: next });
  }

  // Story導入を終えて作業開始
  beginSolving(){
    if(this.phase !== RelationPhase.STORY_CONTEXT &&
       this.phase !== RelationPhase.RELATION_REJECTED) return false;
    this._transition(RelationPhase.RELATION_SOLVING);
    return true;
  }

  // プレイヤーが source 側の行を選ぶ。復元値は「選んだ行から導出」されるのであって、
  // 候補リストから選ぶのではない。照合結果(MATCH/MISMATCH)も併せて保持する。
  selectSource(slotId, sourceRowKey, canonTables){
    if(this.phase === RelationPhase.RELATION_CLEARED ||
       this.phase === RelationPhase.EVIDENCE_REVEALED) return false;
    const slot = this.task.slots.find(s => s.id === slotId);
    if(!slot || !slot.relation) return false;
    const match = evaluateRelationMatch(this.task, slot, sourceRowKey, canonTables);
    if(!match) return false;

    this.sources[slotId] = sourceRowKey;
    this.matches[slotId] = match;
    this.answers[slotId] = match.restoredValue;
    if(this.phase !== RelationPhase.RELATION_SOLVING){
      this._transition(RelationPhase.RELATION_SOLVING);
    }
    this._emit('SourceSelected', { slotId, sourceRowKey, match });
    return true;
  }

  clearAnswer(slotId){
    if(this.phase === RelationPhase.RELATION_CLEARED ||
       this.phase === RelationPhase.EVIDENCE_REVEALED) return false;
    delete this.answers[slotId];
    delete this.sources[slotId];
    delete this.matches[slotId];
    this._emit('AnswerCleared', { slotId });
    return true;
  }

  matchOf(slotId){ return this.matches[slotId] || null; }

  isComplete(){
    return this.task.slots.every(s => !!this.answers[s.id]);
  }

  submit(){
    if(this.phase !== RelationPhase.RELATION_SOLVING) return false;
    if(!this.isComplete()) return false;
    this._transition(RelationPhase.RELATION_SUBMITTED);
    this._emit('Submitted', { answers: Object.assign({}, this.answers) });
    return true;
  }

  reject(reason){
    if(this.phase !== RelationPhase.RELATION_SUBMITTED) return false;
    this.attemptCount++;
    this._transition(RelationPhase.RELATION_REJECTED);
    this._emit('Rejected', { attemptCount: this.attemptCount, reason: reason || null });
    return true;
  }

  clear(){
    if(this.phase !== RelationPhase.RELATION_SUBMITTED) return false;
    this.attemptCount++;
    this.clearType = this.assistanceLevel === 0 ? 'INDEPENDENT' : 'ASSISTED';
    this._transition(RelationPhase.RELATION_CLEARED);
    this._emit('Cleared', { clearType: this.clearType });
    return true;
  }

  revealEvidence(){
    if(this.phase !== RelationPhase.RELATION_CLEARED) return false;
    this.evidence = {
      type: this.task.evidence.type,
      text: this.task.evidence.text,
      sourceTask: this.task.id
    };
    this._transition(RelationPhase.EVIDENCE_REVEALED);
    this._emit('EvidenceRevealed', this.evidence);
    return true;
  }

  // ヒントを1段進める。既存のMastery契約（自力かどうか）へ反映できるようにする。
  requestHint(){
    if(this.phase === RelationPhase.RELATION_CLEARED ||
       this.phase === RelationPhase.EVIDENCE_REVEALED) return null;
    if(this.assistanceLevel >= this.task.hints.length) return this.task.hints[this.task.hints.length - 1];
    const text = this.task.hints[this.assistanceLevel];
    this.assistanceLevel++;
    this._emit('HintRequested', { level: this.assistanceLevel });
    return text;
  }
}

// ---- Evaluator: 正誤判定のみ ----
export function evaluateRelation(task, answers){
  const wrong = [];
  for(const slot of task.slots){
    const given = answers[slot.id];
    if(given !== task.answer[slot.id]) wrong.push(slot.id);
  }
  return { ok: wrong.length === 0, wrongSlots: wrong };
}
