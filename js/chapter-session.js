// js/chapter-session.js
// ChapterSession: CH1のドメインモデル。
// 「あり得ない状態を作れなくする」ことが目的であり、if文を減らすためではない。
// Presentation（UI/演出/ワークスペース名）を一切知らない。

export const Phase = Object.freeze({
  AWAITING_QUERY:      'AWAITING_QUERY',
  QUERY_DRAFTING:      'QUERY_DRAFTING',
  AWAITING_PREDICTION: 'AWAITING_PREDICTION',
  QUERY_EXECUTING:     'QUERY_EXECUTING',
  QUERY_REJECTED:      'QUERY_REJECTED',
  EVIDENCE_REVEALED:   'EVIDENCE_REVEALED',
  CHAPTER_CLEARED:     'CHAPTER_CLEARED'
});

export class ChapterSession {
  constructor(chapterId) {
    this.chapterId = chapterId;
    this.phase = Phase.AWAITING_QUERY;

    // Domain objects
    this.draft = { tokens: [] };
    this.prediction = null;
    this.execution = null;
    this.evidence = null;

    // Counters (separated)
    this.executionCount = 0;
    this.rejectionCount = 0;

    // Assistance / Clear
    this.assistanceLevel = 0;   // 0..4
    this.clearType = null;      // INDEPENDENT | ASSISTED | PRACTICE

    this._listeners = [];
  }

  // ---- Subscription ----
  on(event, handler){
    this._listeners.push({ event, handler });
    return () => {
      this._listeners = this._listeners.filter(l => l.handler !== handler);
    };
  }

  _emit(event, payload){
    for(const l of this._listeners){
      if(l.event === event){
        try { l.handler(payload); }
        catch(e){ console.error('ChapterSession listener error:', e); }
      }
    }
  }

  _transition(next){
    const prev = this.phase;
    if(prev === next) return;
    this.phase = next;
    this._emit('PhaseChanged', { from: prev, to: next });
  }

  // ---- Draft operations ----
  addToken(token){
    if(this.phase !== Phase.AWAITING_QUERY &&
       this.phase !== Phase.QUERY_DRAFTING &&
       this.phase !== Phase.QUERY_REJECTED){
      return false;
    }
    this.draft.tokens.push(token);
    if(this.phase !== Phase.QUERY_DRAFTING){
      this._transition(Phase.QUERY_DRAFTING);
    }
    this._emit('QueryTokenAdded', token);
    return true;
  }

  removeToken(){
    if(this.phase !== Phase.QUERY_DRAFTING &&
       this.phase !== Phase.QUERY_REJECTED){
      return false;
    }
    this.draft.tokens.pop();
    if(this.draft.tokens.length === 0){
      this._transition(Phase.AWAITING_QUERY);
    }
    this._emit('QueryTokenRemoved', null);
    return true;
  }

  // 拒否されたdraftを(Undoのみで)修正して再提出する導線。draftが空でなければQUERY_DRAFTINGへ戻す。
  resumeDrafting(){
    if(this.phase !== Phase.QUERY_REJECTED) return false;
    if(this.draft.tokens.length === 0) return false;
    this._transition(Phase.QUERY_DRAFTING);
    return true;
  }

  clearDraft(){
    if(this.phase === Phase.QUERY_EXECUTING ||
       this.phase === Phase.EVIDENCE_REVEALED ||
       this.phase === Phase.CHAPTER_CLEARED){
      return false;
    }
    this.draft.tokens = [];
    this._transition(Phase.AWAITING_QUERY);
    this._emit('QueryDraftCleared', null);
    return true;
  }

  // ---- Execution flow ----
  submit(){
    if(this.phase !== Phase.QUERY_DRAFTING) return false;
    if(this.draft.tokens.length === 0) return false;
    this._transition(Phase.AWAITING_PREDICTION);
    this._emit('QuerySubmitted', this.draft);
    return true;
  }

  submitPrediction(expectedRows){
    if(this.phase !== Phase.AWAITING_PREDICTION) return false;
    this.prediction = { expectedRows };
    this.executionCount++;
    this._transition(Phase.QUERY_EXECUTING);
    this._emit('PredictionSubmitted', this.prediction);
    return true;
  }

  // 予測モーダルをキャンセルして QUERY_DRAFTING に戻す (draftは保持したまま)。
  cancelPrediction(){
    if(this.phase !== Phase.AWAITING_PREDICTION) return false;
    this._transition(Phase.QUERY_DRAFTING);
    this._emit('PredictionCancelled', null);
    return true;
  }

  reject(reason){
    if(this.phase !== Phase.QUERY_EXECUTING) return false;
    this.rejectionCount++;
    this._transition(Phase.QUERY_REJECTED);
    this._emit('QueryRejected', {
      rejectionCount: this.rejectionCount,
      reason: reason || null
    });
    return true;
  }

  recordExecution(execution){
    if(this.phase !== Phase.QUERY_EXECUTING) return false;
    this.execution = execution;
    return true;
  }

  revealEvidence(evidence){
    if(this.phase !== Phase.QUERY_EXECUTING) return false;
    this.evidence = evidence;
    this._transition(Phase.EVIDENCE_REVEALED);
    this._emit('EvidenceRevealed', this.evidence);
    return true;
  }

  clear(){
    if(this.phase !== Phase.EVIDENCE_REVEALED) return false;
    this.clearType = this._resolveClearType();
    this._transition(Phase.CHAPTER_CLEARED);
    this._emit('ChapterCleared', { clearType: this.clearType });
    return true;
  }

  // ---- Assistance ----
  requestHint(){
    if(this.phase === Phase.CHAPTER_CLEARED) return false;
    if(this.assistanceLevel >= 4) return false;
    this.assistanceLevel++;
    this._emit('HintRequested', { level: this.assistanceLevel });
    return true;
  }

  // 「穴あき/構造支援」など、完成SQLではない何らかの実質的な支援が示されたことを記録する。
  // 単調増加(高水準マーク)で、既に到達済みのレベルを下げることはない。
  // 完成SQL相当(4)には決して到達しない — それは markFullAnswerShown() の専任。
  markPartialAssistanceShown(){
    if(this.phase === Phase.CHAPTER_CLEARED) return false;
    if(this.assistanceLevel >= 4) return true; // 既に完成SQL相当なら降格させない(no-op)
    if(this.assistanceLevel < 1) this.assistanceLevel = 1;
    this._emit('AssistanceRevealed', { level: this.assistanceLevel, kind: 'partial' });
    return true;
  }

  // 完成SQL(模範解答)そのものが提示された瞬間に呼ぶ。TIMEOUTや自動段階Hintの最終段など、
  // 「何回目の失敗か」ではなく「実際に完成SQLを見せたか」を直接表明するための専用メソッド。
  // 外部(App側)から assistanceLevel を直接代入させないためにこれを用意する。
  markFullAnswerShown(){
    if(this.phase === Phase.CHAPTER_CLEARED) return false;
    if(this.assistanceLevel >= 4) return true; // 既に4ならno-op
    this.assistanceLevel = 4;
    this._emit('AssistanceRevealed', { level: this.assistanceLevel, kind: 'full' });
    return true;
  }

  _resolveClearType(){
    if(this.assistanceLevel === 0) return 'INDEPENDENT';
    if(this.assistanceLevel <= 3) return 'ASSISTED';
    return 'PRACTICE';
  }
}
