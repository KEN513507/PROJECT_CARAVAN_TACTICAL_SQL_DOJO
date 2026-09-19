// js/ui.js
import { TABLES } from './data.js?v=20260918-ch6-investigation';
import { fieldLabel, tableLabel } from './display-labels.js?v=20260919-onboarding';

const $ = id => document.getElementById(id);

function esc(s){
  return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' })[c]);
}

// Data UI の列見出し。DISPLAY TERMINOLOGY CONTRACT の canonical display label を使う。
// SQL Editor / monitor / token pad は internal SQL identifier のままで、ここは通らない。
function escCol(s){
  return esc(fieldLabel(s));
}
// internal SQL identifier をそのまま見せる場所（対応表など）用。
// <wbr> は要素なので textContent は "resident_id" のまま変わらない。
function escIdent(s){
  return esc(s).replace(/_/g, '_<wbr>');
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
        <button type="button" id="noraBtn" aria-label="NORAの通信を開く">🗣</button>
      </header>
      <section id="schemaPanel"></section>
      <section id="mission">
        <div id="missionLevel"></div>
        <div id="missionText"></div>
        <div id="missionBrief"></div>
      </section>
      <div id="tutorialPanel"></div>
      <section id="monitorWrap">
        <div id="monitor"></div>
        <div id="hintLine"></div>
      </section>
      <section id="relationPanel">
        <div id="relationContext"></div>
        <div id="relationTables"></div>
        <div id="relationTrace"></div>
        <div id="relationAnswer"></div>
      </section>
      <section id="successPanel">
        <div id="successZones">
          <section class="zone" id="zoneProblem">
            <button type="button" class="zone-header" data-zone="problem">
              <span class="zone-caret">▸</span><span class="zone-title">問題を振り返る</span>
            </button>
            <div class="zone-body" id="zoneProblemBody"></div>
          </section>
          <section class="zone" id="zoneResult">
            <button type="button" class="zone-header" data-zone="result">
              <span class="zone-caret">▸</span><span class="zone-title">実行結果 / EVIDENCE</span>
            </button>
            <div class="zone-body" id="zoneResultBody"></div>
          </section>
          <section class="zone" id="zoneComm">
            <button type="button" class="zone-header" data-zone="comm">
              <span class="zone-caret">▸</span><span class="zone-title">会話を見る</span>
              <span class="zone-unread" id="zoneCommUnread">●</span>
            </button>
            <div class="zone-body" id="zoneCommBody"></div>
          </section>
        </div>
      </section>
      <div id="resultPanel"></div>
      <div id="altPanel"></div>
      <div id="revealPanel"></div>
      <div id="predictBar">
        <div class="predict-bar-title">🔮 予測: 何行返る?</div>
        <div id="predictChoices"></div>
        <button type="button" id="predictCancel">キャンセル</button>
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
        <button type="button" id="undoBtn" class="act act-undo">↶ 戻す</button>
        <button id="hintBtn" class="act act-hint">💡 ヒントを見る</button>
        <button id="orderBtn" class="act act-order">🔍 評価順</button>
        <button id="runBtn" class="act act-run">▶ 実行 &amp; 検証</button>
      </div>
      <div id="ch1SheetScrim"></div>
      <div id="ch1Sheet" role="dialog" aria-modal="true">
        <div id="ch1SheetBadge"></div>
        <div id="ch1SheetText"></div>
        <pre id="ch1SheetCode"></pre>
        <div id="ch1SheetActions">
          <button type="button" id="ch1SheetSecondary"></button>
          <button type="button" id="ch1SheetPrimary"></button>
        </div>
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
          <div id="stageDrawerTitle" class="drawer-title">🗺 ステージセレクト</div>
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
     'stageBackdrop','stageDrawer','stageDrawerTitle','stageDrawerBody','stageDrawerClose',
     'predictBar','predictChoices','predictCancel',
     'relationPanel','relationContext','relationTables','relationTrace','relationAnswer','noraBtn',
     'successPanel','successZones','zoneProblem','zoneProblemBody','zoneResult','zoneResultBody',
     'zoneComm','zoneCommBody','zoneCommUnread',
     'result','resultScroll','masteredList','chapterResults','masterySummary','rowPredictionLine',
     'examSourceLabel','examQuestion','examChoices','examResultLine',
     'nextMissionText','certificateText','sessionXpLine','restartBtn',
     'storyOverlay','storyOverlayTitle','storyOverlayBody','storyContinueBtn',
     'mission','missionBrief','undoBtn',
     'ch1Sheet','ch1SheetScrim','ch1SheetBadge','ch1SheetText','ch1SheetCode','ch1SheetPrimary','ch1SheetSecondary'].forEach(k => { this.el[k] = $(k); });

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
    this.el.undoBtn.addEventListener('click', () => h.onUtil('undo'));
    this.el.mission.addEventListener('click', () => { if(h.onMissionDetail) h.onMissionDetail(); });
    this.el.noraBtn.addEventListener('click', () => { if(h.onNora) h.onNora(); });
    this.el.successZones.querySelectorAll('.zone-header').forEach(b => {
      b.addEventListener('click', () => {
        if(h.onSuccessZone) h.onSuccessZone(b.getAttribute('data-zone'));
      });
    });
    this.el.ch1SheetPrimary.addEventListener('click', () => this._sheetAction('primary'));
    this.el.ch1SheetSecondary.addEventListener('click', () => this._sheetAction('secondary'));
    this.el.ch1SheetScrim.addEventListener('click', () => { if(this._sheet && this._sheet.dismissible) this.closeSheet(); });
  }

  // ---- CH1 2-Workspace レイアウト (CH2以降には適用しない) ----
  setCh1Layout(on){
    document.body.classList.toggle('ch1-ui', !!on);
    if(!on){
      delete document.body.dataset.workspace;
      this.closeSheet();
    }
  }
  setMissionBrief(text){ this.el.missionBrief.textContent = text || ''; }
  setRunLabel(text){ this.el.runBtn.textContent = text; }

  // ---- CH1 一時シート (NORA / Hint / 誤答 / 完成SQL)。通常レイアウトの高さを消費しない ----
  openSheet({ badge = '', text = '', code = '', primary, secondary, dismissible = true }){
    this._sheet = { primary, secondary, dismissible };
    this.el.ch1SheetBadge.textContent = badge;
    this.el.ch1SheetText.textContent = text;
    this.el.ch1SheetText.hidden = !text;
    this.el.ch1SheetCode.textContent = code;
    this.el.ch1SheetCode.classList.toggle('show', !!code);
    this.el.ch1SheetPrimary.textContent = primary ? primary.label : '閉じる';
    this.el.ch1SheetSecondary.hidden = !secondary;
    this.el.ch1SheetSecondary.textContent = secondary ? secondary.label : '';
    this.el.ch1Sheet.classList.add('show');
    this.el.ch1SheetScrim.classList.add('show');
  }
  closeSheet(){
    this._sheet = null;
    this.el.ch1Sheet.classList.remove('show');
    this.el.ch1SheetScrim.classList.remove('show');
  }
  _sheetAction(which){
    const sheet = this._sheet;
    const action = sheet && sheet[which];
    this.closeSheet();
    if(action && action.onClick) action.onClick();
  }

  // SQL WORKSPACE VISIBILITY CONTRACT
  //   tables: ['NAME'] または [{ name, cols }]（§5 Missionに必要な列だけを出してよい）
  //   tablesSrc: 復元事実を重ねた表（App.queryTables()）。省略時は RAW FACT の TABLES。
  // 各表は独立した Table Card（details/summary）として縦に積む。値は省略しない。
  renderSchema(tables, tablesSrc){
    const src = tablesSrc || TABLES;
    let html = '';
    for(const spec of tables){
      const name = typeof spec === 'string' ? spec : spec.name;
      const tb = src[name];
      if(!tb) continue;
      // 表示列。指定が無ければ全列。実在しない列名は無視する。
      const pick = (typeof spec === 'object' && Array.isArray(spec.cols))
        ? spec.cols.filter(c => tb.cols.indexOf(c) !== -1)
        : tb.cols;
      const idx = pick.map(c => tb.cols.indexOf(c));
      const head = pick.map(c => `<th>${escCol(c)}</th>`).join('');
      const body = tb.rows.map(r => '<tr>' + idx.map(i =>
        `<td class="${tb.keys.indexOf(tb.cols[i]) !== -1 ? 'pk' : ''}">${r[i] === null || r[i] === undefined ? '—' : esc(r[i])}</td>`).join('') + '</tr>').join('');
      // 一部の列だけ出しているときは、その事実を隠さず明示する（§5: Data隠蔽ではない）
      const omitted = tb.cols.length - pick.length;
      const note = omitted > 0
        ? `<div class="schema-cols">この照会に必要な ${pick.length} 列を表示（全 ${tb.cols.length} 列）</div>` : '';
      // DISPLAY TERMINOLOGY CONTRACT §5:
      // 表示ラベルとSQL識別子の対応を確認できるようにする。ただし表見出しに毎回併記して
      // 横幅を浪費しない。必要なときだけ開く対応表として置く。
      const map = pick.map(c =>
        `<div class="schema-map-row"><span class="schema-map-l">${escCol(c)}</span><span class="schema-map-i">${escIdent(c)}</span></div>`
      ).join('');
      const mapBlock = `<details class="schema-map"><summary>SQLでの列名を見る</summary><div class="schema-map-body">${map}</div></details>`;
      // 1表なら開いたまま。2表以上は既定で畳み、すべての Source Table の見出しを
      // 同時に見せる（§9「JOIN元の両表を確認できない」を防ぐ）。開閉状態は章内で保持される。
      const openAttr = tables.length === 1 ? ' open' : '';
      html += `<details class="schema-card"${openAttr}><summary><span class="schema-name">${esc(name)}</span><span class="schema-rows">${tb.rows.length}行 / ${pick.length}列</span></summary>
        <div class="schema-body">${note}
        <table class="mini"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>${mapBlock}</div></details>`;
    }
    this.el.schemaPanel.innerHTML = html;
  }

  setLearningHud(stage, completed, total){
    this.el.stageLabel.textContent = `NEON RELAY · M${String(stage + 1).padStart(2, '0')}`;
    this.el.progressFill.style.width = `${completed / total * 100}%`;
    this.el.progressFill.parentElement.setAttribute('aria-label', `${total}件中${completed}件完了`);
    this.el.timer.hidden = true;
    this.el.xp.hidden = true;
    this.el.noraBtn.hidden = true;
    this.el.orderBtn.hidden = true;
    this.el.hintBtn.textContent = 'ヒント';
    this.el.undoBtn.textContent = '↶ 戻す';
    this.el.feedback.setAttribute('role', 'status');
    this.el.feedback.setAttribute('aria-live', 'polite');
    this.el.zoneResult.querySelector('.zone-title').textContent = '照会結果';
    this.el.zoneComm.querySelector('.zone-title').textContent = '作業記録';
    this.el.utilBar.innerHTML = [
      ['after', '選択語の後に追加'], ['end', '末尾に追加'], ['remove', '選択語を削除'], ['clear', '全消去']
    ].map(([action, label]) => `<button type="button" data-edit="${action}">${label}</button>`).join('');
    this.el.utilBar.querySelectorAll('[data-edit]').forEach(b => {
      b.onclick = () => this.h.onLearningUtil(b.dataset.edit);
    });
  }

  renderLearningGuide(text){
    let guide = document.getElementById('learningGuide');
    if(!guide){ guide = document.createElement('div'); guide.id = 'learningGuide'; this.el.mission.appendChild(guide); }
    guide.textContent = text;
  }

  renderLearningSource(name, table, note){
    const header = table.cols.map((col, i) => `<th><button type="button" data-source-col="${i}">${escCol(col)}</button></th>`).join('');
    const rows = table.rows.map((row, ri) => `<tr>${row.map((value, ci) =>
      `<td><button type="button" data-source-row="${ri}" data-source-cell="${ci}">${esc(value)}</button></td>`).join('')}</tr>`).join('');
    this.el.schemaPanel.innerHTML = `<div class="learning-source-title">${esc(tableLabel(name))}<span>列・値をタップで挿入</span></div>
      <div class="learning-source-scroll"><table class="mini"><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>
      <div class="learning-source-note">${esc(note)}</div>`;
    this.el.schemaPanel.querySelectorAll('[data-source-col]').forEach(b => {
      b.onclick = () => this.h.onToken(table.cols[Number(b.dataset.sourceCol)], 'col');
    });
    this.el.schemaPanel.querySelectorAll('[data-source-row]').forEach(b => {
      b.onclick = () => {
        const value = table.rows[Number(b.dataset.sourceRow)][Number(b.dataset.sourceCell)];
        this.h.onToken(typeof value === 'number' ? String(value) : "'" + value.replace(/'/g, "''") + "'", 'lit');
      };
    });
  }

  renderEditableQuery(tokens, cursor, disabled){
    const parts = tokens.map((token, i) => {
      const marker = !cursor.replace && cursor.index === i ? '<span class="insert-cursor" aria-label="追加位置">▏</span>' : '';
      return marker + `<button type="button" class="query-token tk-${esc(token.k)}${cursor.replace && cursor.index === i ? ' selected' : ''}"
        data-query-index="${i}" aria-pressed="${cursor.replace && cursor.index === i}" ${disabled ? 'disabled' : ''}>${esc(token.t)}</button>`;
    }).join(' ');
    this.el.monitor.innerHTML = parts + (!cursor.replace && cursor.index >= tokens.length ? '<span class="insert-cursor" aria-label="追加位置">▏</span>' : '');
    this.el.monitor.setAttribute('aria-label', 'SQL。語句を選択すると置き換えられます');
    this.el.monitor.querySelectorAll('[data-query-index]').forEach(b => {
      b.onclick = () => this.h.onQueryToken(Number(b.dataset.queryIndex));
    });
    this.el.utilBar.querySelector('[data-edit="after"]').disabled = disabled || !cursor.replace;
    this.el.utilBar.querySelector('[data-edit="remove"]').disabled = disabled || !tokens.length;
    this.el.utilBar.querySelector('[data-edit="end"]').disabled = disabled;
    this.el.utilBar.querySelector('[data-edit="clear"]').disabled = disabled || !tokens.length;
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
    if(document.body.classList.contains('learning-ui')){
      groups.clause.label = '構文'; groups.func.label = '演算・集計'; groups.table.label = '表'; groups.col.label = '列・値';
    }
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
      this.el.monitor.innerHTML = '<span class="caret"></span>';
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
  // chapterNo / chapterTotal は本編（CHAPTER 1〜6）内での番号。campaign全体のindexではない。
  setHud(stage, total, xp, chapterNo = stage + 1, chapterTotal = total){
    this.el.stageLabel.textContent = `CASE 53 ─ CH.${chapterNo}/${chapterTotal}`;
    this.el.progressFill.style.width = ((stage+1)/total*100) + '%';
    this.el.xp.textContent = 'XP ' + xp;
    this.el.timer.hidden = false;
    this.el.xp.hidden = false;
    this.el.noraBtn.hidden = false;
  }
  // Relation Task等、制限時間を持たないステージ用
  setTimerIdle(){
    this.el.timer.textContent = '⏱ —';
    this.el.timer.classList.remove('warn');
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
  openStageDrawer(stages, currentStage, cleared, onSelect, unlockAll = false){
    this.el.stageDrawerTitle.textContent = unlockAll ? '🗺 ステージセレクト（DEBUG: 全章選択可）' : '🗺 ステージセレクト';
    this.el.stageDrawerBody.innerHTML = stages.map((st, i) => {
      const isCleared = !!cleared[i];
      const isCurrent = i === currentStage;
      // DEBUG時は未クリアの章も選択できる。表示アイコンは実際の進行状態を保つ。
      const selectable = unlockAll || isCleared || isCurrent || (st.learning && i === cleared.indexOf(false));
      const cls = isCurrent ? 'stage-item current' : (isCleared ? 'stage-item cleared' : (selectable ? 'stage-item' : 'stage-item locked'));
      const icon = isCurrent ? '▶' : (isCleared ? '✅' : (selectable ? '·' : '🔒'));
      return `<button type="button" class="${cls}" data-stage="${i}"${selectable ? '' : ' disabled'}>
        <span class="stage-icon">${icon}</span><span class="stage-name">${st.learning ? st.id : 'CH.' + (i + 1 - stages.filter(x => x.learning).length)} : ${esc(st.chapterTitle || st.level)}</span>
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

  // ---- 予測バー (行数予測・オーバーレイ表示。キャンセル可能) ----
  showPredictBar(choices, onSelect, onCancel){
    this.el.predictChoices.innerHTML = choices.map(n =>
      `<button type="button" class="predict-btn" data-rows="${n}">${n}行</button>`).join('');
    this.el.predictChoices.querySelectorAll('.predict-btn').forEach(b => {
      b.addEventListener('click', () => {
        this.el.predictChoices.querySelectorAll('.predict-btn').forEach(x => x.disabled = true);
        onSelect(parseInt(b.getAttribute('data-rows'), 10));
      }, { once:true });
    });
    this.el.predictCancel.hidden = !onCancel;
    this.el.predictCancel.onclick = () => {
      this.hidePredictBar();
      if(onCancel) onCancel();
    };
    this.el.predictBar.style.display = 'block';
    this.el.predictBar.classList.add('show');
  }
  hidePredictBar(){
    this.el.predictBar.classList.remove('show');
    this.el.predictBar.style.display = 'none';
    this.el.predictCancel.onclick = null;
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

  // ---- RELATION TASK (RelationWorkspace) ----
  // 候補値の三択にしない（RTP §5 の弱い形を避ける）。drag&dropもしない。
  // 情報を同時表示せず、Presentation State で段階表示する:
  //   target : 欠損レコードが主役
  //   select : 照合キー + source表が主役
  //   match  : 照合結果が主役
  // Domain(phase / 判定)は変更しない。stateはViewModel側の派生値。
  renderRelationTask(view){
    const st = view.state;
    this.el.relationPanel.setAttribute('data-relation-state', st);
    this.el.relationPanel.setAttribute('data-relation-task', view.taskId);

    // ---- Header: 1行だけ。問題文をHeaderとBodyで重複させない ----
    this.el.relationContext.innerHTML =
      `<div class="rq-badge">RECOVERY 1 ─ 欠損記録</div>` +
      `<div class="rq-lead">${esc(this.relationLead(view))}</div>`;

    // ---- Stage: そのStateで必要なものだけを出す ----
    this.el.relationTables.innerHTML = this.relationStageHtml(view);

    // ---- 照合パネル（match Stateのみ主役。それ以外は出さない） ----
    this.el.relationTrace.innerHTML = st === 'match' ? this.relationMatchHtml(view) : '';

    // ---- 復元値 ----
    this.el.relationAnswer.innerHTML = this.relationAnswerHtml(view);

    // ---- 配線 ----
    this.el.relationPanel.querySelectorAll('.relation-missing').forEach(b => {
      b.addEventListener('click', () => {
        if(this.h.onRelationSlot) this.h.onRelationSlot(b.getAttribute('data-slot'));
      });
    });
    this.el.relationPanel.querySelectorAll('.relation-source-row').forEach(tr => {
      tr.addEventListener('click', () => {
        if(this.h.onRelationSource) this.h.onRelationSource(tr.getAttribute('data-source'));
      });
    });
    const active = this.el.relationTables.querySelector('.rq-active');
    if(active && st !== 'target') active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  // Stateごとの指示文は1つだけ
  relationLead(view){
    if(view.state === 'target') return `${view.targetRowKey} の ${view.slotLabel} が欠損しています。`;
    if(view.state === 'select') return '同じ端末・同じ時刻の認証記録を選択。';
    if(view.state === 'done') return `${view.targetRowKey} の欠損記録を復元しました。`;
    return view.match && view.match.allMatch
      ? '照合が一致。復元値が確定しました。'
      : `この記録は ${view.targetRowKey} に対応しません。`;
  }

  relationStageHtml(view){
    const parts = [];
    if(view.state === 'done'){
      parts.push(this.relationReconstructedCard(view));
      parts.push(this.relationSourceRecordCard(view));
      return parts.join('');
    }
    if(view.state === 'target'){
      parts.push(this.relationTargetCard(view, true));
    } else {
      // matchでは照合結果パネルが両方の値を見せるので、キーstripは重複させない
      if(view.state === 'select') parts.push(this.relationKeyStrip(view));
      parts.push(this.relationSourceCard(view, view.state === 'select'));
      parts.push(this.relationTargetCard(view, false));
    }
    parts.push(this.relationAsideHtml(view));
    return parts.join('');
  }

  // 復元対象レコード。targetStateでは主役、それ以降は要約に退く。
  relationTargetCard(view, primary){
    const fields = view.targetFields.map(f => {
      if(f.isSlot){
        // 復元確定値(MATCH成立後)のみセルへ入れる。MISMATCH中は「欠損」を維持する。
        const done = view.reconstructedValue;
        return `<div class="rq-field">
          <span class="rq-k">${escCol(f.col)}</span>
          <button type="button" class="rq-missing relation-missing${done ? ' filled' : ''}" data-slot="${esc(f.slotId)}">${done ? esc(done) : '欠損'}</button>
        </div>`;
      }
      return `<div class="rq-field"><span class="rq-k">${escCol(f.col)}</span><span class="rq-v">${esc(f.value)}</span></div>`;
    }).join('');
    return `<div class="rq-card${primary ? ' rq-active' : ' rq-summary'}">
      <div class="rq-card-title"><span class="rq-card-name">${esc(view.targetTable)}</span> / ${esc(view.targetRowKey)}</div>
      ${fields}
    </div>`;
  }

  // 照合キーは技術的な列対応を常時本文に書かず、値だけを大きく見せる
  relationKeyStrip(view){
    const keys = view.keyStrip.map(k =>
      `<div class="rq-key"><span class="rq-key-v">${esc(k.value)}</span><span class="rq-key-l">${escCol(k.label)}</span></div>`).join('');
    return `<div class="rq-keys"><div class="rq-keys-title">照合キー</div><div class="rq-keys-row">${keys}</div></div>`;
  }

  relationSourceCard(view, primary){
    const tb = view.sourceTable;
    const head = tb.cols.map(c => `<th>${escCol(c)}</th>`).join('');
    const body = tb.rows.map(r => {
      const key = r[0];
      const chosen = view.selectedSource === key;
      const state = chosen ? (view.match && view.match.allMatch ? ' matched' : ' mismatched') : '';
      const cells = r.map(v => `<td>${v === null || v === undefined ? '—' : esc(v)}</td>`).join('');
      return `<tr class="relation-source-row${state}" data-source="${esc(key)}">${cells}</tr>`;
    }).join('');
    return `<div class="rq-card rq-source${primary ? ' rq-active' : ''}">
      <div class="rq-card-title"><span class="rq-card-name">${esc(tb.name)}</span>${primary ? '<span class="rq-card-hint">対応する行をタップ</span>' : ''}</div>
      <table class="rq-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    </div>`;
  }

  relationMatchHtml(view){
    const m = view.match;
    if(!m) return '';
    const rows = m.keys.map((k, i) => {
      const label = view.keyStrip[i] ? view.keyStrip[i].label : k.targetCol;
      return `<div class="rq-cmp ${k.match ? 'ok' : 'ng'}">
        <span class="rq-cmp-l">${escCol(label)}</span>
        <span class="rq-cmp-v">${esc(k.targetValue)}</span>
        <span class="rq-cmp-op">${k.match ? '=' : '≠'}</span>
        <span class="rq-cmp-v">${esc(k.sourceValue)}</span>
      </div>`;
    }).join('');
    return `<div class="rq-match rq-active ${m.allMatch ? 'ok' : 'ng'}">
      <div class="rq-verdict">${m.allMatch ? 'MATCH' : 'MISMATCH'}</div>
      ${rows}
    </div>`;
  }

  // 色だけで意味を表さない。状態をラベルでも示す。
  //   PREVIEW       : source選択のみ（未確定・neutral）
  //   RECONSTRUCTED : MATCH成立後の復元確定値（緑）
  relationAnswerHtml(view){
    const slot = view.slots[0];
    const done = view.reconstructedValue;
    const preview = view.previewValue;
    let tag, value, cls;
    if(done){ tag = 'RECONSTRUCTED'; value = done; cls = ' ok'; }
    else if(preview){ tag = 'PREVIEW'; value = preview; cls = ' preview'; }
    else { tag = slot.label; value = '—'; cls = ''; }
    return `<div class="rq-answer${cls}">
      <span class="rq-answer-l">${esc(tag)}</span>
      <span class="rq-answer-v relation-slot${done ? ' filled' : ''}">${esc(value)}</span>
    </div>`;
  }

  // ---- 成功画面: 復元された記録と、その根拠となったsource記録 ----
  relationReconstructedCard(view){
    const fields = view.targetFields.map(f => {
      const val = f.isSlot ? view.reconstructedValue : f.value;
      return `<div class="rq-field">
        <span class="rq-k">${escCol(f.col)}</span>
        <span class="rq-v${f.isSlot ? ' rq-restored' : ''}">${esc(val)}</span>
      </div>`;
    }).join('');
    return `<div class="rq-card rq-active rq-done">
      <div class="rq-card-title"><span class="rq-card-name">RECORD RECONSTRUCTED</span></div>
      <div class="rq-done-sub">${esc(view.targetTable)} / ${esc(view.targetRowKey)}</div>
      ${fields}
    </div>`;
  }

  relationSourceRecordCard(view){
    if(!view.sourceRow) return '';
    const cells = view.sourceCols.map((c, i) =>
      `<div class="rq-field"><span class="rq-k">${escCol(c)}</span><span class="rq-v">${esc(view.sourceRow[i])}</span></div>`).join('');
    return `<div class="rq-card rq-summary">
      <div class="rq-card-title"><span class="rq-card-name">SOURCE RECORD</span></div>
      <div class="rq-done-sub">${esc(view.sourceTable.name)}</div>
      ${cells}
    </div>`;
  }

  // 復元に直接必要でない表と技術的な照合ルールは折りたたみへ退避する
  relationAsideHtml(view){
    const canon = view.canonTable;
    const canonRows = canon ? canon.rows.map(r =>
      `<tr>${r.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('') : '';
    const canonHead = canon ? canon.cols.map(c => `<th>${escCol(c)}</th>`).join('') : '';
    const rules = view.relationRules.map(r =>
      `<div class="rq-rule">${esc(r)}</div>`).join('');
    return `<div class="rq-aside">
      ${canon ? `<details class="rq-details"><summary>${esc(canon.name)} を見る</summary>
        <table class="rq-table"><thead><tr>${canonHead}</tr></thead><tbody>${canonRows}</tbody></table></details>` : ''}
      <details class="rq-details"><summary>照合ルール</summary>${rules}</details>
    </div>`;
  }

  showRelationWorkspace(on){
    this.el.relationPanel.classList.toggle('show', !!on);
  }

  hideRelationTask(){
    this.el.relationPanel.classList.remove('show');
    this.el.relationPanel.removeAttribute('data-relation-state');
    this.el.relationPanel.removeAttribute('data-relation-task');
    this.el.relationContext.innerHTML = '';
    this.el.relationTables.innerHTML = '';
    this.el.relationTrace.innerHTML = '';
    this.el.relationAnswer.innerHTML = '';
  }

  // ---- 成功画面（3領域アコーディオン） ----
  // ZONE 1 PROBLEM/SOURCE  = 何を調べたか（問題文 + 元データ）
  // ZONE 2 RESULT/EVIDENCE = 何が返ってきたか（実行SQL + 結果 + 学習フィードバック）
  // ZONE 3 COMMUNICATION   = そのあと誰が何を言ったか（Story Beat）
  // 開閉はPresentation State。1つだけ開くONE-OPEN方式。
  renderSuccess(view){
    this.el.successPanel.classList.add('show');

    // ---- ZONE 1 ----
    const tables = view.tables.map(tb => {
      const head = tb.cols.map(c => `<th>${escCol(c)}</th>`).join('');
      const body = tb.rows.map(r => '<tr>' + r.map((v, i) =>
        `<td class="${(tb.keys || []).indexOf(tb.cols[i]) !== -1 ? 'pk' : ''}">${esc(v)}</td>`).join('') + '</tr>').join('');
      return `<div class="zone-table"><h5>${esc(tableLabel(tb.name))}</h5>
        <table class="zone-grid"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
    }).join('');
    this.el.zoneProblemBody.innerHTML =
      `<div class="zone-mission">${esc(view.missionTitle)}</div>` +
      `<div class="zone-problem">${esc(view.problem)}</div>` + tables;

    // ---- ZONE 2 ----
    const rs = view.result;
    const rHead = rs.cols.map(c => `<th>${escCol(c)}</th>`).join('');
    const rBody = rs.rows.map(r => '<tr>' + r.map(v => `<td>${esc(v)}</td>`).join('') + '</tr>').join('');
    const alts = view.alternatives.length
      ? `<div class="zone-label">別解</div>` + view.alternatives.map(a => `<div class="zone-sql alt">${esc(a)}</div>`).join('')
      : `<div class="alt-none">同じ結果になる書き方なら、この形でなくても正解。</div>`;
    this.el.zoneResultBody.innerHTML =
      `<div class="zone-label">EXECUTED SQL</div><div class="zone-sql">${esc(view.executedSql)}</div>` +
      `<div class="zone-label">RESULT</div>` +
      `<table class="zone-grid result"><thead><tr>${rHead}</tr></thead><tbody>${rBody}</tbody></table>` +
      alts +
      `<div class="zone-clear ${esc(view.clearType.toLowerCase())}">` +
        `<span class="zone-clear-type">${esc(view.clearLabel || view.clearType)}</span>` +
        `<span class="zone-clear-note">${esc(view.clearNote)}</span></div>`;

    // ---- ZONE 3 ----
    const lines = view.dialogue.lines.map(l =>
      `<div class="zone-line"><span class="zone-speaker">${esc(l.speaker)}</span>` +
      `<span class="zone-say">${esc(l.text)}</span></div>`).join('');
    const term = view.dialogue.terminal.length
      ? `<div class="zone-terminal">${view.dialogue.terminal.map(t => `<div>&gt; ${esc(t)}</div>`).join('')}</div>`
      : '';
    this.el.zoneCommBody.innerHTML = (lines + term) || '<div class="alt-none">この照会に会話はありません。</div>';
    this.el.zoneComm.classList.toggle('empty', !view.dialogue.lines.length && !view.dialogue.terminal.length);
    this.el.zoneCommUnread.classList.toggle('show', !!view.commUnread);

    // ---- 開閉（ONE-OPEN） ----
    [['problem', this.el.zoneProblem], ['result', this.el.zoneResult], ['comm', this.el.zoneComm]]
      .forEach(([key, el]) => {
        const open = view.openZone === key;
        el.classList.toggle('open', open);
        const caret = el.querySelector('.zone-caret');
        if(caret) caret.textContent = open ? '▼' : '▸';
        const header = el.querySelector('.zone-header');
        if(header) header.setAttribute('aria-expanded', String(open));
      });
    return this;
  }

  showSuccessWorkspace(on){ this.el.successPanel.classList.toggle('show', !!on); }
  hideSuccess(){
    this.el.successPanel.classList.remove('show');
    this.el.zoneProblemBody.innerHTML = '';
    this.el.zoneResultBody.innerHTML = '';
    this.el.zoneCommBody.innerHTML = '';
  }

  // ---- 実行結果セット表示 ----
  renderResultSet(resultSet){
    const head = resultSet.cols.map(c => `<th>${escCol(c)}</th>`).join('');
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
      html = '<div class="panel-title">🔁 別解</div><div class="alt-none">同じ結果になる書き方なら、この形でなくても正解。</div>';
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
