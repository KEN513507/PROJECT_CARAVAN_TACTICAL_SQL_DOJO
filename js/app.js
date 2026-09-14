// js/app.js
import { SoundEngine } from './sound.js?v=20260915-mute-2';
import { BgmEngine } from './bgm.js?v=20260915-mute-2';
import { STAGES, SKILL_LABELS, EXAM_QUESTIONS, EPILOGUE } from './data.js';
import { judge } from './validator.js';
import { UIManager } from './ui.js';

const sound = new SoundEngine();
const bgm = new BgmEngine();
const CHAPTER_BGM = ['airy', 'pulse', 'pulse', 'transmission'];
const PROGRESS_KEY = 'caravan_progress';
const MUTE_KEY = 'caravan_muted';
const ROW_PREDICTION_MIN_SAMPLE = 8;

function vibrate(p){ if(navigator.vibrate){ try{ navigator.vibrate(p); }catch(e){} } }

// ---- 誤答の概念分類（ヒューリスティック） ----
const SQL_CLAUSE_KEYWORDS = ['SELECT', 'FROM', 'INNER JOIN', 'ON', 'WHERE', 'GROUP BY', 'HAVING'];

function extractClauses(sql){
  const upper = sql.toUpperCase();
  const out = {};
  SQL_CLAUSE_KEYWORDS.forEach((kw, i) => {
    const idx = upper.indexOf(kw);
    if(idx === -1) return;
    let end = sql.length;
    SQL_CLAUSE_KEYWORDS.forEach((kw2, j) => {
      if(j === i) return;
      const idx2 = upper.indexOf(kw2, idx + kw.length);
      if(idx2 !== -1 && idx2 < end) end = idx2;
    });
    out[kw] = sql.slice(idx + kw.length, end).trim();
  });
  return out;
}

function normText(s){ return (s || '').replace(/\s+/g, ' ').trim().toUpperCase(); }
function normColSet(s){
  return (s || '').split(',').map(x => x.trim().toUpperCase()).filter(Boolean).sort().join(',');
}

// 誤答クエリを「WHERE/HAVING混同」「JOINキー誤り」「GROUP BY列誤り」「SELECT列誤り」のいずれかに分類する。
// 断定的な採点ではなく、次の学習行動を提案するための簡易ヒューリスティック。
function classifyConceptError(builtSql, stage){
  const b = extractClauses(builtSql);
  const c = extractClauses(stage.answers[0]);

  const bHasWhere = b['WHERE'] !== undefined, bHasHaving = b['HAVING'] !== undefined;
  const cHasWhere = c['WHERE'] !== undefined, cHasHaving = c['HAVING'] !== undefined;
  if((cHasWhere || cHasHaving) && (bHasWhere || bHasHaving) && (bHasWhere !== cHasWhere || bHasHaving !== cHasHaving)){
    return 'whereHaving';
  }

  if(c['ON'] !== undefined && normText(b['ON']) !== normText(c['ON'])){
    return 'joinKey';
  }

  if(c['GROUP BY'] !== undefined && normText(b['GROUP BY']) !== normText(c['GROUP BY'])){
    return 'grouping';
  }

  const selectMatchesAny = stage.answers.some(a => normColSet(extractClauses(a)['SELECT']) === normColSet(b['SELECT']));
  if(!selectMatchesAny){
    return 'selectProjection';
  }

  return null;
}

// 行数予測の弱点判定。最低サンプル数8未満は断定しない。
function rowPredictionStatus(attempts, correct){
  if(attempts < ROW_PREDICTION_MIN_SAMPLE) return { key:'insufficient', label:'要観察（サンプル不足）' };
  const rate = correct / attempts;
  if(rate < 0.5) return { key:'weak', label:'弱点' };
  if(rate < 0.8) return { key:'developing', label:'習得途中' };
  return { key:'strong', label:'強み' };
}

const NEXT_MISSION_LABELS = {
  whereHaving: 'WHERE/HAVINGの使い分け問題を3問解く',
  joinKey: 'JOINキー選定問題を3問解く',
  grouping: 'GROUP BY列選定問題を3問解く',
  selectProjection: 'SELECT列選定問題を3問解く'
};

function statusToEnglish(key){
  if(key === 'weak') return 'WEAK';
  if(key === 'developing') return 'DEVELOPING';
  if(key === 'strong') return 'STRONG';
  return 'INSUFFICIENT DATA';
}

function buildCertificateText(report){
  const lines = [];
  lines.push('SQL DOJO LEARNING RECORD');
  lines.push(report.date);
  lines.push('');
  lines.push('Completed');
  lines.push(`${report.clearedCount} / ${report.totalStages} stages`);
  lines.push('');
  lines.push('MASTERED');
  report.mastered.forEach(m => lines.push(`✓ ${m}`));
  lines.push('');
  lines.push('TRANSFER CHECK');
  lines.push(`IPA question: ${report.examStatus === 'pass' ? 'PASS' : 'RETRY'}`);
  lines.push('');
  lines.push('ROW PREDICTION');
  lines.push(`${report.rowPrediction.correct} / ${report.rowPrediction.attempts}`);
  lines.push(`Status: ${statusToEnglish(report.rowPrediction.status.key)}`);
  lines.push('');
  lines.push(`Edits       ${report.editCount}`);
  lines.push(`Exec errors ${report.executionErrors}`);
  lines.push(`Concept errors ${report.conceptErrorTotal}`);
  lines.push('');
  lines.push('NEXT MISSION');
  lines.push(report.nextMission);
  lines.push('');
  lines.push(`Session XP: ${report.xp}`);
  return lines.join('\n');
}

class App {
  constructor(){
    this.stage = 0;
    this.built = [];
    this.xp = 0;
    this.cleared = new Array(STAGES.length).fill(false);
    this.timeLeft = 0;
    this.timerId = null;
    this.usedModel = false;
    this.solved = false;
    this.predicted = null;
    this.timedOut = false;

    this.bgmTrack = 'title';
    this.bgmResumeTimer = null;
    try { this.muted = localStorage.getItem(MUTE_KEY) === 'true'; }
    catch(e){ this.muted = false; }
    const unlockBgm = event => {
      if(bgm.unlocked) return;
      bgm.unlock();
      const target = event.target;
      const tappedMute = target && target.nodeType === 1 && target.closest('#muteBtn');
      if(!this.muted && !tappedMute) this.setBgm(this.bgmTrack);
    };
    document.addEventListener('touchstart', unlockBgm, { once:true, passive:true });
    document.addEventListener('click', unlockBgm, { once:true, capture:true });

    // ---- Mastery Learning 用の学習ログ（このセッション内で累積） ----
    this.editCount = 0;
    this.executionErrors = 0;
    this.errorTypes = { whereHaving:0, joinKey:0, grouping:0, rowPrediction:0, selectProjection:0 };
    this.rowPredictionAttempts = 0;
    this.rowPredictionCorrect = 0;
    this.rowPredictionRecorded = false;
    this.examStatus = null; // null | 'pass' | 'retry'

    this.ui = new UIManager({
      onToken:  (t,k) => this.tapToken(t,k),
      onUtil:   a     => this.util(a),
      onRun:    ()    => this.run(),
      onHint:   ()    => this.hint(),
      onOrder:  ()    => this.order(),
      onRetry:  ()    => this.retryStage(),
      onOpenStages: () => this.openStageSelector(),
      onCloseDrawer: () => { sound.tap(); this.ui.closeDrawer(); },
      onCloseStageDrawer: () => { sound.tap(); this.ui.closeStageDrawer(); },
      onExamAnswer:  i  => this.answerExam(i),
      onRestart:     () => { sound.tap(); this.restart(); }
    });

    this.muteBtn = document.createElement('button');
    this.muteBtn.type = 'button';
    this.muteBtn.id = 'muteBtn';
    this.muteBtn.addEventListener('click', () => this.toggleMute());
    document.getElementById('hud').appendChild(this.muteBtn);
    this.applyMuteState();

    this.resumeFromProgress();
    this.load();
  }

  // ---- BGM ----
  applyMuteState(){
    if(typeof sound.setMuted === 'function') sound.setMuted(this.muted);
    if(typeof bgm.setMuted === 'function') bgm.setMuted(this.muted);
    this.muteBtn.textContent = this.muted ? '🔇' : '🔊';
    const label = this.muted ? '音声をオンにする' : '音声をミュート';
    this.muteBtn.setAttribute('aria-label', label);
    this.muteBtn.setAttribute('aria-pressed', String(this.muted));
    this.muteBtn.title = label;
  }

  toggleMute(){
    this.muted = !this.muted;
    this.applyMuteState();
    if(!this.muted){
      sound.init();
      if(bgm.unlocked && !bgm.current) bgm.play(this.bgmTrack);
    }
    try { localStorage.setItem(MUTE_KEY, String(this.muted)); } catch(e){}
  }

  setBgm(name, loop = true, volume = bgm.volume){
    clearTimeout(this.bgmResumeTimer);
    this.bgmResumeTimer = null;
    this.bgmTrack = name;
    if(bgm.unlocked) bgm.play(name, loop, volume);
  }

  playVictory(){
    this.setBgm('victory', false, 0.6);
    this.bgmResumeTimer = setTimeout(() => {
      this.setBgm(CHAPTER_BGM[this.stage] || 'title');
    }, 1500);
  }

  // ---- 進捗の永続化 (localStorage) ----
  loadProgressRaw(){
    try{
      const raw = localStorage.getItem(PROGRESS_KEY);
      if(!raw) return null;
      const data = JSON.parse(raw);
      if(typeof data.xp !== 'number' || typeof data.stage !== 'number' || !Array.isArray(data.cleared)) return null;
      return data;
    }catch(e){
      return null;
    }
  }
  saveProgress(){
    try{
      localStorage.setItem(PROGRESS_KEY, JSON.stringify({
        xp: this.xp, stage: this.stage, cleared: this.cleared
      }));
    }catch(e){
      // iOS Safari プライベートモード等で保存できなくてもゲームは継続する
    }
  }
  resumeFromProgress(){
    const saved = this.loadProgressRaw();
    if(!saved) return;
    const hasProgress = saved.stage > 0 || saved.xp > 0 || saved.cleared.some(Boolean);
    const fullyCleared = saved.cleared.length === STAGES.length && saved.cleared.every(Boolean);
    if(!hasProgress || fullyCleared) return;

    let resume = false;
    try{ resume = window.confirm(`前回の続き（CHAPTER ${saved.stage + 1}）から再開しますか？`); }catch(e){ resume = false; }

    if(resume){
      this.xp = saved.xp;
      this.stage = Math.min(saved.stage, STAGES.length - 1);
      this.cleared = saved.cleared.length === STAGES.length ? saved.cleared : new Array(STAGES.length).fill(false);
    } else {
      this.xp = 0;
      this.stage = 0;
      this.cleared = new Array(STAGES.length).fill(false);
      this.saveProgress();
    }
  }

  computeEnabled(){
    const built = this.built;
    const last = built.length ? built[built.length-1] : null;

    if(!last) return this._enabledForRef(null);

    if(last.t === '\n'){
      for(let i = built.length - 2; i >= 0; i--){
        if(built[i].k !== 'punct') return this._enabledForRef(built[i]);
      }
      return this._enabledForRef(null);
    }

    return this._enabledForRef(last);
  }

  _enabledForRef(last){
    const set = new Set();
    const built = this.built;
    const tokens = STAGES[this.stage].tokens;
    const allow = t => set.add(t.t + '|' + t.k);

    if(!last){
      tokens.filter(t => t.t === 'SELECT').forEach(allow);
      return set;
    }

    const lt = last.t;
    const lk = last.k;

    if(lt === 'SELECT'){
      tokens.filter(t => t.k === 'col' || t.k === 'func').forEach(allow);
      return set;
    }
    if(lt === 'FROM' || lt === 'INNER JOIN'){
      tokens.filter(t => t.k === 'table').forEach(allow);
      return set;
    }
    if(lt === 'ON'){
      tokens.filter(t => t.k === 'col' && t.t.indexOf('.') !== -1).forEach(allow);
      return set;
    }
    if(lk === 'op'){
      const afterOn = built.some(x => x.t === 'ON') && !built.some(x => x.t === 'WHERE' || x.t === 'HAVING');
      tokens.filter(t => t.k === 'lit' || (afterOn && t.k === 'col' && t.t.indexOf('.') !== -1)).forEach(allow);
      return set;
    }
    if(lt === 'WHERE' || lt === 'GROUP BY' || lt === 'HAVING'){
      tokens.filter(t => t.k === 'col' || t.k === 'func').forEach(allow);
      return set;
    }
    if(lt === ',' || lt === 'AND'){
      tokens.filter(t => t.k === 'col' || t.k === 'func').forEach(allow);
      return set;
    }
    if(lt === 'AS'){
      tokens.filter(t => t.k === 'alias').forEach(allow);
      return set;
    }
    if(lk === 'table' || lk === 'alias'){
      const hasFrom = built.some(x => x.t === 'FROM');
      if(!hasFrom){
        // SELECT句内の集計列に付けたAS別名の直後。次はFROMしかありえない。
        tokens.filter(t => t.k === 'clause' && t.t === 'FROM').forEach(allow);
        return set;
      }
      const hasJoin = built.some(x => x.t === 'INNER JOIN');
      tokens.filter(t => t.k === 'as' ||
        (t.k === 'clause' &&
        (t.t === 'WHERE' || t.t === 'GROUP BY' || t.t === 'HAVING' ||
         (!hasJoin && t.t === 'INNER JOIN') || (hasJoin && t.t === 'ON')))).forEach(allow);
      return set;
    }
    if(lk === 'lit'){
      tokens.filter(t => t.k === 'and' || (t.k === 'clause' &&
        (t.t === 'GROUP BY' || t.t === 'HAVING' || t.t === 'INNER JOIN'))).forEach(allow);
      return set;
    }
    if(lk === 'col' || lk === 'func'){
      const hasFrom = built.some(x => x.t === 'FROM');
      tokens.filter(t =>
        t.k === 'op' ||
        t.k === 'col' ||
        t.k === 'func' ||
        t.k === 'as' ||
        (t.k === 'clause' && hasFrom &&
          (t.t === 'WHERE' || t.t === 'GROUP BY' || t.t === 'HAVING' || t.t === 'INNER JOIN' || t.t === 'ON')) ||
        (t.k === 'clause' && !hasFrom && t.t === 'FROM')
      ).forEach(allow);
      return set;
    }
    return set;
  }

  tapToken(t, k){
    if(this.solved || this.timedOut) return;
    sound.tap(); vibrate(8);

    const last = this.built[this.built.length-1];
    const lastIsValue = last && (last.k === 'col' || last.k === 'func');
    const newIsValue  = (k === 'col' || k === 'func');
    if(lastIsValue && newIsValue) this.built.push({ t:',', k:'punct' });

    this.built.push({ t, k });
    this.refreshMonitor();
  }

  util(a){
    if(this.solved || this.timedOut) return;
    sound.tap(); vibrate(8);
    if(a === 'comma') this.built.push({ t:',', k:'punct' });
    else if(a === 'undo'){ this.built.pop(); this.editCount++; }
    else if(a === 'br'){ this.built.push({ t:'\n', k:'punct' }); this.editCount++; }
    else if(a === 'clear'){ this.built = []; this.editCount++; }
    this.refreshMonitor();
  }

  refreshMonitor(){
    this.ui.renderMonitor(this.built);
    this.ui.setTokenStates(this.computeEnabled());
  }

  run(){
    if(this.timedOut) return;
    if(this.solved){ this.next(); return; }
    if(this.predicted === null){
      sound.tap();
      this.ui.showPredictBar(STAGES[this.stage].rowChoices, choice => this.onPredicted(choice));
      return;
    }
    this.executeRun();
  }

  onPredicted(choice){
    sound.tap(); vibrate(8);
    this.predicted = choice;
    if(!this.rowPredictionRecorded){
      this.rowPredictionRecorded = true;
      this.rowPredictionAttempts++;
      const correctRows = STAGES[this.stage].resultSet.rows.length;
      if(choice === correctRows) this.rowPredictionCorrect++;
      else this.errorTypes.rowPrediction++;
    }
    this.ui.hidePredictBar();
    this.executeRun();
  }

  executeRun(){
    this.ui.hidePredictBar();
    const st = STAGES[this.stage];
    const built = this.built.map(x => x.t === '\n' ? ' ' : x.t).join(' ');
    const r = judge(built, st.answers);

    if(r.empty){
      sound.error();
      this.ui.setFeedback('クエリが空です。トークンをタップして組み立てよう。','ng');
      return;
    }

    if(r.ok){
      this.stopTimer();
      this.solved = true;
      sound.success(); vibrate([15,40,15,40,60]);
      this.playVictory();
      const bonus = this.timeLeft * 2;
      let gain = Math.round((100 + bonus) * (this.usedModel ? 0.25 : 1));
      const predictOk = this.predicted === st.resultSet.rows.length;
      if(predictOk) gain += 30;
      this.xp += gain;
      this.cleared[this.stage] = true;
      this.saveProgress();
      this.ui.setHud(this.stage, STAGES.length, this.xp);
      this.ui.setFeedback(
        predictOk
          ? `✅ 正解！ +${gain} XP（行数予測的中 +30） ─ 評価順に完全一致。`
          : `✅ 正解！ +${gain} XP ─ 評価順に完全一致。（予測は外れ：実際は${st.resultSet.rows.length}行）`,
        'ok');
      this.ui.hideRetryButton();
      this.ui.lockPad();
      this.ui.markSolved(this.stage === STAGES.length - 1);
      this.ui.renderResultSet(st.resultSet);
      this.ui.renderAltAnswers(st.answers);
      if(st.reveal) this.ui.renderReveal(st.reveal);
    } else {
      sound.error(); vibrate([20,50,20]);
      this.executionErrors++;
      const errorType = classifyConceptError(built, st);
      if(errorType) this.errorTypes[errorType]++;
      this.ui.setFeedback('❌ 不正解… FROM → WHERE → GROUP BY → HAVING → SELECT の順を思い出そう。','ng');
      this.ui.showRetryButton();
    }
  }

  hint(){
    if(this.solved) return;
    bgm.duck(1500);
    sound.tap(); vibrate(8);
    this.usedModel = true;
    this.ui.showHint(STAGES[this.stage].answers[0]);
    this.ui.setFeedback('💡 模範形を表示（獲得XPは25%）。','');
  }

  order(){
    bgm.duck(1500);
    sound.tap(); vibrate(8);
    const st = STAGES[this.stage];
    this.ui.openDrawer(`🔍 評価順 ─ CHAPTER ${this.stage+1}`, st.steps);
  }

  retryStage(){
    sound.tap(); vibrate(8);
    this.load();
    this.saveProgress();
  }

  openStageSelector(){
    sound.tap(); vibrate(8);
    this.ui.openStageDrawer(STAGES, this.stage, this.cleared, i => this.selectStage(i));
  }

  selectStage(i){
    sound.tap(); vibrate(8);
    this.ui.closeStageDrawer();
    this.stage = i;
    this.load();
  }

  startTimer(){
    this.stopTimer();
    this.timeLeft = STAGES[this.stage].time;
    this.ui.setTimer(this.timeLeft);
    this.timerId = setInterval(() => {
      this.timeLeft--;
      this.ui.setTimer(this.timeLeft);
      if(this.timeLeft <= 10 && this.bgmTrack !== 'urgent') this.setBgm('urgent');
      if(this.timeLeft <= 0){ this.stopTimer(); this.timeout(); }
    }, 1000);
  }
  stopTimer(){ if(this.timerId){ clearInterval(this.timerId); this.timerId = null; } }
  timeout(){
    this.setBgm('urgent');
    sound.error(); vibrate([25,60,25]);
    this.timedOut = true;
    this.ui.disableForTimeout();
    this.ui.setFeedback('⏰ 時間切れ… 模範形を確認して再度挑戦。','ng');
    this.usedModel = true;
    this.ui.showHint(STAGES[this.stage].answers[0]);
    this.ui.showRetryButton();
  }

  load(){
    const st = STAGES[this.stage];
    this.built = [];
    this.usedModel = false;
    this.solved = false;
    this.predicted = null;
    this.timedOut = false;
    this.rowPredictionRecorded = false;

    this.ui.hideHint();
    this.ui.hidePredictBar();
    this.ui.hideRetryButton();
    this.ui.enableAfterTimeout();
    this.ui.hideResultSet();
    this.ui.hideAltAnswers();
    this.ui.hideReveal();
    this.ui.resetRunBtn();
    this.ui.setMission(st.level, st.prompt);
    this.ui.renderSchema(st.tables);
    this.ui.renderTokens(st.tokens);
    this.ui.setHud(this.stage, STAGES.length, this.xp);
    this.ui.setFeedback('トークンをタップして、正しい順序でクエリを組み立てよう。','');
    this.refreshMonitor();
    this.startTimer();
    this.setBgm(CHAPTER_BGM[this.stage] || 'title');
  }

  next(){
    if(this.stage < STAGES.length - 1){ this.stage++; this.load(); }
    else this.showEpilogue();
  }

  showEpilogue(){
    this.setBgm('title');
    sound.tap();
    this.ui.showStoryOverlay(EPILOGUE, () => {
      this.ui.hideStoryOverlay();
      this.finish();
    });
  }

  // ---- Mastery Learning レポート ----
  computeNextMission(rp){
    if(rp.key === 'insufficient'){
      const need = ROW_PREDICTION_MIN_SAMPLE - this.rowPredictionAttempts;
      return `行数予測をあと${need}問解いて判定精度を上げる`;
    }
    if(rp.key === 'weak' || rp.key === 'developing'){
      return '行数予測を5問解く';
    }
    let top = null, topCount = 0;
    Object.keys(NEXT_MISSION_LABELS).forEach(k => {
      if(this.errorTypes[k] > topCount){ topCount = this.errorTypes[k]; top = k; }
    });
    if(top) return NEXT_MISSION_LABELS[top];
    return 'IPA過去問にもう1問挑戦して定着を確認する';
  }

  buildReport(){
    const rp = rowPredictionStatus(this.rowPredictionAttempts, this.rowPredictionCorrect);
    const conceptErrorTotal = this.errorTypes.whereHaving + this.errorTypes.joinKey +
      this.errorTypes.grouping + this.errorTypes.selectProjection;
    return {
      date: new Date().toISOString().slice(0, 10),
      clearedCount: this.cleared.filter(Boolean).length,
      totalStages: STAGES.length,
      mastered: SKILL_LABELS.filter((_, i) => this.cleared[i]),
      rowPrediction: { attempts: this.rowPredictionAttempts, correct: this.rowPredictionCorrect, status: rp },
      editCount: this.editCount,
      executionErrors: this.executionErrors,
      conceptErrorTotal,
      examStatus: this.examStatus,
      xp: this.xp,
      nextMission: this.computeNextMission(rp)
    };
  }

  answerExam(i){
    sound.tap(); vibrate(8);
    const q = EXAM_QUESTIONS[0];
    const correct = i === q.correct;
    this.examStatus = correct ? 'pass' : 'retry';
    this.ui.renderExamAnswer(q, i, correct);
    this.ui.setCertificateText(buildCertificateText(this.buildReport()));
  }

  finish(){
    this.stopTimer();
    this.setBgm('title');
    this.saveProgress();
    sound.fanfare(); vibrate([30,60,30,60,120]);
    const report = this.buildReport();
    this.ui.showResult(report, EXAM_QUESTIONS[0], buildCertificateText(report));
  }

  restart(){
    this.stage = 0;
    this.xp = 0;
    this.cleared = new Array(STAGES.length).fill(false);
    this.editCount = 0;
    this.executionErrors = 0;
    this.errorTypes = { whereHaving:0, joinKey:0, grouping:0, rowPrediction:0, selectProjection:0 };
    this.rowPredictionAttempts = 0;
    this.rowPredictionCorrect = 0;
    this.examStatus = null;
    this.saveProgress();
    this.ui.hideResult();
    this.load();
  }
}

document.addEventListener('touchstart', function once(){
  sound.init();
  document.removeEventListener('touchstart', once);
}, { passive:true });

new App();