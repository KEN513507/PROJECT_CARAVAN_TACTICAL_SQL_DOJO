// js/ui.js
import { TABLES } from './data.js?v=20260915-sprint2';

const $ = id => document.getElementById(id);

function esc(s){
  return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' })[c]);
}

export class UIManager {
  constructor(handlers){
    this.h = handlers;
    this.el = { app: $('app') };
    this._build();
  }

  _build(){
    this.el.app.innerHTML = `
      <header id="hud">
        <button type="button" id="stageLabel">STAGE 1/5</button>
        <div class="progress"><div id="progressFill"></div></div>
        <span id="timer">⏱ 60s</span>
        <span id="xp">XP 0</span>
      </header>
      <section id="schemaPanel"></section>
      <section id="mission">
        <div id="missionLevel"></div>
        <div id="missionText"></div>
      </section>
      <div id="tutorialPanel"></div>
      <section id="monitorWrap">
        <div id="monitor"></div>
        <div id="hintLine"></div>
      </section>
      <div id="resultPanel"></div>
      <div id="altPanel"></div>
      <div id="revealPanel"></div>
      <div id="predictBar">
        <div class="predict-bar-title">🔮 予測: 何行返る?</div>
        <div id="predictChoices"></div>
      </div>
      <div id="feedback"></div>
      <button type="button" id="retryBtn">🔄 このステージをやり直す</button>
      <div id="utilBar">
        <button class="util" data-util="comma">, カンマ</button>
        <button class="util" data-util="undo">⌫ 1語削除</button>
        <button class="util" data-util="br">↵ 改行</button>
        <button class="util" data-util="clear">✕ 全消去</button>
      </div>
      <div id="tokenPad"></div>
      <div id="actionBar">
        <button id="hintBtn" class="act act-hint">💡 ヒントを見る</button>
        <button id="orderBtn" class="act act-order">🔍 評価順</button>
        <button id="runBtn" class="act act-run">▶ 実行 &amp; 検証</button>
      </div>
      <div id="backdrop" class="scrim"></div>
      <div id="drawer" class="drawer-sheet">
        <div class="drawer-top">
          <div class="drawer-handle"></div>
          <div id="drawerTitle" class="drawer-title">🔍 評価順エクスプローラー</div>
        </div>
        <div id="drawerBody"></div>
        <button id="drawerClose" class="drawer-close">閉じる</button>
      </div>
      <div id="stageBackdrop" class="scrim"></div>
      <div id="stageDrawer" class="drawer-sheet">
        <div class="drawer-top">
          <div class="drawer-handle"></div>
          <div class="drawer-title">🗺 ステージセレクト</div>
        </div>
        <div id="stageDrawerBody"></div>
        <button id="stageDrawerClose" class="drawer-close">閉じる</button>
      </div>
      <div id="result">
        <div id="resultScroll">
          <div class="result-badge">🎓</div>
          <h2>MASTERY REPORT</h2>
          <p class="result-sub">支援状況を含む、照会の学習記録。</p>

          <section class="report-block">
            <h3 class="report-title">📋 CHAPTER RESULTS（最新のクリア記録）</h3>
            <ul id="chapterResults" class="mastered-list"></ul>
            <div id="masterySummary" class="row-prediction-line"></div>
          </section>

          <section class="report-block">
            <h3 class="report-title">✅ WHAT YOU MASTERED</h3>
            <ul id="masteredList" class="mastered-list"></ul>
            <div id="rowPredictionLine" class="row-prediction-line"></div>
          </section>

          <section class="report-block">
            <h3 class="report-title">📘 REAL FE CHALLENGE</h3>
            <div id="examSourceLabel" class="exam-source"></div>
            <div id="examQuestion" class="exam-question"></div>
            <div id="examChoices" class="exam-choices"></div>
            <div id="examResultLine" class="exam-result-line"></div>
          </section>

          <section class="report-block">
            <h3 class="report-title">🎯 NEXT MISSION</h3>
            <div id="nextMissionText" class="next-mission-text"></div>
          </section>

          <section class="report-block">
            <h3 class="report-title">📄 修了証（コピー可能）</h3>
            <textarea id="certificateText" class="certificate-text" readonly rows="20"></textarea>
          </section>

          <div id="sessionXpLine" class="session-xp-line"></div>
          <button id="restartBtn" class="act act-run" style="width:100%;margin-top:14px;">↺ もう一度挑戦</button>
        </div>
      </div>
      <div id="storyOverlay">
        <div id="storyOverlayScroll">
          <h2 id="storyOverlayTitle">CHAPTER 5　透明都市</h2>
          <div id="storyOverlayBody"></div>
          <button id="storyContinueBtn" class="act act-run" style="width:100%;margin-top:14px;">監査完了 ─ 結果を見る</button>
        </div>
      </div>`;

    ['stageLabel','progressFill','timer','xp','schemaPanel','missionLevel','missionText','tutorialPanel',
     'monitor','hintLine','resultPanel','altPanel','revealPanel','feedback','retryBtn','utilBar','tokenPad','runBtn','hintBtn','orderBtn',
     'backdrop','drawer','drawerTitle','drawerBody','drawerClose',
     'stageBackdrop','stageDrawer','stageDrawerBody','stageDrawerClose',
     'predictBar','predictChoices',
     'result','resultScroll','masteredList','chapterResults','masterySummary','rowPredictionLine',
     'examSourceLabel','examQuestion','examChoices','examResultLine',
     'nextMissionText','certificateText','sessionXpLine','restartBtn',
     'storyOverlay','storyOverlayTitle','storyOverlayBody','storyContinueBtn'].forEach(k => { this.el[k] = $(k); });

    this._wire();
  }

  _wire(){
    const h = this.h;
    this.el.utilBar.addEventListener('click', e => {
      const b = e.target.closest('.util'); if(!b) return;
      h.onUtil(b.getAttribute('data-util'));
    });
    this.el.runBtn.addEventListener('click', () => h.onRun());
    this.el.hintBtn.addEventListener('click', () => h.onHint());
    this.el.orderBtn.addEventListener('click', () => h.onOrder());
    this.el.drawerClose.addEventListener('click', () => h.onCloseDrawer());
    this.el.backdrop.addEventListener('click', () => h.onCloseDrawer());
    this.el.restartBtn.addEventListener('click', () => h.onRestart());
    this.el.retryBtn.addEventListener('click', () => h.onRetry());
    this.el.stageLabel.addEventListener('click', () => h.onOpenStages());
    this.el.stageDrawerClose.addEventListener('click', () => h.onCloseStageDrawer());
    this.el.stageBackdrop.addEventListener('click', () => h.onCloseStageDrawer());
    this.el.storyContinueBtn.addEventListener('click', () => {
      if(this._storyContinueCb) this._storyContinueCb();
    });
  }

  renderSchema(tables){
    let html = '';
    for(const name of tables){
      const tb = TABLES[name];
      if(!tb) continue;
      const head = tb.cols.map(c => `<th>${esc(c)}</th>`).join('');
      const body = tb.rows.map(r => '<tr>' + r.map((v,i) =>
        `<td class="${tb.keys.indexOf(tb.cols[i]) !== -1 ? 'pk' : ''}">${esc(v)}</td>`).join('') + '</tr>').join('');
      html += `<div class="schema-card"><h4>📋 ${esc(name)} 表</h4>
        <table class="mini"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
    }
    this.el.schemaPanel.innerHTML = html;
  }

  renderTokens(tokens){
    const groups = {
      clause: { label:'句 (CLAUSES)', items:[] },
      func:   { label:'関数・演算子 (FUNCTIONS & OPERATORS)', items:[] },
      op:     { label:'関数・演算子 (FUNCTIONS & OPERATORS)', items:[] },
      table:  { label:'テーブル名 (TABLES)', items:[] },
      col:    { label:'列名・値 (COLUMNS & LITERALS)', items:[] },
      lit:    { label:'列名・値 (COLUMNS & LITERALS)', items:[] }
    };
    const merge = { op:'func', lit:'col', and:'clause', as:'clause', alias:'col' };
    tokens.forEach(t => { const gk = merge[t.k] || t.k; if(groups[gk]) groups[gk].items.push(t); });

    let html = '';
    ['clause','func','table','col'].forEach(gk => {
      const g = groups[gk];
      if(!g.items.length) return;
      html += `<div class="token-group"><div class="group-label">${g.label}</div><div class="token-row">`;
      g.items.forEach(t => {
        html += `<button type="button" class="tok tok-${t.k}" data-token="${esc(t.t)}" data-kind="${t.k}">${esc(t.t)}</button>`;
      });
      html += '</div></div>';
    });
    this.el.tokenPad.innerHTML = html;
    this.el.tokenPad.classList.remove('locked');

    this.el.tokenPad.querySelectorAll('.tok').forEach(b => {
      b.addEventListener('click', () => this.h.onToken(b.getAttribute('data-token'), b.getAttribute('data-kind')));
    });
  }

  setTokenStates(enabledSet){
    this.el.tokenPad.querySelectorAll('.tok').forEach(b => {
      const key = b.getAttribute('data-token') + '|' + b.getAttribute('data-kind');
      b.disabled = !enabledSet.has(key);
    });
  }

  renderMonitor(built){
    if(!built.length){
      this.el.monitor.innerHTML = '<span class="placeholder">下のトークンをタップして、クエリを組み立てよう…</span>';
      return;
    }
    let html = '';
    built.forEach((tok, i) => {
      if(tok.t === '\n'){ html += '<br>'; return; }
      html += `<span class="tk tk-${tok.k}">${esc(tok.t)}</span>`;
      const next = built[i+1];
      if(next && next.t !== '\n' && next.t !== ',') html += ' ';
    });
    html += '<span class="caret"></span>';
    this.el.monitor.innerHTML = html;
    this.el.monitor.scrollTop = this.el.monitor.scrollHeight;
  }

  setFeedback(text, cls){ this.el.feedback.textContent = text; this.el.feedback.className = cls || ''; }
  setMission(level, prompt){ this.el.missionLevel.textContent = level; this.el.missionText.textContent = prompt; }
  setHud(stage, total, xp){
    this.el.stageLabel.textContent = `CASE 53 ─ CH.${stage+1}/${total}`;
    this.el.progressFill.style.width = ((stage+1)/total*100) + '%';
    this.el.xp.textContent = 'XP ' + xp;
  }
  setTimer(sec){
    this.el.timer.textContent = '⏱ ' + sec + 's';
    this.el.timer.classList.toggle('warn', sec <= 10);
  }

  setAssistLevel(level){
    const labels = ['ヒントを見る', 'さらにヒント', '構造を見る', '穴あきSQLを見る', '模範解答'];
    const next = ['概念ヒント', '構造ヒント', '穴あきSQL', '完成SQL（PRACTICE・XP0）', '完成SQLを再表示'];
    this.el.hintBtn.textContent = '💡 ' + labels[level];
    this.el.hintBtn.dataset.assistLevel = String(level);
    this.el.hintBtn.title = '次の表示：' + next[level];
    this.el.hintBtn.setAttribute('aria-label', labels[level] + ' — ' + this.el.hintBtn.title);
  }
  showHint(text, label = '完成SQL'){
    this.el.hintLine.textContent = '💡 ' + label + ' : ' + text;
    this.el.hintLine.classList.add('show');
  }
  hideHint(){ this.el.hintLine.classList.remove('show'); this.el.hintLine.textContent = ''; }

  // ---- チュートリアル (CHAPTER 1 初回のみ・NORAの案内) ----
  showTutorial(text){
    this.el.tutorialPanel.innerHTML = `<div class="tutorial-badge">🗣 NORA（案内中）</div><div class="tutorial-text">${esc(text)}</div>`;
    this.el.tutorialPanel.classList.add('show');
  }
  hideTutorial(){
    this.el.tutorialPanel.classList.remove('show');
    this.el.tutorialPanel.innerHTML = '';
  }
  highlightToken(tokenText, kind){
    this.clearTokenHighlight();
    const safe = String(tokenText).replace(/"/g, '\\"');
    const btn = this.el.tokenPad.querySelector(`.tok[data-token="${safe}"][data-kind="${kind}"]`);
    if(btn) btn.classList.add('tutorial-target');
  }
  highlightRunButton(){
    this.clearTokenHighlight();
    this.el.runBtn.classList.add('tutorial-target');
  }
  clearTokenHighlight(){
    this.el.tokenPad.querySelectorAll('.tutorial-target').forEach(b => b.classList.remove('tutorial-target'));
    this.el.runBtn.classList.remove('tutorial-target');
  }

  // ---- 主人公スプライト (CH1のみ) ----
  setProtagonist(mood){
    const el = document.getElementById('protagonist');
    if(!el) return;
    if(mood === 'hidden'){ el.classList.remove('show'); return; }
    el.setAttribute('data-mood', mood);
    el.classList.add('show');
  }

  // ---- CH1正解後の沈黙演出用: 実行ボタンの一時無効化 ----
  setRunDisabled(disabled){ this.el.runBtn.disabled = disabled; }

  lockPad(){ this.el.tokenPad.classList.add('locked'); }
  markSolved(isLast){
    this.el.runBtn.classList.add('solved');
    this.el.runBtn.textContent = isLast ? '📁 記録の続きを見る' : '▶ 次の照会へ';
  }
  resetRunBtn(){
    this.el.runBtn.classList.remove('solved');
    this.el.runBtn.textContent = '▶ 実行 & 検証';
  }

  openDrawer(title, steps){
    this.el.drawerTitle.textContent = title;
    this.el.drawerBody.innerHTML = steps.map((s,i) =>
      `<div class="step"><div class="step-num">${i+1}</div>
        <div><h5>${esc(s.k)}</h5><p>${esc(s.d)}</p></div></div>`).join('');
    this.el.drawerBody.scrollTop = 0;
    this.el.drawer.classList.add('show');
    this.el.backdrop.classList.add('show');
  }
  closeDrawer(){
    this.el.drawer.classList.remove('show');
    this.el.backdrop.classList.remove('show');
  }

  // ---- リトライボタン ----
  showRetryButton(){ this.el.retryBtn.classList.add('show'); }
  hideRetryButton(){ this.el.retryBtn.classList.remove('show'); }

  // ---- ステージセレクタ ----
  openStageDrawer(stages, currentStage, cleared, onSelect){
    this.el.stageDrawerBody.innerHTML = stages.map((st, i) => {
      const isCleared = !!cleared[i];
      const isCurrent = i === currentStage;
      const selectable = isCleared || isCurrent;
      const cls = isCurrent ? 'stage-item current' : (isCleared ? 'stage-item cleared' : 'stage-item locked');
      const icon = isCurrent ? '▶' : (isCleared ? '✅' : '🔒');
      return `<button type="button" class="${cls}" data-stage="${i}"${selectable ? '' : ' disabled'}>
        <span class="stage-icon">${icon}</span><span class="stage-name">CH.${i+1} : ${esc(st.chapterTitle || st.level)}</span>
      </button>`;
    }).join('');
    this.el.stageDrawerBody.querySelectorAll('.stage-item:not(:disabled)').forEach(b => {
      b.addEventListener('click', () => onSelect(parseInt(b.getAttribute('data-stage'), 10)), { once:true });
    });
    this.el.stageDrawer.classList.add('show');
    this.el.stageBackdrop.classList.add('show');
  }
  closeStageDrawer(){
    this.el.stageDrawer.classList.remove('show');
    this.el.stageBackdrop.classList.remove('show');
  }

  // ---- 予測バー (行数予測・インライン展開) ----
  showPredictBar(choices, onSelect){
    this.el.predictChoices.innerHTML = choices.map(n =>
      `<button type="button" class="predict-btn" data-rows="${n}">${n}行</button>`).join('');
    this.el.predictChoices.querySelectorAll('.predict-btn').forEach(b => {
      b.addEventListener('click', () => {
        this.el.predictChoices.querySelectorAll('.predict-btn').forEach(x => x.disabled = true);
        onSelect(parseInt(b.getAttribute('data-rows'), 10));
      }, { once:true });
    });
    this.el.predictBar.style.display = 'block';
    this.el.predictBar.classList.add('show');
  }
  hidePredictBar(){
    this.el.predictBar.classList.remove('show');
    this.el.predictBar.style.display = 'none';
  }

  // ---- タイムアウト時の操作ロック ----
  disableForTimeout(){
    this.hidePredictBar();
    this.el.runBtn.disabled = true;
    this.el.tokenPad.classList.add('locked');
    this.el.utilBar.querySelectorAll('.util').forEach(b => { b.disabled = true; });
  }
  enableAfterTimeout(){
    this.el.runBtn.disabled = false;
    this.el.utilBar.querySelectorAll('.util').forEach(b => { b.disabled = false; });
  }

  // ---- 実行結果セット表示 ----
  renderResultSet(resultSet){
    const head = resultSet.cols.map(c => `<th>${esc(c)}</th>`).join('');
    const body = resultSet.rows.map(r => '<tr>' + r.map(v => `<td>${esc(v)}</td>`).join('') + '</tr>').join('');
    this.el.resultPanel.innerHTML = `<div class="panel-title">📊 実行結果</div>
      <table class="resultset"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
    this.el.resultPanel.classList.add('show');
  }
  hideResultSet(){
    this.el.resultPanel.classList.remove('show');
    this.el.resultPanel.innerHTML = '';
  }

  // ---- 別解表示 ----
  renderAltAnswers(answers){
    const alts = answers.slice(1);
    let html = '<div class="panel-title">🔁 別解</div>';
    if(alts.length){
      html += alts.map(a => `<div class="alt-sql">${esc(a)}</div>`).join('');
    } else {
      html = '<div class="panel-title">🔁 別解</div><div class="alt-none">この形が唯一の正解。</div>';
    }
    this.el.altPanel.innerHTML = html;
    this.el.altPanel.classList.add('show');
  }
  hideAltAnswers(){
    this.el.altPanel.classList.remove('show');
    this.el.altPanel.innerHTML = '';
  }

  // ---- NORA LOG (通常は1〜3文、章の節目だけ少し大きいReveal) ----
  renderReveal(reveal){
    const lines = String(reveal.text || '').split('\n').map(t => `<p>${esc(t)}</p>`).join('');
    let html = `<div class="panel-title">📻 NORA LOG</div><div class="reveal-text">${lines}</div>`;
    if(reveal.terminal && reveal.terminal.length){
      html += `<div class="reveal-terminal">${reveal.terminal.map(l => `<div>&gt; ${esc(l)}</div>`).join('')}</div>`;
    }
    this.el.revealPanel.innerHTML = html;
    this.el.revealPanel.className = reveal.size === 'big' ? 'show big' : 'show';
  }
  hideReveal(){
    this.el.revealPanel.className = '';
    this.el.revealPanel.innerHTML = '';
  }

  // ---- Story Overlay (章末・オープニングなど全画面・内部スクロール可) ----
  showStoryOverlay(content, onContinue, buttonLabel){
    this._storyContinueCb = onContinue;
    this.el.storyOverlayTitle.textContent = content.title || '';
    this.el.storyOverlayTitle.style.display = content.title ? '' : 'none';
    this.el.storyContinueBtn.textContent = buttonLabel || '監査完了 ─ 結果を見る';
    this.el.storyOverlayBody.innerHTML = content.blocks.map(b => {
      if(b.type === 'title') return `<div class="story-title">${esc(b.text)}</div>` +
        (b.subtitle ? `<div class="story-subtitle">${esc(b.subtitle)}</div>` : '');
      if(b.type === 'heading') return `<div class="story-heading">${esc(b.text)}</div>`;
      if(b.type === 'dialogue') return `<div class="story-dialogue">${esc(b.text).replace(/\n/g,'<br>')}</div>`;
      if(b.type === 'terminal') return `<div class="story-terminal">${b.lines.map(l => `<div>&gt; ${esc(l)}</div>`).join('')}</div>`;
      if(b.type === 'sql') return `<pre class="story-sql">${esc(b.text)}</pre>`;
      if(b.type === 'note') return `<div class="story-note">⚠ ${esc(b.text)}</div>`;
      return `<div class="story-narration">${esc(b.text)}</div>`;
    }).join('');
    this.el.storyOverlay.classList.add('show');
    const scrollEl = $('storyOverlayScroll');
    if(scrollEl) scrollEl.scrollTop = 0;
  }
  hideStoryOverlay(){
    this.el.storyOverlay.classList.remove('show');
  }

  // ---- Mastery Learning レポート (結果画面) ----
  showResult(report, examQuestion, certificateText){
    const colors = { MASTERED: '#bbf7d0', ASSISTED: '#fbbf24', PRACTICE: '#cbd5e1' };
    this.el.chapterResults.innerHTML = report.chapters.map(ch => {
      const badge = ch.clearType || (ch.completed ? 'UNASSESSED' : 'UNCLEARED');
      return `<li data-chapter="${esc(ch.id)}" data-clear-type="${esc(badge)}" style="color:${colors[ch.clearType] || '#94a3b8'}">
        <strong>[${esc(badge)}]</strong> ${esc(ch.title)}<br>${esc(ch.statusLabel)}</li>`;
    }).join('');
    this.el.masterySummary.textContent = Object.keys(report.masterySummary)
      .map(type => `${type}: ${report.masterySummary[type]} / ${report.totalStages}`).join(' ｜ ');
    this.el.masteredList.innerHTML = report.mastered.length
      ? report.mastered.map(m => `<li>✓ ${esc(m)}</li>`).join('')
      : '<li class="none">まだ習得スキルがありません</li>';

    const rp = report.rowPrediction;
    this.el.rowPredictionLine.textContent =
      `行数予測: ${rp.correct} / ${rp.attempts} 問正解 ─ ${rp.status.label}`;

    this.el.examSourceLabel.textContent = examQuestion.sourceLabel;
    this.el.examQuestion.textContent = examQuestion.question;
    this._renderExamChoices(examQuestion);
    this.el.examResultLine.textContent = '';
    this.el.examResultLine.className = 'exam-result-line';

    this.el.nextMissionText.textContent = report.nextMission;
    this.el.certificateText.value = certificateText;
    this.el.sessionXpLine.textContent = `Session XP: ${report.xp}`;

    this.el.result.classList.add('show');
    this.el.resultScroll.scrollTop = 0;
  }

  _renderExamChoices(q){
    this.el.examChoices.innerHTML = q.choices.map((c, i) =>
      `<button type="button" class="exam-choice" data-idx="${i}">${esc(c)}</button>`).join('');
    this.el.examChoices.querySelectorAll('.exam-choice').forEach(b => {
      b.addEventListener('click', () => this.h.onExamAnswer(parseInt(b.getAttribute('data-idx'), 10)));
    });
  }

  renderExamAnswer(q, selectedIdx, correct){
    this.el.examChoices.querySelectorAll('.exam-choice').forEach(b => {
      const idx = parseInt(b.getAttribute('data-idx'), 10);
      b.classList.remove('correct', 'wrong');
      if(idx === q.correct) b.classList.add('correct');
      else if(idx === selectedIdx) b.classList.add('wrong');
    });
    this.el.examResultLine.textContent = correct ? '✅ PASS' : '❌ RETRY ─ 正解を確認してもう一度選んでみよう';
    this.el.examResultLine.className = 'exam-result-line ' + (correct ? 'ok' : 'ng');
    if(correct){
      this.el.examChoices.querySelectorAll('.exam-choice').forEach(b => { b.disabled = true; });
    }
  }

  setCertificateText(text){ this.el.certificateText.value = text; }

  hideResult(){ this.el.result.classList.remove('show'); }
}
