import { MISSIONS, LABELS, VALUE_LABELS, tablesForMission } from './beginner-data.js';

const STORAGE_KEY = 'neon_relay_beginner_v1';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const label = name => LABELS[name] || LABELS[name.replace(/^\w+\./, '')] || LABELS[Object.keys(LABELS).find(key => key.toLowerCase() === name.toLowerCase())] || '照会列';
const display = value => value === null ? 'NULL（未報告）' : value === '' ? '空文字（長さ0）' : VALUE_LABELS[value] ? `${VALUE_LABELS[value]} · ${value}` : String(value);
const readProgress = () => {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (data?.version === 1 && Array.isArray(data.clears) && Array.isArray(data.history)) return data;
  } catch { /* 保存できない環境でも調査を続けられる。 */ }
  return { version: 1, index: 0, clears: [], history: [], drafts: {} };
};
const progress = readProgress();
let index = Math.max(0, Math.min(19, Number(progress.index) || 0, progress.clears.length));
let state;
let worker;
let requestId = 0;
let pending = null;
const app = document.getElementById('app');

function persist() {
  progress.index = index;
  progress.drafts ||= {};
  progress.drafts[index] = { sql: state.sql, question: state.question, assist: state.assist, part: state.part, trace: state.trace };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); } catch { state.storageWarning = true; }
}

function loadMission() {
  const mission = MISSIONS[index];
  const draft = progress.drafts?.[index] || {};
  state = {
    tab: 'query', tables: tablesForMission(index + 1), selectedTable: mission.SOURCE_TABLES[0], columns: {}, page: 0,
    sql: draft.sql ?? mission.starter ?? '', question: draft.question || '', interpretation: '', assist: draft.assist || 0,
    part: draft.part || 0, trace: draft.trace || 0, prediction: '', classifications: {}, result: null,
    passed: false, cleared: false, busy: false, hint: '', message: '', started: Date.now(), attempts: 0, storageWarning: false,
  };
  if (mission.trace && state.trace < mission.trace.length) state.selectedTable = mission.trace[state.trace].table;
  render();
}

function sqlClient(sql) {
  if (!worker) worker = new Worker(new URL('./beginner-worker.js', import.meta.url));
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    const timeout = setTimeout(() => {
      worker.terminate(); worker = null; pending = null;
      reject(new Error('照会を中断しました。対象や結合条件を絞って再実行できます。'));
    }, 12000);
    pending = { reject, timeout };
    worker.onmessage = ({ data }) => {
      if (data.id !== id) return;
      clearTimeout(timeout); pending = null; resolve(data);
    };
    worker.onerror = () => {
      clearTimeout(timeout); worker.terminate(); worker = null; pending = null;
      reject(new Error('照会エンジンを読み込めませんでした。通信状態を確認して再実行してください。'));
    };
    worker.postMessage({ id, index, sql, part: state.part });
  });
}

function words() {
  const n = index + 1;
  return ['SELECT', 'FROM', ',', ...(n >= 4 ? ['WHERE', '='] : []), ...(n >= 5 ? ['AND'] : []),
    ...(n >= 6 ? ['OR', 'NOT', 'IN', '(', ')'] : []), ...(n >= 7 ? ['ORDER BY', 'ASC', 'DESC'] : []),
    ...(n >= 8 ? ['COUNT(*)'] : []), ...(n >= 9 ? ['SUM('] : []), ...(n >= 10 ? ['AVG(', 'MIN(', 'MAX('] : []),
    ...(n >= 11 ? ['GROUP BY'] : []), ...(n >= 12 ? ['HAVING', '>'] : []), ...(n >= 13 ? ['AS'] : []),
    ...(n >= 14 ? ['INNER JOIN', 'ON'] : []), ...(n >= 17 ? ['IS NULL'] : []),
    ...(n >= 18 ? ['LEFT JOIN'] : []), ...(n >= 19 ? ['NOT EXISTS', 'SELECT 1'] : [])];
}

function prompt() {
  const mission = MISSIONS[index];
  if (mission.followup && state.part === 1) return mission.followup.prompt;
  if (mission.equivalents && state.part > 0) return state.part === 1
    ? '同じ住民IDが返るように、区画のIN条件をORで書き換えて照会しよう。'
    : '状態の条件をNOTで書き換え、同じ住民IDが返るか確かめよう。';
  return mission.PLAYER_PROMPT;
}

function dataTable(result, selectable = false) {
  const pageCount = Math.max(1, Math.ceil(result.rows.length / 6));
  state.page = Math.min(state.page, pageCount - 1);
  const offset = state.page * 6;
  return `<div class="nr-table-wrap"><table><thead><tr>${result.cols.map(c => `<th>${esc(label(c))}<small>${esc(c)}</small></th>`).join('')}${selectable ? '<th class="nr-pick-heading">照合</th>' : ''}</tr></thead><tbody>${result.rows.slice(offset, offset + 6).map((row, i) => `<tr>${row.map(v => `<td class="${v === null ? 'nr-null' : ''}">${esc(display(v))}</td>`).join('')}${selectable ? `<td><button class="nr-pick" data-pick="${offset + i}" aria-label="${esc(row.map(display).join('、'))}を照合">選ぶ</button></td>` : ''}</tr>`).join('')}</tbody></table></div>${result.rows.length === 0 ? '<p class="nr-muted">該当する行はありません。</p>' : ''}<div class="nr-pagination"><span>全${result.rows.length}行 · ${state.page + 1}/${pageCount}</span><button data-page="-1" ${state.page === 0 ? 'disabled' : ''} aria-label="前の6行">前へ</button><button data-page="1" ${state.page + 1 === pageCount ? 'disabled' : ''} aria-label="次の6行">次へ</button></div>`;
}

function queryPanel() {
  const mission = MISSIONS[index];
  const tb = state.tables[state.selectedTable];
  const literals = [...new Set(tb.rows.flat().filter(value => value !== null))].slice(0, 32);
  return `<details class="nr-context" ${index === 0 ? 'open' : ''}><summary>今回の調査</summary><p>${index === 0 ? '2043年、環状都市カナタ。53人が行政上消失した。あなたは第九保全局の臨時監査員として、第4アーカイブの端末を開く。' : ''}${esc(mission.STORY_NEED)}</p></details>${index === 19 ? `<label class="nr-field">あなたの問い<textarea id="nr-question" rows="2" placeholder="記録を見て、確かめたいことを書く">${esc(state.question)}</textarea></label>` : ''}
    ${index < 3 ? `<p class="nr-coach">${['NORA「SELECTに取り出す列、FROMに調べる表を書きます。下の部品をタップしても入力できます。」', 'NORA「前回のSELECTに列を足します。列と列の間にはカンマを置いてください。」', 'NORA「今回は必要な3列を選んでください。返る行数も、実行前に記録できます。」'][index]}</p>` : ''}
    ${mission.trace ? `<div class="nr-inline">記録の照合 ${state.trace}/${mission.trace.length}<button data-action="trace">対応元をたどる</button></div>` : ''}
    <label class="nr-field">照会コマンド<textarea id="nr-sql" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" placeholder="SELECT … FROM …" rows="5">${esc(state.sql)}</textarea></label>
    ${mission.prediction !== undefined ? `<label class="nr-field nr-prediction">予測する結果行数<input id="nr-prediction" inputmode="numeric" type="number" min="0" value="${esc(state.prediction)}" placeholder="行数"><span>値の合計ではなく、返る行の数</span></label>` : ''}
    ${mission.classifications ? `<fieldset class="nr-classifications"><legend>空欄の意味を記録する</legend>${['E442の確認済み人数', 'E443の確認済み人数', 'E444の担当者メモ'].map((name, i) => `<label>${name}<select data-classification="${i}"><option value="">意味を選ぶ</option>${['未報告', '報告済み0人', '空文字'].map(v => `<option ${state.classifications[i] === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`).join('')}</fieldset>` : ''}
    <details class="nr-parts" ${index < 3 ? 'open' : ''}><summary>構文・表・列を挿入</summary><div class="nr-tokens">${words().map(w => `<button data-token="${esc(w)}">${esc(w)}</button>`).join('')}</div><label class="nr-field">参照する表<select id="nr-token-table">${Object.keys(state.tables).map(name => `<option value="${name}" ${name === state.selectedTable ? 'selected' : ''}>${esc(label(name))}</option>`).join('')}</select></label><div class="nr-tokens"><button data-token="${state.selectedTable}">${esc(label(state.selectedTable))}<small>${state.selectedTable}</small></button>${tb.cols.map(c => `<button data-token="${c}">${esc(label(c))}<small>${c}</small></button>`).join('')}</div></details>
    ${index >= 3 ? `<details class="nr-literals"><summary>記録の値を条件に挿入</summary><div class="nr-tokens">${literals.map(value => `<button data-token="${esc(typeof value === 'number' || (value !== '' && Number.isFinite(Number(value))) ? String(value) : `'${String(value).replace(/'/g, "''")}'`)}">${esc(display(value))}</button>`).join('')}</div><p class="nr-muted">現在参照している表の値です。文字列には引用符を付けて挿入します。</p></details>` : ''}
    <div class="nr-help"><button data-action="hint">必要なときにヒント</button><button data-action="history">照会履歴</button></div>
    ${state.hint ? `<aside class="nr-hint">${esc(state.hint)}</aside>` : ''}`;
}

function recordsPanel() {
  const mission = MISSIONS[index];
  const tb = state.tables[state.selectedTable];
  const columns = state.columns[state.selectedTable] || tb.cols.slice(0, 3);
  const selected = tb.cols.map((col, i) => columns.includes(col) ? i : -1).filter(i => i >= 0);
  const currentTrace = mission.trace?.[state.trace];
  return `<label class="nr-field">調査資料<select id="nr-table">${Object.keys(state.tables).map(name => `<option value="${name}" ${name === state.selectedTable ? 'selected' : ''}>${esc(label(name))}${mission.SOURCE_TABLES.includes(name) ? '' : '（保全済み）'}</option>`).join('')}</select></label>
    <p class="nr-provenance">${esc(tb.purpose)}</p>
    ${currentTrace ? `<div class="nr-trace">照合 ${state.trace + 1}/${mission.trace.length} · ${esc(label(currentTrace.table))}の対応元を選ぶ${state.trace ? `<small>直前の対応元：${esc(mission.trace[state.trace - 1].value)}</small>` : ''}</div>` : mission.trace ? '<p class="nr-trace">対応元の照合が揃いました。照会で復元を確かめてください。</p>' : ''}
    <details class="nr-columns"><summary>表示する列（最大3列）</summary>${tb.cols.map(col => `<label><input type="checkbox" data-column="${col}" ${columns.includes(col) ? 'checked' : ''}>${esc(label(col))}<small>${col}${tb.keys?.includes(col) ? ' · 一意キー' : ''}</small></label>`).join('')}</details>
    ${dataTable({ cols: selected.map(i => tb.cols[i]), rows: tb.rows.map(row => selected.map(i => row[i])) }, !!currentTrace && currentTrace.table === state.selectedTable)}`;
}

function resultPanel() {
  const mission = MISSIONS[index];
  if (!state.result) return '<div class="nr-empty">照会すると、ここに記録が返ります。<br>結果を先に見て、その意味を確かめてください。</div>';
  return `${dataTable(state.result)}${state.passed ? `<div class="nr-evidence"><span>${esc({ 'RAW FACT': '保存されていた記録', 'RECONSTRUCTED FACT': '関係から復元した事実', 'DERIVED FACT': '関係から導いた事実' }[mission.EVIDENCE_TYPE])}</span><p>${esc(mission.EVIDENCE)}</p></div>${index === 19 && !state.cleared ? `<label class="nr-field">証拠から言えること<textarea id="nr-interpretation" rows="3" placeholder="結果と、そこからはまだ断定できないことを記す">${esc(state.interpretation)}</textarea></label>` : ''}${state.cleared ? `<details class="nr-after" open><summary>保全後の通信</summary><p>${esc(mission.COMMUNICATION_AFTER_CLEAR)}</p><p>${esc(mission.NEXT_STORY_HOOK)}</p></details>` : '<p class="nr-muted">結果を確認したら、証拠として保全してください。</p>'}` : ''}`;
}

function render() {
  const mission = MISSIONS[index];
  app.innerHTML = `<div class="nr-shell"><header class="nr-header"><div class="nr-brand">NEON RELAY<small>第九保全局 · CASE 53</small></div><button id="nr-missions" aria-label="調査一覧を開く">${String(index + 1).padStart(2, '0')} / 20</button></header>
    <section class="nr-mission"><span class="nr-kicker">2043 · 環状都市カナタ</span><h1>${esc(mission.TITLE)}</h1><p>${esc(prompt())}</p></section>
    <nav class="nr-tabs" aria-label="調査ワークスペース">${[['records', '記録'], ['query', '照会'], ['result', '結果']].map(([tab, name]) => `<button data-tab="${tab}" aria-current="${state.tab === tab ? 'page' : 'false'}">${name}${tab === 'result' && state.result ? `<span>${state.result.rows.length}</span>` : ''}</button>`).join('')}</nav>
    <main class="nr-workspace" id="nr-workspace">${state.tab === 'query' ? queryPanel() : state.tab === 'records' ? recordsPanel() : resultPanel()}</main>
    <div class="nr-status" role="status" aria-live="polite">${esc(state.storageWarning ? 'この環境では進捗を保存できません。調査は続けられます。' : state.message)}</div>
    <footer class="nr-actions"><button data-action="${state.tab === 'query' ? 'records' : 'query'}">${state.tab === 'query' ? '記録を見る' : '照会へ戻る'}</button><button class="nr-primary" id="nr-primary" data-action="${state.tab === 'result' && state.passed ? state.cleared ? 'next' : 'save' : 'run'}" ${state.busy ? 'disabled' : ''}>${state.busy ? '照会中…' : state.tab === 'result' && state.passed ? state.cleared ? index === 19 ? '調査を続ける' : '次の調査へ' : '証拠として保全' : '照会を実行'}</button></footer></div><dialog id="nr-dialog"></dialog>`;
  bind();
}

function insertToken(token) {
  const field = document.getElementById('nr-sql');
  if (!field) return;
  const begin = field.selectionStart;
  const end = field.selectionEnd;
  const before = state.sql.slice(0, begin);
  const after = state.sql.slice(end);
  const text = `${before && !/[\s(,.]$/.test(before) ? ' ' : ''}${token}${/[(.]$/.test(token) ? '' : ' '}`;
  state.sql = before + text + after;
  field.value = state.sql;
  field.focus(); field.setSelectionRange(begin + text.length, begin + text.length);
  persist();
}

function dialog(content) {
  const element = document.getElementById('nr-dialog');
  element.innerHTML = `<button class="nr-close" aria-label="閉じる">閉じる</button>${content}`;
  element.querySelector('.nr-close').onclick = () => element.close();
  element.showModal();
}

function historyDialog() {
  dialog(`<h2>照会履歴</h2><p>実行した照会を再利用できます。</p>${progress.history.slice().reverse().map((record, i) => `<article class="nr-history"><h3>調査${record.index + 1} · ${esc(MISSIONS[record.index].TITLE)}</h3><pre>${esc(record.sql)}</pre><span>結果 ${record.result?.rows.length ?? 0}行</span><button data-reuse="${progress.history.length - 1 - i}">この照会を使う</button></article>`).join('') || '<p>まだ照会履歴はありません。</p>'}`);
  document.querySelectorAll('[data-reuse]').forEach(button => { button.onclick = () => {
    state.sql = progress.history[Number(button.dataset.reuse)].sql; state.tab = 'query'; persist(); render();
  }; });
}

function bind() {
  document.querySelectorAll('[data-tab]').forEach(button => { button.onclick = () => { state.tab = button.dataset.tab; state.page = 0; render(); }; });
  document.querySelectorAll('[data-token]').forEach(button => { button.onclick = () => insertToken(button.dataset.token); });
  document.querySelectorAll('[data-action]').forEach(button => { button.onclick = () => action(button.dataset.action); });
  document.querySelectorAll('[data-page]').forEach(button => { button.onclick = () => { state.page += Number(button.dataset.page); render(); }; });
  document.querySelectorAll('[data-pick]').forEach(button => { button.onclick = () => {
    const target = MISSIONS[index].trace[state.trace];
    const tb = state.tables[state.selectedTable];
    const row = tb.rows[Number(button.dataset.pick)];
    if (row[tb.cols.indexOf(target.key)] !== target.value) {
      state.message = '対象からのキーの対応が確認できません。元の記録へ戻って見直せます。';
    } else {
      state.trace++; state.message = '対応元を保全しました。'; state.page = 0;
      if (state.trace < MISSIONS[index].trace.length) state.selectedTable = MISSIONS[index].trace[state.trace].table;
      else state.tab = 'query';
    }
    persist(); render();
  }; });
  for (const name of ['nr-table', 'nr-token-table']) {
    const select = document.getElementById(name);
    if (select) select.onchange = () => { state.selectedTable = select.value; state.page = 0; render(); };
  }
  document.querySelectorAll('[data-column]').forEach(input => { input.onchange = () => {
    const tb = state.tables[state.selectedTable];
    const current = state.columns[state.selectedTable] || tb.cols.slice(0, 3);
    const changed = input.checked ? [...current, input.dataset.column] : current.filter(x => x !== input.dataset.column);
    if (changed.length > 3 || changed.length === 0) { input.checked = !input.checked; return; }
    state.columns[state.selectedTable] = changed; render();
  }; });
  for (const [id, key] of [['nr-sql', 'sql'], ['nr-question', 'question'], ['nr-prediction', 'prediction'], ['nr-interpretation', 'interpretation']]) {
    const field = document.getElementById(id);
    if (field) field.oninput = () => { state[key] = field.value; if (key === 'sql') state.passed = false; persist(); };
  }
  document.querySelectorAll('[data-classification]').forEach(select => { select.onchange = () => { state.classifications[select.dataset.classification] = select.value; }; });
  document.getElementById('nr-missions').onclick = () => {
    dialog(`<h2>監査記録</h2><p>保全済み ${progress.clears.length}/20</p><div class="nr-mission-list">${MISSIONS.map((m, i) => `<button data-mission="${i}" ${i > progress.clears.length ? 'disabled' : ''}><span>${String(i + 1).padStart(2, '0')} · ${esc(m.TITLE)}</span><small>${progress.clears[i] ? { INDEPENDENT: '自力で保全', ASSISTED: '支援あり', PRACTICE: '練習' }[progress.clears[i].mode] : i === progress.clears.length ? '調査中' : '未着手'}</small></button>`).join('')}</div>`);
    document.querySelectorAll('[data-mission]').forEach(button => { button.onclick = () => {
      if (state.busy) return;
      persist(); index = Number(button.dataset.mission); loadMission(); persist();
    }; });
  };
}

async function run() {
  if (state.busy) return;
  const mission = MISSIONS[index];
  if (index === 19 && state.question.trim().length < 6) { state.message = 'まず、確かめたいことをあなたの言葉で記録してください。'; state.tab = 'query'; render(); return; }
  if (mission.prediction !== undefined && !/^\d+$/.test(state.prediction)) { state.message = '実行前に、返る行数を数字で予測してください。'; state.tab = 'query'; render(); return; }
  state.busy = true; state.message = ''; state.attempts++; render();
  try {
    const judgment = await sqlClient(state.sql);
    state.busy = false; state.page = 0; state.passed = false; state.cleared = false;
    if (judgment.error) { state.message = judgment.error; state.tab = 'query'; render(); return; }
    state.result = judgment.result; state.tab = 'result';
    progress.history.push({ index, sql: state.sql, result: judgment.result, question: state.question, elapsedMs: Date.now() - state.started, assist: state.assist });
    progress.history = progress.history.slice(-100);
    state.message = index === 19 && !judgment.ok ? '照会完了。この結果を保存し、次の疑問も調べられます。' : judgment.reason;
    if (judgment.ok) {
      if (mission.prediction !== undefined && Number(state.prediction) !== mission.prediction) {
        state.message = `照会は成立しました。結果は${judgment.result.rows.length}行です。予測を訂正して再確認できます。`;
        state.assist = Math.max(1, state.assist);
      } else if (mission.trace && state.trace < mission.trace.length) {
        state.message = '照会は成立しました。記録タブで、対応元の行もたどって保全してください。';
      } else if (mission.classifications && mission.classifications.some((v, i) => state.classifications[i] !== v)) {
        state.message = '照会は成立しました。照会タブで、0・空文字・未報告の意味も確認してください。';
      } else if (mission.equivalents && !new RegExp(['\\bIN\\b', '\\bOR\\b', '\\bNOT\\b'][state.part], 'i').test(state.sql)) {
        state.message = `${['IN', 'OR', 'NOT'][state.part]}でも同じ対象を確かめてください。`;
      } else if ((mission.followup && state.part === 0) || (mission.equivalents && state.part < 2)) {
        state.part++; state.message = '結果を保全しました。同じ考え方で、次の照会を組み立ててください。';
        state.tab = 'query';
      } else { state.passed = true; }
    }
    persist(); render();
  } catch (error) { state.busy = false; state.message = error.message; render(); }
}

function action(name) {
  if (name === 'run') return run();
  if (name === 'history') return historyDialog();
  if (name === 'trace') {
    state.tab = 'records'; state.page = 0;
    state.selectedTable = MISSIONS[index].trace[Math.min(state.trace, MISSIONS[index].trace.length - 1)].table;
  } else if (name === 'hint') {
    state.assist = Math.min(3, state.assist + 1);
    state.hint = MISSIONS[index][['HINT_1', 'HINT_2', 'FINAL_HINT'][state.assist - 1]];
    persist();
  } else if (name === 'save') {
    if (!state.passed) return;
    if (index === 19 && state.interpretation.trim().length < 8) { state.message = '証拠から言えることを、自分の言葉で記録してください。'; render(); return; }
    const mode = state.assist === 0 ? 'INDEPENDENT' : state.assist >= 3 ? 'PRACTICE' : 'ASSISTED';
    const record = { mode, question: state.question, interpretation: state.interpretation, sql: state.sql, elapsedMs: Date.now() - state.started, attempts: state.attempts };
    progress.clears[index] = record;
    state.cleared = true; state.message = '証拠を保全しました。'; persist();
  } else if (name === 'next') {
    if (index === 19) { state.tab = 'query'; state.question = ''; state.interpretation = ''; state.passed = false; state.cleared = false; state.sql = ''; state.message = '調査端末を継続しています。次の問いを記録できます。'; }
    else { index++; loadMission(); persist(); return; }
  } else { state.tab = name; state.page = 0; }
  render();
}

window.addEventListener('pagehide', () => { persist(); if (pending) clearTimeout(pending.timeout); worker?.terminate(); });
loadMission();
