// js/app.js
import { SoundEngine } from './sound.js?v=20260915-sprint2';
import { BgmEngine } from './bgm.js?v=20260915-sprint2';
import { TABLES, STAGES, SKILL_LABELS, EXAM_QUESTIONS, EPILOGUE, OPENING, TUTORIAL } from './data.js?v=20260915-sprint2';
import { judgeByResult } from './sql-engine.js?v=20260917-fe-rtp';
import { getRelationTask, buildRelationTables, RelationTaskSession, RelationPhase, evaluateRelation }
  from './relation-task.js?v=20260917-relation01';
import { UIManager } from './ui.js?v=20260915-sprint2';
import { ChapterSession, Phase } from './chapter-session.js?v=20260915-sprint2';

// ---- Presentation側マッピング (Domainはworkspace名を知らない) ----
const WORKSPACE_BY_PHASE = {
  [Phase.AWAITING_QUERY]:      'inspect',
  [Phase.QUERY_DRAFTING]:      'compose',
  [Phase.AWAITING_PREDICTION]: 'predict',
  [Phase.QUERY_EXECUTING]:     'executing',
  [Phase.QUERY_REJECTED]:      'compose',
  [Phase.EVIDENCE_REVEALED]:   'evidence',
  [Phase.CHAPTER_CLEARED]:     'story'
};

const sound = new SoundEngine();
const bgm = new BgmEngine();
const CHAPTER_BGM = ['airy', 'pulse', 'pulse', 'transmission'];
const PROGRESS_KEY = 'caravan_progress';
const MASTERY_KEY = 'caravan_mastery';
const MUTE_KEY = 'caravan_muted';
const INTRO_KEY = 'caravan_intro_seen';
const TUTORIAL_KEY = 'caravan_tutorial_seen';
const ROW_PREDICTION_MIN_SAMPLE = 8;

// ---- DEBUG: ステージセレクタで全章を選択可能にする ----
// 開発中の動作確認用。本番化するときは false に戻すだけでロック挙動へ戻る。
const DEBUG_ALL_STAGES = true;

const CLEAR_TYPE_LABELS = {
  MASTERED: '習得（自力）',
  ASSISTED: 'ヒント付きクリア',
  PRACTICE: '模範解答による練習'
};
function chapterKey(index){ return 'ch' + String(index + 1).padStart(2, '0'); }
function clearTypeForAssist(level){
  return level === 0 ? 'MASTERED' : (level < 4 ? 'ASSISTED' : 'PRACTICE');
}

// ---- CH1限定: ChapterSession.clearType (INDEPENDENT/ASSISTED/PRACTICE) を
// 既存のMastery表示語彙 (MASTERED/ASSISTED/PRACTICE) へ変換する。CH2以降には使わない。
const SESSION_CLEAR_TYPE_TO_MASTERY = {
  INDEPENDENT: 'MASTERED',
  ASSISTED: 'ASSISTED',
  PRACTICE: 'PRACTICE'
};
function mapSessionClearType(sessionClearType){
  return SESSION_CLEAR_TYPE_TO_MASTERY[sessionClearType] || 'PRACTICE';
}

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
  lines.push('MASTERY SUMMARY');
  Object.keys(report.masterySummary).forEach(type =>
    lines.push(`${type.padEnd(10)}: ${report.masterySummary[type]} / ${report.totalStages}`));
  lines.push('');
  lines.push('CHAPTER RESULTS (latest successful attempts)');
  report.chapters.forEach(ch =>
    lines.push(`${ch.title} [${ch.clearType || (ch.completed ? 'UNASSESSED' : 'UNCLEARED')}] — ${ch.statusLabel}`));
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
    this.xp = 0;
    this.cleared = new Array(STAGES.length).fill(false);
    this.timeLeft = 0;
    this.timerId = null;
    this.assistLevel = 0; // 0: 自力、1〜3: ヒント、4: 完成SQL
    this.mastery = this.loadMastery();
    this.solved = false;
    this.predicted = null;
    this.timedOut = false;
    this.tutorialActive = false;
    this.tutorialStep = -1;

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

    // ---- CH1限定: Story Clearタイプ記録 (ChapterSessionのChapterClearedイベントから書き込まれる) ----
    this.clearTypes = new Array(STAGES.length).fill(null);

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
      onRestart:     () => { sound.tap(); this.restart(); },
      onMissionDetail: () => this.openMissionDetail(),
      onNora:          ()    => this.openNoraLog(),
      onSuccessZone:   z     => this.toggleSuccessZone(z),
      onRelationSlot:   id => this.relationActivateSlot(id),
      onRelationSource: k  => this.relationSelectSource(k)
    });

    this.session = new ChapterSession('CH1');
    this._bindSession(this.session);

    this.muteBtn = document.createElement('button');
    this.muteBtn.type = 'button';
    this.muteBtn.id = 'muteBtn';
    this.muteBtn.addEventListener('click', () => this.toggleMute());
    document.getElementById('hud').appendChild(this.muteBtn);
    this.applyMuteState();

    this.resumeFromProgress();
    this.showCivisBoot(() => this.boot());

    // ---- UX Decoder (A/B) 専用テストフック。本番では window.__NEON_TEST_CONFIG__ が
    // 存在しないため一切有効化されない。ChapterSessionには触れず、Appの外側からのみ操作する。
    if(window.__NEON_TEST_CONFIG__?.enabled){
      window.__NEON_TEST__ = {
        forceTimeout: () => {
          this.stopTimer();
          this.timeLeft = 0;
          this.timeout();
        },
        jumpToEvidence: () => this._jumpToEvidenceForTest(),
        getPhase: () => document.body.dataset.phase,
        getWorkspace: () => document.body.dataset.workspace
      };
    }
  }

  // ---- UX Decoder B (契約監査) 専用: CH1の正解クエリを直接投入して EVIDENCE へジャンプする。
  // tapToken() を通すのは、実プレイと同じくカンマ自動挿入を経由させて正しいSQLを生成するため
  // (ChapterSession.addToken を直接叩くと自動カンマが入らず不正解判定になってしまう)。
  _jumpToEvidenceForTest(){
    const st = STAGES[0];
    const order = ['SELECT', 'resident_id', 'display_name', 'FROM', 'RESIDENT_CACHE',
      'WHERE', 'status', '=', "'MISSING'", 'AND', 'last_sector', '=', "'S4'"];
    order.forEach(text => {
      const tok = st.tokens.find(x => x.t === text);
      if(tok) this.tapToken(tok.t, tok.k);
    });
    this.session.submit();
    this.session.submitPrediction(3);
    this.executeRun();
  }

  // ---- Domainイベント → Presentation効果 (workspace切替・進捗保存) ----
  _bindSession(session){
    session.on('PhaseChanged', ({ to }) => {
      // UX Decoder (tools/ux-decoder-*.mjs) 専用の観測値。CSSからは参照しないこと。
      document.body.dataset.phase = to;
      if(this.stage === 0){
        document.body.dataset.workspace = WORKSPACE_BY_PHASE[to] || 'query';
      }
      // UX Decoder A (遷移監査) 専用の全遷移ログ。ChapterSession自体は公開しない。
      if(window.__NEON_TEST_CONFIG__?.enabled){
        window.__NEON_TEST_PHASE_LOG__ ??= [];
        window.__NEON_TEST_PHASE_LOG__.push({ phase: to, t: performance.now() });
      }
    });
    session.on('EvidenceRevealed', () => {
      // Effectsのみ。CH1の沈黙演出はexecuteRun内で処理済みのためここでは何もしない。
    });
    session.on('ChapterCleared', ({ clearType }) => {
      this.clearTypes[this.stage] = clearType;
      this.saveProgress();
    });
  }

  // ---- CIVIS FIELD CONSOLE 演出 (起動時1.5秒) ----
  showCivisBoot(cb){
    const el = document.getElementById('civisBoot');
    if(!el){ cb(); return; }
    el.classList.add('show');
    setTimeout(() => { el.classList.remove('show'); cb(); }, 1500);
  }

  // ---- 権限昇格ログ (CH1→CH2 遷移時1.5秒) ----
  showAuditLog(cb){
    const el = document.getElementById('auditLog');
    if(!el){ cb(); return; }
    el.classList.add('show');
    setTimeout(() => { el.classList.remove('show'); cb(); }, 1500);
  }

  // ---- 起動フロー: 初回のみオープニングを挟む ----
  boot(){
    let introSeen = false;
    try { introSeen = localStorage.getItem(INTRO_KEY) === 'true'; } catch(e){}
    const isFreshStart = this.stage === 0 && this.xp === 0 && this.cleared.every(c => !c);
    if(!introSeen && isFreshStart) this.showOpening();
    else this.load();
  }

  showOpening(){
    this.setBgm('title');
    this.ui.showStoryOverlay(OPENING, () => {
      try { localStorage.setItem(INTRO_KEY, 'true'); } catch(e){}
      this.ui.hideStoryOverlay();
      this.load();
    }, '▶ 第4アーカイブへ');
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
  loadMastery(){
    const records = {};
    try{
      const data = JSON.parse(localStorage.getItem(MASTERY_KEY));
      if(!data || typeof data !== 'object' || Array.isArray(data)) return records;
      STAGES.forEach((_, i) => {
        const key = chapterKey(i);
        const entry = data[key];
        if(entry && Number.isInteger(entry.assistLevel) && entry.assistLevel >= 0 &&
          entry.assistLevel <= 4 && entry.clearType === clearTypeForAssist(entry.assistLevel)){
          records[key] = { clearType: entry.clearType, assistLevel: entry.assistLevel };
        }
      });
    }catch(e){}
    return records;
  }

  recordMastery(clearType, assistLevel = this.assistLevel){
    // 各章の直近の正解を保存。リトライや新しい周回だけでは記録を消さない。
    // assistLevel は clearTypeForAssist(assistLevel) === clearType が常に成り立つ値を渡すこと
    // (loadMastery() の自己整合性チェックがこれを前提にしている)。
    this.mastery[chapterKey(this.stage)] = { clearType, assistLevel };
    try { localStorage.setItem(MASTERY_KEY, JSON.stringify(this.mastery)); } catch(e){}
  }

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
        xp: this.xp, stage: this.stage, cleared: this.cleared, clearTypes: this.clearTypes
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
      this.clearTypes = Array.isArray(saved.clearTypes) && saved.clearTypes.length === STAGES.length
        ? saved.clearTypes : new Array(STAGES.length).fill(null);
    } else {
      this.xp = 0;
      this.stage = 0;
      this.cleared = new Array(STAGES.length).fill(false);
      this.clearTypes = new Array(STAGES.length).fill(null);
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

  // ---- Step B: 互換用の読み取り専用ゲッター (setterは持たない) ----
  get built(){ return this.session.draft.tokens; }

  tapToken(t, k){
    if(this.isRelationStage()) return;
    if(this.solved || this.timedOut) return;
    sound.tap(); vibrate(8);

    const last = this.session.draft.tokens[this.session.draft.tokens.length - 1];
    const lastIsValue = last && (last.k === 'col' || last.k === 'func');
    const newIsValue  = (k === 'col' || k === 'func');
    if(lastIsValue && newIsValue){
      this.session.addToken({ t: ',', k: 'punct' });
    }
    this.session.addToken({ t, k });
    this.refreshMonitor();
    if(this.tutorialActive) this.advanceTutorial(t, k);
  }

  advanceTutorial(t, k){
    const next = this.tutorialStep + 1;
    const step = TUTORIAL.steps[next];
    if(!step || step.token !== t || step.kind !== k) return; // 手順から外れたタップは静かに無視
    this.tutorialStep = next;
    // 指示文は表示しない。ハイライトのみで次の一手を示す。
    const after = TUTORIAL.steps[next + 1];
    if(after) this.ui.highlightToken(after.token, after.kind);
    else this.ui.highlightRunButton();
  }

  util(a){
    if(this.isRelationStage()) return;
    if(this.solved || this.timedOut) return;
    sound.tap(); vibrate(8);
    if(a === 'comma') this.session.addToken({ t: ',', k: 'punct' });
    else if(a === 'undo'){ this.session.removeToken(); this.editCount++; }
    else if(a === 'br'){ this.session.addToken({ t: '\n', k: 'punct' }); this.editCount++; }
    else if(a === 'clear'){ this.session.clearDraft(); this.editCount++; }
    this.refreshMonitor();
  }

  refreshMonitor(){
    this.ui.renderMonitor(this.built);
    this.ui.setTokenStates(this.computeEnabled());
  }

  run(){
    if(this.timedOut) return;
    if(this.isRelationStage()){
      if(this.solved){ this.next(); return; }
      this.relationSubmit();
      return;
    }
    if(this.solved){ this.next(); return; }
    // CH1: 不正解後にUndoだけで直した draft もそのまま再実行できるようにする
    if(this.stage === 0 && this.session.phase === Phase.QUERY_REJECTED) this.session.resumeDrafting();
    if(this.session.phase === Phase.QUERY_DRAFTING){
      sound.tap();
      this.session.submit();
      const onCancel = this.stage === 0 ? () => this.session.cancelPrediction() : null;
      this.ui.showPredictBar(STAGES[this.stage].rowChoices, choice => this.onPredicted(choice), onCancel);
      return;
    }
    // AWAITING_QUERY (未入力) / QUERY_REJECTED (直前の不正解のまま未編集) では何もしない。
    // トークンをタップして draft を進めるか、retry で組み直すまで Run は無効。
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
    this.session.submitPrediction(choice);
    this.executeRun();
  }

  async executeRun(){
    if(this.solved || this.timedOut) return;
    this.ui.hidePredictBar();
    const st = STAGES[this.stage];
    const built = this.session.draft.tokens.map(x => x.t === '\n' ? ' ' : x.t).join(' ');
    // 実SQL実行（READ-ONLY）: 文字列一致ではなく、実データへ適用した結果で判定する。
    // これにより想定外だが正しい別解も受理される (docs/NEON_RELAY_FE_RTP_IMPLEMENTATION_ALIGNMENT.md)。
    const r = judgeByResult(built, st.resultSet, TABLES);
    const computed = r.result || st.resultSet;

    if(r.empty){
      sound.error();
      // Domain: 空クエリは「拒否」として扱い、QUERY_REJECTED へ戻して再入力できるようにする
      // (QUERY_EXECUTING のまま留まると addToken が永久にガードされ操作不能になるため)。
      this.session.reject('empty_query');
      this.ui.setFeedback('クエリが空です。トークンをタップして組み立てよう。','ng');
      return;
    }

    if(r.ok){
      this.stopTimer();
      this.solved = true;
      if(this.tutorialActive){
        this.tutorialActive = false;
        try { localStorage.setItem(TUTORIAL_KEY, 'true'); } catch(e){}
        this.ui.hideTutorial();
        this.ui.clearTokenHighlight();
      }

      // Domain: reject ではなく evidence へ（実行結果は実計算値を渡す）
      this.session.recordExecution({ built, resultSet: computed, at: Date.now() });
      this.session.revealEvidence({ rows: computed.rows, sourceQuery: built, significance: null });
      this.lastResult = computed;
      this.lastBuiltSql = built;

      if(this.stage === 0){
        // Effects (CH1限定の沈黙演出)。Domainはこの演出を知らない。
        this.ui.renderResultSet(computed);
        this.ui.setFeedback('', '');
        this.ui.setRunDisabled(true);
        this.ui.setProtagonist('thinking');
        // 本番は常に800ms固定。UX Decoderのテストモードでのみ延長できる(既定値は変えない)。
        const silenceMs = window.__NEON_TEST_CONFIG__?.enabled
          ? (window.__NEON_TEST_CONFIG__.evidenceSilenceMs ?? 800)
          : 800;
        await new Promise(r => setTimeout(r, silenceMs));
        this.session.clear();
        this.finishCorrect(st);
      } else {
        this.session.clear();
        this.finishCorrect(st);
      }
    } else {
      sound.error(); vibrate([20,50,20]);
      this.executionErrors++;
      const errorType = classifyConceptError(built, st);
      if(errorType) this.errorTypes[errorType]++;
      this.session.reject(r.error ? 'sql_error' : 'sql_mismatch');
      this.lastSqlError = r.error || null;
      if(this.stage === 0) this._handleReject();
      else {
        this.ui.setFeedback(r.error
          ? `❌ 実行できません… ${r.error}`
          : '❌ 不正解… FROM → WHERE → GROUP BY → HAVING → SELECT の順を思い出そう。', 'ng');
        this.ui.showRetryButton();
      }
    }
  }

  // ---- 正解演出（CH1では0.8秒の沈黙後に呼ばれる。他章は即時） ----
  finishCorrect(st){
    sound.success(); vibrate([15,40,15,40,60]);
    this.playVictory();
    const bonus = this.timeLeft * 2;
    const predictOk = this.predicted === st.resultSet.rows.length;
    // CH1: 支援状態のSource of TruthはChapterSession.assistanceLevel/clearType。
    // App.assistLevel (Hintボタンの表示用ミラー) は評価には使わない。
    // CH2以降: 既存どおり clearTypeForAssist(this.assistLevel) を使用(仕様は変更しない)。
    const clearType = this.stage === 0
      ? mapSessionClearType(this.session.clearType)
      : clearTypeForAssist(this.assistLevel);
    const assistLevelForRecord = this.stage === 0 ? this.session.assistanceLevel : this.assistLevel;
    const fullGain = 100 + bonus + (predictOk ? 30 : 0);
    const gain = clearType === 'MASTERED' ? fullGain :
      (clearType === 'ASSISTED' ? Math.round(fullGain / 2) : 0);
    this.xp += gain;
    this.cleared[this.stage] = true;
    this.recordMastery(clearType, assistLevelForRecord);
    this.saveProgress();
    this.ui.setHud(this.stage, STAGES.length, this.xp);
    const feedback = {
      MASTERED: `✅ MASTERED — 自力で完全正解。+${gain} XP`,
      ASSISTED: `✅ CLEAR — ヒント使用。+${gain} XP（MASTERED未達）`,
      PRACTICE: '◯ PRACTICE — 模範解答を確認。XP加算なし'
    };
    this.ui.setFeedback(feedback[clearType], 'ok');
    this.ui.hideRetryButton();
    this.ui.lockPad();
    this.ui.markSolved(this.stage === STAGES.length - 1);
    this.ui.setRunDisabled(false);
    if(this.stage === 0){
      this.ui.setProtagonist('idle');
      this.ui.setRunLabel('▶ 続ける');
    }
    // ---- 成功画面を3領域へ再構成する（Presentationのみ。進行は既存のまま） ----
    this.successZone = 'result';     // 成功直後は RESULT/EVIDENCE を開く
    this.commUnread = !!st.reveal;   // 会話は任意閲覧。未読マークを出す
    document.body.dataset.workspace = 'success';
    this.ui.hideResultSet();
    this.ui.hideAltAnswers();
    this.ui.hideReveal();
    this.ui.setRunLabel(this.stage === STAGES.length - 1 ? '▶ 次へ' : '▶ 次の照会へ');
    this.renderSuccess(clearType, gain);
  }

  // ---- 成功画面 ----
  successView(clearType, gain){
    const st = STAGES[this.stage];
    const clearNote = {
      MASTERED: '自力で完全正解',
      ASSISTED: 'ヒント使用（MASTERED未達）',
      PRACTICE: '模範解答を確認 / XP加算なし'
    };
    return {
      missionTitle: st.level,
      problem: st.prompt,
      // 2表・3表問題でも全source tableをZONE 1へ収める
      tables: (st.tables || []).map(name => Object.assign({ name }, TABLES[name])),
      executedSql: this.lastBuiltSql || st.answers[0],
      result: this.lastResult || st.resultSet,
      alternatives: (st.answers || []).slice(1),
      clearType,
      clearNote: clearType === 'PRACTICE' ? clearNote[clearType] : `${clearNote[clearType]} / +${gain} XP`,
      dialogue: this.successDialogue(st),
      commUnread: this.commUnread,
      openZone: this.successZone
    };
  }

  // Story Beatを話者つきの会話として渡す。本文はst.revealのまま（Story変更なし）。
  successDialogue(st){
    if(!st.reveal) return { lines: [], terminal: [] };
    const lines = String(st.reveal.text || '').split(String.fromCharCode(10))
      .map(t => t.trim()).filter(Boolean)
      .map(t => {
        const quoted = /^[「『]/.test(t);
        return { speaker: quoted ? 'NORA' : '', text: t };
      });
    return { lines, terminal: st.reveal.terminal || [] };
  }

  renderSuccess(clearType, gain){
    this._lastClear = { clearType, gain };
    this.ui.renderSuccess(this.successView(clearType, gain));
  }

  toggleSuccessZone(zone){
    if(!this._lastClear) return;
    sound.tap(); vibrate(8);
    // ONE-OPEN: 開いているものを閉じ、指定Zoneだけを開く
    this.successZone = this.successZone === zone ? null : zone;
    if(zone === 'comm' && this.successZone === 'comm') this.commUnread = false;
    this.renderSuccess(this._lastClear.clearType, this._lastClear.gain);
  }

  // ---- CH1限定: Domainの rejectionCount に応じた段階ヒント ----
  // (Story Clearタイプ自体は ChapterSession._resolveClearType が assistanceLevel から判定する)
  _handleReject(){
    const n = this.session.rejectionCount;
    const st = STAGES[this.stage];
    this.ui.setProtagonist('thinking');

    let text, code = '';
    if(n === 1){
      text = '❌ 不正解… FROM → WHERE → GROUP BY → HAVING → SELECT の順を思い出そう。';
    } else if(n === 2){
      text = 'WHEREは行を絞る句です';
    } else if(n === 3){
      text = 'SELECT → FROM → WHERE の順で組み立てます';
    } else if(n === 4){
      // 実際に穴あき/構造支援を見せた回だけ、Domainの支援状態をASSISTED相当へ引き上げる。
      this.session.markPartialAssistanceShown();
      text = '❌ 不正解… 構造ヒントを確認しよう。';
      code = st.hint2;
      this.ui.showHint(st.hint2, '構造ヒント');
    } else {
      // 完成SQLを見せた回は、失敗回数に関わらずPRACTICE相当へ確定させる。
      this.session.markFullAnswerShown();
      text = '❌ 不正解… 模範形を確認しよう。';
      code = st.answers[0];
      this.ui.showHint(st.answers[0], '模範解答');
    }
    this.ui.setFeedback(text, 'ng');
    this.ui.showRetryButton();
    this.ui.openSheet({
      badge: `REJECTED ×${n}`, text, code,
      primary: { label: '修正する' },
      secondary: { label: '全消去', onClick: () => this.retryStage() }
    });
  }

  // ---- 🗣 NORA LOG: キャラクター/世界内AIのセリフはボタンでのみ表示する ----
  // 解答中の画面には常設しない（Query workspaceの高さを消費しない一時Overlayを使う）。
  openNoraLog(){
    sound.tap(); vibrate(8);
    const st = STAGES[this.stage];
    // NORAはCONTEXT(どの表に何があるか)を話す。MISSION(prompt)は再掲しない。
    let text;
    if(this.isRelationStage() && this.relation){
      const task = this.relation.task;
      text = this.solved
        ? `${task.storyContext}

「${task.evidence.nora}」`
        : task.storyContext;
    } else if(this.stage === 0 && !this.cleared[0]){
      text = `「${TUTORIAL.intro}」

${st.note || ''}`.trim();
    } else {
      text = st.note || '';
    }
    this.ui.openSheet({ badge: '🗣 NORA', text, primary: { label: '閉じる' } });
  }

  // ---- CH1: 1行Missionの詳細はシートで一時表示 ----
  openMissionDetail(){
    if(this.stage !== 0) return;
    sound.tap();
    this.ui.openSheet({ badge: 'MISSION', text: STAGES[0].prompt, primary: { label: '閉じる' } });
  }

  hint(){
    if(this.solved) return;
    if(this.isRelationStage()){ this.relationHint(); return; }
    bgm.duck(1500);
    sound.tap(); vibrate(8);
    this.assistLevel = Math.min(4, this.assistLevel + 1);
    // CH1: 手動Hintも必ずDomain側(ChapterSession.assistanceLevel)を更新する。
    // App.assistLevel はUI表示(ボタン文言・ヒント内容の添字)用のミラーとしてのみ残し、
    // CH1の評価判定には使わない(Source of TruthはChapterSession側)。
    if(this.stage === 0) this.session.requestHint();
    const st = STAGES[this.stage];
    const hints = [null, st.hint1, st.hint2, st.skeleton, st.answers[0]];
    const labels = ['', '概念ヒント', '構造ヒント', '穴あきSQL', '完成SQL'];
    this.ui.setAssistLevel(this.assistLevel);
    this.ui.showHint(hints[this.assistLevel], labels[this.assistLevel]);
    const feedback = this.assistLevel === 4
      ? '💡 NORAの完成SQLを表示。正解時はPRACTICE（XP0）。'
      : (this.assistLevel === 3
        ? '💡 穴あきSQLを表示。次は完成SQL（PRACTICE・XP0）。'
        : `💡 ${labels[this.assistLevel]}を表示。正解時はASSISTED（XP半額）。`);
    this.ui.setFeedback(feedback, '');
    if(this.stage === 0){
      const level = this.assistLevel;
      const isSql = level >= 3;
      this.ui.openSheet({
        badge: `💡 ${labels[level]}`,
        text: isSql ? feedback : `${hints[level]}\n\n${feedback}`,
        code: isSql ? hints[level] : '',
        primary: { label: '閉じる' },
        secondary: { label: '評価順', onClick: () => this.order() }
      });
    }
  }

  order(){
    if(this.isRelationStage()) return; // 評価順ドロワーはSQL Query専用
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
    this.ui.openStageDrawer(STAGES, this.stage, this.cleared, i => this.selectStage(i), DEBUG_ALL_STAGES);
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
    if(this.isRelationStage()) return;
    this.setBgm('urgent');
    sound.error(); vibrate([25,60,25]);
    this.timedOut = true;
    if(this.stage === 0) this.ui.setProtagonist('defeated');
    if(this.tutorialActive){ this.tutorialActive = false; this.ui.hideTutorial(); this.ui.clearTokenHighlight(); }
    this.ui.disableForTimeout();
    this.ui.setFeedback('⏰ 時間切れ… 模範形を確認して再度挑戦。','ng');
    this.assistLevel = 4;
    this.ui.setAssistLevel(this.assistLevel);
    // CH1: 完成SQLを見せた瞬間にDomain側もPRACTICE相当へ確定させる(Retryしても戻らない)。
    if(this.stage === 0) this.session.markFullAnswerShown();
    this.ui.showHint(STAGES[this.stage].answers[0]);
    this.ui.showRetryButton();
    if(this.stage === 0){
      this.ui.openSheet({
        badge: '⏰ TIMEOUT',
        text: '時間切れ。模範形を確認して再度挑戦。（このクリアはPRACTICE扱い）',
        code: STAGES[0].answers[0],
        primary: { label: 'やり直す', onClick: () => this.retryStage() },
        dismissible: false
      });
    }
  }

  // ================= RELATION TASK (Q1 Vertical Slice) =================
  // SQL Query Taskとは別のInteractionだが、別モードではない。
  // ChapterSession(Query Domain)は変更せず、RelationTaskSessionが自前のphaseを持つ。
  isRelationStage(){
    const st = STAGES[this.stage];
    return !!st && st.interactionKind === 'RELATION_FILL';
  }

  loadRelationTask(){
    const st = STAGES[this.stage];
    const task = getRelationTask(st.relationTaskId);
    this.relation = new RelationTaskSession(task);
    this.relationActiveSlotId = null;   // Presentation専用状態（Domainには持たせない）
    this.solved = false;
    this.timedOut = false;
    this.assistLevel = 0;
    // 他章から跳んできた場合に前の章のカウントダウンが走り続けないようにする
    this.stopTimer();
    this.ui.setTimerIdle();

    this.relation.on('PhaseChanged', ({ to }) => {
      document.body.dataset.phase = to;
      // Relation Taskの結果画面はQuery Evidenceと分離する（SQL compose UIへ戻さない）
      document.body.dataset.workspace =
        (to === RelationPhase.EVIDENCE_REVEALED) ? 'relation-evidence' : 'relation';
    });

    this.ui.setCh1Layout(false);
    document.body.dataset.workspace = 'relation';
    document.body.dataset.phase = this.relation.phase;
    this.ui.showRelationWorkspace(true);
    this.ui.hideSuccess();
    this.ui.closeSheet();
    this.ui.hideHint();
    this.ui.hideRetryButton();
    this.ui.hideResultSet();
    this.ui.hideAltAnswers();
    this.ui.hideReveal();
    this.ui.hideTutorial();
    this.ui.hidePredictBar();
    this.ui.enableAfterTimeout();
    this.ui.setProtagonist('hidden');
    this.ui.setMission(task.level, task.prompt);
    this.ui.renderSchema([]);
    this.ui.renderTokens([]);
    this.ui.setHud(this.stage, STAGES.length, this.xp);
    this.ui.setRunDisabled(false);
    this.ui.resetRunBtn();
    this.ui.setRunLabel('▶ 復元内容を検証');
    this.ui.setAssistLevel(0);
    this.ui.setFeedback('', '');
    this.relation.beginSolving();
    this.renderRelation();
    this.setBgm(CHAPTER_BGM[this.stage] || 'title');
  }

  relationView(){
    const task = this.relation.task;
    const slot = task.slots.find(s => s.id === this.relationActiveSlotId) || task.slots[0];
    const rel = slot.relation;
    const tables = buildRelationTables(task, TABLES);

    const targetTable = tables.find(t => t.name === slot.target.table);
    const targetRow = targetTable.rows.find(r => r[0] === slot.target.rowKey) || [];
    const targetFields = targetTable.cols.map((col, i) => ({
      col,
      value: targetRow[i],
      isSlot: col === slot.target.col,
      slotId: slot.id
    }));

    // 照合キーは「値」を主役にし、列の対応はラベル（短い語）で示す
    const labelOf = col => col.replace(/_id$/, '').replace(/_at$/, '')
      .replace('terminal', 'terminal').replace('received', 'time');
    const keyStrip = rel.keys.map(k => ({
      label: labelOf(k.targetCol),
      value: targetRow[targetTable.cols.indexOf(k.targetCol)]
    }));

    // Presentation State（Domainのphaseは変更しない）
    const selectedSource = this.relation.sources[slot.id] || null;
    const match = this.relation.matchOf(slot.id);
    const state = this.solved ? 'done'
      : (selectedSource ? 'match' : (this.relationActiveSlotId ? 'select' : 'target'));

    // MATCH成立前は復元確定扱いにしない。
    // preview: 選択中sourceの値（neutral表示） / reconstructed: 確定した復元値（緑）
    const derived = this.relation.answers[slot.id] || null;
    const committed = !!(match && match.allMatch);
    const reconstructedValue = committed ? derived : null;
    const previewValue = committed ? null : derived;

    return {
      taskId: task.id,
      state,
      slots: task.slots,
      slotLabel: slot.label,
      answers: this.relation.answers,
      activeSlotId: this.relationActiveSlotId,
      targetTable: slot.target.table,
      targetRowKey: slot.target.rowKey,
      targetFields,
      keyStrip,
      sourceTable: tables.find(t => t.name === rel.sourceTable),
      canonTable: tables.find(t => t.canon) || null,
      selectedSource,
      match,
      previewValue,
      reconstructedValue,
      sourceCols: tables.find(t => t.name === rel.sourceTable).cols,
      sourceRow: selectedSource
        ? (tables.find(t => t.name === rel.sourceTable).rows.find(r => r[0] === selectedSource) || null)
        : null,
      relationRules: rel.keys.map(k =>
        `${slot.target.table}.${k.targetCol} = ${rel.sourceTable}.${k.sourceCol}`)
        .concat(`復元値: ${rel.sourceTable}.${rel.valueCol}`)
    };
  }

  renderRelation(){ this.ui.renderRelationTask(this.relationView()); }

  relationActivateSlot(slotId){
    if(!this.relation || this.solved) return;
    sound.tap(); vibrate(8);
    this.relationActiveSlotId = this.relationActiveSlotId === slotId ? null : slotId;
    this.renderRelation();
    if(this.relationActiveSlotId){
      const rel = this.relation.task.slots.find(s => s.id === slotId).relation;
      this.ui.setFeedback(`${rel.sourceTable} から、対応する行を選ぼう。`, '');
    }
  }

  // プレイヤーが source 表の行を選ぶ。復元値はその行から導出される（候補選択ではない）。
  relationSelectSource(sourceRowKey){
    if(!this.relation || this.solved) return;
    const slotId = this.relationActiveSlotId;
    if(!slotId) return;
    sound.tap(); vibrate(8);
    if(!this.relation.selectSource(slotId, sourceRowKey, TABLES)) return;
    this.editCount++;
    this.renderRelation();
    const m = this.relation.matchOf(slotId);
    if(m && m.allMatch){
      this.ui.setFeedback(`${sourceRowKey} が対応。${m.valueCol} から復元値が決まった。`, '');
    } else {
      // 答えは言わない。何が一致していないかだけを示す。
      const ng = m.keys.filter(k => !k.match).map(k => k.targetCol).join(' / ');
      this.ui.setFeedback(`${sourceRowKey} は対応していない（${ng} が不一致）。`, 'ng');
    }
  }

  relationSubmit(){
    if(!this.relation || this.solved) return;
    if(!this.relation.isComplete()){
      sound.error();
      this.ui.setFeedback('まだ復元できていない。欠損セルを選び、対応する行を照合しよう。', 'ng');
      return;
    }
    if(this.relation.phase === RelationPhase.RELATION_REJECTED) this.relation.beginSolving();
    if(!this.relation.submit()) return;

    const r = evaluateRelation(this.relation.task, this.relation.answers);
    if(r.ok){
      this.solved = true;
      this.stopTimer();
      this.relation.clear();
      this.relation.revealEvidence();
      this.finishRelationCorrect();
    } else {
      sound.error(); vibrate([20, 50, 20]);
      this.executionErrors++;
      this.relation.reject('relation_mismatch');
      // 復元対象は選択したままにする。そうしないと拒否後に行を選び直せなくなる。
      this.renderRelation();
      const n = this.relation.attemptCount;
      // 「違います」で終わらせない。ただし答えも言わない。
      const guide = n === 1
        ? '選んだ行の照合キーが、E442 の値と一致しているか確認してください。'
        : this.relation.task.hints[Math.min(n - 1, this.relation.task.hints.length - 1)];
      this.ui.setFeedback(`❌ 一致しません。${guide}`, 'ng');
      this.ui.showRetryButton();
    }
  }

  finishRelationCorrect(){
    sound.success(); vibrate([15, 40, 15, 40, 60]);
    this.playVictory();
    const clearType = this.relation.clearType === 'INDEPENDENT' ? 'MASTERED' : 'ASSISTED';
    const gain = clearType === 'MASTERED' ? 100 : 50;
    this.xp += gain;
    this.cleared[this.stage] = true;
    this.recordMastery(clearType, this.relation.assistanceLevel);
    this.saveProgress();
    this.ui.setHud(this.stage, STAGES.length, this.xp);
    this.relationActiveSlotId = null;
    this.ui.hideRetryButton();
    // Relation専用のEvidence表示（SQL monitor / token pad / utility は出さない）
    this.ui.showRelationWorkspace(true);
    this.renderRelation();
    this.ui.setFeedback(clearType === 'MASTERED'
      ? `✅ 復元完了 — 自力で対応関係を特定。+${gain} XP`
      : `✅ 復元完了 — ヒント使用。+${gain} XP`, 'ok');
    this.ui.markSolved(this.stage === STAGES.length - 1);
    this.ui.setRunLabel(this.stage === STAGES.length - 1 ? '📁 記録の続きを見る' : '▶ 続ける');
  }

  relationHint(){
    if(!this.relation || this.solved) return;
    bgm.duck(1500);
    sound.tap(); vibrate(8);
    const text = this.relation.requestHint();
    if(!text) return;
    this.assistLevel = Math.min(4, this.relation.assistanceLevel);
    this.ui.setAssistLevel(Math.min(4, this.relation.assistanceLevel));
    this.ui.showHint(text, '関係のヒント');
    this.ui.setFeedback(`💡 ヒントを表示。正解時はASSISTED（XP半額）。`, '');
  }

  load(){
    const st = STAGES[this.stage];
    if(st && st.interactionKind === 'RELATION_FILL'){
      this.loadRelationTask();
      return;
    }
    this.ui.showRelationWorkspace(false);
    this.ui.hideRelationTask();
    this.relation = null;
    this.ui.hideSuccess();
    this.successZone = null;
    this._lastClear = null;
    this.lastBuiltSql = null;
    // Domain: 同じ章のやり直し(retry)は draft だけ空にして継続する。
    // CHAPTER_CLEARED から先(次の章へ進む/選び直す)は clearDraft() 自体がガードで false を返すため、
    // その時だけ新しい ChapterSession を作り直す。
    if(!this.session.clearDraft()){
      this.session = new ChapterSession('CH' + (this.stage + 1));
      this._bindSession(this.session);
    }
    this.assistLevel = 0;
    this.solved = false;
    this.predicted = null;
    this.timedOut = false;
    this.rowPredictionRecorded = false;
    this.ui.setProtagonist(this.stage === 0 ? 'idle' : 'hidden');
    this.ui.closeSheet();
    this.ui.setCh1Layout(this.stage === 0);
    if(this.stage === 0){
      document.body.dataset.workspace = WORKSPACE_BY_PHASE[this.session.phase] || 'query';
      this.ui.setMissionBrief(st.brief);
    }

    this.ui.hideHint();
    this.ui.setAssistLevel(this.assistLevel);
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
    this.ui.setFeedback('', '');
    this.refreshMonitor();
    this.startTimer();
    this.setBgm(CHAPTER_BGM[this.stage] || 'title');

    let tutorialSeen = false;
    try { tutorialSeen = localStorage.getItem(TUTORIAL_KEY) === 'true'; } catch(e){}
    this.tutorialActive = this.stage === 0 && !this.cleared[0] && !tutorialSeen;
    this.tutorialStep = -1;
    if(this.tutorialActive){
      // セリフは画面に常設しない。🗣ボタンから任意で読める（openNoraLog）。
      // 誘導は指示文ではなくトークンのハイライトだけで行う。
      this.ui.highlightToken(TUTORIAL.steps[0].token, TUTORIAL.steps[0].kind);
    } else {
      this.ui.hideTutorial();
      this.ui.clearTokenHighlight();
    }
  }

  next(){
    if(this.stage < STAGES.length - 1){
      const wasCh1 = this.stage === 0;
      this.stage++;
      if(wasCh1) this.showAuditLog(() => this.load());
      else this.load();
    }
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
    const chapters = STAGES.map((st, i) => {
      const entry = this.mastery[chapterKey(i)];
      return {
        id: chapterKey(i), title: st.chapterTitle, skill: SKILL_LABELS[i],
        completed: !!this.cleared[i],
        clearType: entry ? entry.clearType : null,
        assistLevel: entry ? entry.assistLevel : null,
        statusLabel: entry ? CLEAR_TYPE_LABELS[entry.clearType] :
          (this.cleared[i] ? '支援状況未測定' : '未クリア')
      };
    });
    const masterySummary = { MASTERED: 0, ASSISTED: 0, PRACTICE: 0 };
    chapters.forEach(ch => { if(ch.clearType) masterySummary[ch.clearType]++; });
    return {
      date: new Date().toISOString().slice(0, 10),
      clearedCount: this.cleared.filter(Boolean).length,
      totalStages: STAGES.length,
      chapters, masterySummary,
      mastered: chapters.filter(ch => ch.clearType === 'MASTERED').map(ch => ch.skill),
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
    this.clearTypes = new Array(STAGES.length).fill(null);
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
