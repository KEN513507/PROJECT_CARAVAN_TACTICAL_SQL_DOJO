// Methods of the canonical App. Uses its UIManager, ChapterSession and success zones.
import { ChapterSession, Phase } from './chapter-session.js?v=20260919-onboarding';
import { LEARNING_STAGES as stages, LEARNING_TABLES as ONBOARDING_TABLES } from './campaign.js?v=20260928-missions';
import { queryTokens, queryText, editQuery } from './onboarding.js?v=20260928-missions';
import { judgeByResult } from './sql-engine.js?v=20260919-onboarding';

const STORAGE_KEY = 'neon_relay_campaign_v2';
const validTokens = value => Array.isArray(value) && value.length <= 160 && value.every(t =>
  t && typeof t.t === 'string' && t.t.length <= 100 && typeof t.k === 'string');

// 結果と同じ行を、元の表に入っている順に並べ直す（並べ替え前の姿）。
function sourceOrder(st, result){
  if(!result) return null;
  const table = ONBOARDING_TABLES[st.tables[0]];
  const key = row => JSON.stringify(row.map(String));
  const wanted = new Map(result.rows.map(r => [key(r), r]));
  const idx = result.cols.map(c => table.cols.indexOf(c));
  const before = [];
  for(const row of table.rows){
    const projected = idx.map(i => row[i]);
    const k = key(projected);
    if(wanted.has(k)){ before.push(wanted.get(k)); wanted.delete(k); }
  }
  // 並べ替えで順番が実際に変わった場合だけ返す
  return before.length === result.rows.length && key(before) !== key(result.rows) ? before : null;
}

export const learningActions = {
  restoreLearning(){
    this.learningDrafts = {};
    this.learningCompleted = {};
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if(saved?.version !== 2) return;
      for(const st of stages){
        const draft = saved.drafts?.[st.id];
        if(draft && validTokens(draft.tokens)) this.learningDrafts[st.id] = draft;
        const done = saved.completed?.[st.id];
        if(done && validTokens(done.tokens) && judgeByResult(queryText(done.tokens), st.resultSet, ONBOARDING_TABLES,
          { ordered: st.ordered }).ok) this.learningCompleted[st.id] = done;
      }
      // campaign は M01〜M12 + 本編CH1〜CH6 の一続き。学習章ぶんだけを埋め、
      // 配列自体は campaign 全体の長さ（this.cleared）を保つ。
      stages.forEach((st, i) => { this.cleared[i] = !!this.learningCompleted[st.id]; });
      const first = stages.findIndex((st, i) => !this.cleared[i]);
      // 学習章を全て終えていれば、次に開くのは本編の先頭（= stages.length）。
      const unlocked = first < 0 ? stages.length : first;
      this.stage = Math.max(0, Math.min(Number.isInteger(saved.stage) ? saved.stage : 0, unlocked));
    } catch { /* A storage failure must not prevent play. */ }
  },

  saveLearning(){
    if(!this.learningDrafts) return;
    const st = stages[this.stage];
    if(this.session?.chapterId === st.id){
      this.learningDrafts[st.id] = {
        tokens: this.built.map(t => ({ ...t })), cursor: this.learningCursor,
        assistance: this.session.assistanceLevel, solved: this.solved
      };
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, stage: this.stage,
        drafts: this.learningDrafts, completed: this.learningCompleted }));
    } catch { /* Keep the active session usable when storage is unavailable. */ }
  },

  loadLearning(){
    this.stopTimer();
    this.runToken++;
    const st = stages[this.stage];
    this.learningDrafts ||= {};
    this.learningCompleted ||= {};
    const saved = this.learningDrafts[st.id];
    const previous = this.learningCompleted[stages[this.stage - 1]?.id];
    const tokens = saved?.tokens || (st.starter ? queryTokens(st.starter) :
      previous?.tokens || queryTokens(stages[this.stage - 1]?.answers[0] || st.skeleton));
    this.session = new ChapterSession(st.id);
    this._bindSession(this.session);
    this.session.replaceDraft(tokens);
    this.session.assistanceLevel = Math.max(0, Math.min(4, Number(saved?.assistance) || 0));
    this.assistLevel = this.session.assistanceLevel;
    const slot = tokens.findIndex(t => t.k === 'slot');
    this.learningCursor = saved?.cursor && Number.isInteger(saved.cursor.index)
      ? { index: Math.max(0, Math.min(tokens.length, saved.cursor.index)), replace: !!saved.cursor.replace }
      : { index: slot >= 0 ? slot : tokens.length, replace: slot >= 0 };
    this.learningUndo = [];
    this.solved = false;
    this.timedOut = false;
    this.tutorialActive = false;
    this.lastResult = null;
    this.lastBuiltSql = null;
    this._lastClear = null;
    this.successZone = null;
    this.ui.setCh1Layout(false);
    this.ui.closeSheet();
    this.ui.closeDrawer();
    this.ui.closeStageDrawer();
    this.ui.hideStoryOverlay();
    this.ui.hideSuccess();
    this.ui.hideRelationTask();
    this.ui.hidePredictBar();
    this.ui.hideRetryButton();
    this.ui.hideResultSet();
    this.ui.hideReveal();
    this.ui.hideAltAnswers();
    this.ui.hideHint();
    this.ui.setProtagonist('hidden');
    this.ui.enableAfterTimeout();
    document.body.classList.add('learning-ui');
    document.body.dataset.workspace = 'compose';
    this.ui.setFocus('source');   // 開始時は表を大きく（まずデータを読む）
    document.body.dataset.mission = st.id;
    this.ui.setMission(st.level, st.prompt);
    this.ui.setMissionVisible(this.missionVisible());
    this.ui.showTutor('intro');   // CHARACTER ART CONTRACT: 問題冒頭
    this.ui.setLearningHud(this.stage, this.cleared.filter(Boolean).length, stages.length);
    this.ui.renderLearningSource(st.tables[0], ONBOARDING_TABLES[st.tables[0]], st.note);
    this.ui.renderTokens(st.tokens);
    this.ui.renderLearningGuide();
    this.ui.setFeedback('', '');
    this.ui.resetRunBtn();
    this.ui.setRunLabel('▶ 実行する');
    this.ui.setRunDisabled(false);
    this.refreshLearning();
    this.setBgm('airy');
    if(saved?.solved && this.learningCompleted[st.id]) this.runLearning();
    this.saveLearning();
  },

  refreshLearning(){
    this.ui.renderEditableQuery(this.built, this.learningCursor, this.solved);
    this.ui.el.tokenPad.querySelectorAll('.tok').forEach(b => { b.disabled = this.solved; });
    this.ui.el.undoBtn.disabled = this.solved || !this.learningUndo.length;
  },

  selectLearningToken(index){
    if(this.solved) return;
    this.sound.tap();
    this.ui.tutorOnEdit();
    this.ui.setFocus('query');
    this.learningCursor = { index, replace: true };
    this.refreshLearning();
    this.saveLearning();
  },

  tapLearningToken(t, k){
    if(this.solved || this.built.length >= 160) return;
    this.sound.tap();
    this.ui.tutorOnEdit();
    this.ui.hideHint();
    this.learningUndo.push({ tokens: this.built.map(t => ({ ...t })), cursor: { ...this.learningCursor } });
    const next = editQuery(this.built, { t, k }, this.learningCursor);
    this.session.replaceDraft(next.tokens);
    this.learningCursor = next.cursor;
    this.ui.hideResultSet();
    this.ui.setFeedback('', '');
    this.refreshLearning();
    this.saveLearning();
  },

  learningUtil(action){
    if(this.solved) return;
    this.sound.tap();
    this.ui.tutorOnEdit();
    this.ui.hideHint();
    this.ui.setFocus('query');
    if(action === 'after'){
      this.learningCursor = { index: Math.min(this.built.length, this.learningCursor.index + (this.learningCursor.replace ? 1 : 0)), replace: false };
    } else if(action === 'end'){
      this.learningCursor = { index: this.built.length, replace: false };
    } else if(action === 'undo'){
      const last = this.learningUndo.pop();
      if(last){ this.session.replaceDraft(last.tokens); this.learningCursor = last.cursor; }
    } else if(action === 'comma'){
      this.tapLearningToken(',', 'punct'); return;
    } else if(action === 'remove' || action === 'clear'){
      this.learningUndo.push({ tokens: this.built.map(t => ({ ...t })), cursor: { ...this.learningCursor } });
      const tokens = this.built.map(t => ({ ...t }));
      const at = this.learningCursor.replace ? this.learningCursor.index : Math.max(0, this.learningCursor.index - 1);
      if(action === 'clear') tokens.length = 0;
      else tokens.splice(at, 1);
      this.session.replaceDraft(tokens);
      this.learningCursor = { index: Math.min(at, tokens.length), replace: false };
    }
    this.ui.hideResultSet();
    this.ui.setFeedback('', '');
    this.refreshLearning();
    this.saveLearning();
  },

  runLearning(){
    if(this.solved){
      // 次章への進行は App が持つ。M12 の次は本編 CHAPTER 1 で、ここで campaign は終わらない。
      this.saveLearning();
      this.next();
      return;
    }
    const st = stages[this.stage];
    if(!this.session.submitQuery()){
      this.ui.setFeedback('表の列や下のボタンをタップして、照会を組み立ててください。', ''); return;
    }
    const sql = queryText(this.built);
    // Sorting belongs to the mission contract, not to the player's choice to add ORDER BY.
    const judged = judgeByResult(sql, st.resultSet, ONBOARDING_TABLES, { ordered: st.ordered });
    if(!judged.ok){
      this.sound.error();
      this.session.reject(judged.error ? 'sql_error' : 'sql_mismatch');
      if(judged.result) this.ui.renderResultSet(judged.result);
      const message = this.built.some(t => t.k === 'slot') ? '□を選んで、表の列や値をタップしてください。'
        : judged.error ? 'このSQLはまだ実行できません。選んだ語句を置き換えるか、ヒントで形を確認できます。'
        : st.ordered ? '結果を確認できました。数量の少ない順に並べてみましょう。'
        : '結果を確認できました。依頼された列と行になっているか、表と見比べてみましょう。';
      this.ui.hideTutor();   // CHARACTER ART CONTRACT: 解答作業中は出さない
      this.ui.setFeedback(message, 'retry');
      document.body.dataset.workspace = 'compose';
      this.refreshLearning();
      this.saveLearning();
      return;
    }
    this.sound.success();
    this.session.recordExecution({ built: sql, resultSet: judged.result, at: Date.now() });
    this.session.revealEvidence({ rows: judged.result.rows, sourceQuery: sql });
    this.session.clear();
    this.solved = true;
    this.lastResult = judged.result;
    this.lastBuiltSql = sql;
    this.cleared[this.stage] = true;
    this.learningCompleted[st.id] = { tokens: this.built.map(t => ({ ...t })), assistance: this.session.assistanceLevel };
    this.successZone = 'result';
    this.commUnread = false;
    this.ui.hideResultSet();
    this.ui.hideHint();
    this.ui.setFeedback('', '');
    document.body.dataset.workspace = 'success';
    this.ui.showTutor('clear');   // CHARACTER ART CONTRACT: クリア画面
    this.ui.setLearningHud(this.stage, this.cleared.filter(Boolean).length, stages.length);
    this.ui.setRunLabel(this.stage === stages.length - 1 ? '▶ 本編へ' : '▶ 次の照会へ');
    this.ui.setRunDisabled(false);
    this.renderSuccess('COMPLETE', 0);
    this.refreshLearning();
    this.saveLearning();
  },

  learningHint(){
    if(this.solved) return;
    // 出しっぱなしにしない。表示中にもう一度押したら閉じる（支援段階は増やさない）。
    this.sound.tap();
    if(this.ui.isHintVisible()){ this.ui.hideHint(); this.ui.hideTutor(); return; }
    this.session.requestHint();
    const st = stages[this.stage];
    const level = this.session.assistanceLevel;
    this.ui.showHint([st.hint1, st.hint2, st.skeleton, st.answers[0]][Math.max(0, level - 1)], level >= 3 ? '照会の形' : 'ヒント');
    this.ui.showTutor('hint');   // CHARACTER ART CONTRACT: ヒント
    this.saveLearning();
  },

  learningSuccessView(){
    const st = stages[this.stage];
    return { missionTitle: st.level, problem: st.prompt,
      tables: st.tables.map(name => ({ name, ...ONBOARDING_TABLES[name] })),
      executedSql: this.lastBuiltSql, result: this.lastResult, alternatives: [],
      // 並べ替えの章は、行数も列数も変わらず順番だけが変わる。
      // 何が起きたのかを見せるため、並べ替える前（表に入っている順）を添える。
      orderedBefore: st.ordered ? sourceOrder(st, this.lastResult) : null,
      clearType: 'COMPLETE', clearLabel: '作業完了', clearNote: `${st.concept}を使って照会できました。`,
      dialogue: { lines: [{ speaker: '端末', text: st.reveal.text }], terminal: [] },
      commUnread: false, openZone: this.successZone };
  }
};
