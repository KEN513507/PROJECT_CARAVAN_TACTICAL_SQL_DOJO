// js/visual-scene.js
// NEON RELAY ― VISUAL SCENE（一枚絵 + セリフ + テキスト入力）
//
// 現状はスタブ。イベントフラグ（SceneFlag）がONになるまで一切起動しない。
// 既存のQuery Workspace / Relation Workspace / ChapterSession には触れない。
//
// 責務分離:
//   SCENES / defineScene   … Definition（画像 + セリフ列 + 入力要求）
//   VisualSceneSession     … 状態遷移とペンディング管理（DOMを知らない）
//   SceneTextInput         … テキスト入力の保持と検証（DOMを知らない）
//   buildSceneView         … 画像とセリフのマージ（描画用ViewModel）
//   createSceneRenderer    … DOM描画（スタブ。呼ばれるまでDOMを作らない）
//   isSceneEnabled/mount   … イベントフラグによる有効化ゲート

// ---- 状態 ----
export const ScenePhase = Object.freeze({
  INACTIVE:       'INACTIVE',        // フラグOFF、または未開始
  IMAGE_PENDING:  'IMAGE_PENDING',   // 一枚絵の読み込み待ち
  LINE_REVEALING: 'LINE_REVEALING',  // セリフの送り出し中
  LINE_PENDING:   'LINE_PENDING',    // 次送り待ち（▽ 表示）
  AWAITING_INPUT: 'AWAITING_INPUT',  // プレイヤーのテキスト入力待ち
  INPUT_PENDING:  'INPUT_PENDING',   // 入力の確定待ち（送信保留）
  SCENE_CLEARED:  'SCENE_CLEARED'
});

// ---- イベントフラグ ----
export const SceneFlag = Object.freeze({
  VISUAL_SCENE_STUB: 'visual_scene_stub'
});

// フラグは既定でOFF。呼び出し側が明示的に渡すか、window.__NEON_SCENE_FLAGS__ で有効化する。
export function isSceneEnabled(flag, flags){
  const src = flags
    || (typeof window !== 'undefined' ? window.__NEON_SCENE_FLAGS__ : null)
    || {};
  return src[flag] === true;
}

// ---- Definition ----
// line: { speaker, text, input? }
//   input があるセリフは、送り終えた後にテキスト入力を要求する。
export function defineScene(def){
  if(!def || !def.id) throw new Error('scene id is required');
  if(!Array.isArray(def.lines) || def.lines.length === 0) throw new Error('scene lines are required');
  return {
    id: def.id,
    image: def.image || null,
    imageAlt: def.imageAlt || '',
    lines: def.lines.map(l => ({
      speaker: l.speaker || '',
      text: String(l.text || ''),
      input: l.input ? {
        id: l.input.id || 'scene_input',
        label: l.input.label || '',
        placeholder: l.input.placeholder || '',
        maxLength: l.input.maxLength || 40,
        required: l.input.required !== false
      } : null
    }))
  };
}

// スタブ用シーン。セリフは意図的なプレースホルダで、Story Canonを増やさない。
// 有効化時に実際の台詞・画像を defineScene() で差し替える。
export const STUB_SCENE = defineScene({
  id: 'VISUAL_SCENE_STUB',
  image: 'itimaie_sixyuzinnkou_sasie.png',
  imageAlt: 'PLACEHOLDER ILLUSTRATION',
  lines: [
    { speaker: 'PLACEHOLDER', text: 'PLACEHOLDER LINE 1' },
    { speaker: 'PLACEHOLDER', text: 'PLACEHOLDER LINE 2',
      input: { id: 'reply', label: 'PLACEHOLDER INPUT', placeholder: '...', maxLength: 24 } }
  ]
});

// ---- テキスト入力 ----
export class SceneTextInput {
  constructor(spec){
    this.spec = spec || { id: 'scene_input', maxLength: 40, required: true };
    this.value = '';
    this.submitted = null;
  }
  get maxLength(){ return this.spec.maxLength || 40; }
  get required(){ return this.spec.required !== false; }

  // maxLengthを超える入力は切り詰める（入力自体は拒否しない）
  setValue(raw){
    if(this.submitted !== null) return false;
    this.value = String(raw == null ? '' : raw).slice(0, this.maxLength);
    return true;
  }
  clear(){
    if(this.submitted !== null) return false;
    this.value = '';
    return true;
  }
  isValid(){
    const t = this.value.trim();
    return this.required ? t.length > 0 : true;
  }
  // 確定はSession側が行う。ここでは値の受け渡しのみ。
  commit(){
    if(this.submitted !== null) return null;
    if(!this.isValid()) return null;
    this.submitted = this.value.trim();
    return this.submitted;
  }
  reopen(){ this.submitted = null; return true; }
}

// ---- Session（状態遷移・ペンディング管理） ----
export class VisualSceneSession {
  constructor(scene, opts){
    this.scene = scene;
    this.phase = ScenePhase.INACTIVE;
    this.lineIndex = 0;
    this.revealedChars = 0;
    this.input = null;
    this.inputs = {};          // lineIndex -> 確定した入力値
    this.imageFailed = false;
    this.flags = (opts && opts.flags) || null;
    this._listeners = [];
  }

  on(event, handler){
    this._listeners.push({ event, handler });
    return () => { this._listeners = this._listeners.filter(l => l.handler !== handler); };
  }
  _emit(event, payload){
    for(const l of this._listeners){
      if(l.event === event){
        try { l.handler(payload); } catch(e){ console.error('VisualSceneSession listener error:', e); }
      }
    }
  }
  _transition(next){
    const prev = this.phase;
    if(prev === next) return;
    this.phase = next;
    this._emit('PhaseChanged', { from: prev, to: next });
  }

  get currentLine(){ return this.scene.lines[this.lineIndex] || null; }
  get isLastLine(){ return this.lineIndex >= this.scene.lines.length - 1; }
  get isPending(){
    return this.phase === ScenePhase.IMAGE_PENDING
      || this.phase === ScenePhase.LINE_PENDING
      || this.phase === ScenePhase.INPUT_PENDING;
  }

  // イベントフラグがOFFの間は起動しない（スタブの安全装置）
  start(){
    if(this.phase !== ScenePhase.INACTIVE) return false;
    if(!isSceneEnabled(SceneFlag.VISUAL_SCENE_STUB, this.flags)) return false;
    this.lineIndex = 0;
    this.revealedChars = 0;
    this._transition(this.scene.image ? ScenePhase.IMAGE_PENDING : ScenePhase.LINE_REVEALING);
    this._emit('SceneStarted', { sceneId: this.scene.id });
    return true;
  }

  imageReady(){
    if(this.phase !== ScenePhase.IMAGE_PENDING) return false;
    this._transition(ScenePhase.LINE_REVEALING);
    return true;
  }
  // 画像が無くてもセリフは進める（演出のためにシーンを止めない）
  imageFailedToLoad(){
    if(this.phase !== ScenePhase.IMAGE_PENDING) return false;
    this.imageFailed = true;
    this._transition(ScenePhase.LINE_REVEALING);
    return true;
  }

  // タイプライタの進行。描画側が任意の刻みで呼ぶ（時間はDomainに持たせない）。
  revealStep(chars = 1){
    if(this.phase !== ScenePhase.LINE_REVEALING) return false;
    const line = this.currentLine;
    if(!line) return false;
    this.revealedChars = Math.min(line.text.length, this.revealedChars + Math.max(1, chars));
    if(this.revealedChars >= line.text.length) this._transition(ScenePhase.LINE_PENDING);
    return true;
  }
  // 途中タップで全文表示（送り待ちへ）
  skipReveal(){
    if(this.phase !== ScenePhase.LINE_REVEALING) return false;
    this.revealedChars = this.currentLine.text.length;
    this._transition(ScenePhase.LINE_PENDING);
    return true;
  }

  // 次送り。入力要求があれば入力待ちへ、無ければ次のセリフ or 終了へ。
  advance(){
    if(this.phase === ScenePhase.LINE_REVEALING) return this.skipReveal();
    if(this.phase !== ScenePhase.LINE_PENDING) return false;
    const line = this.currentLine;
    if(line.input){
      this.input = new SceneTextInput(line.input);
      this._transition(ScenePhase.AWAITING_INPUT);
      return true;
    }
    return this._gotoNextLine();
  }

  _gotoNextLine(){
    if(this.isLastLine){
      this._transition(ScenePhase.SCENE_CLEARED);
      this._emit('SceneCleared', { sceneId: this.scene.id, inputs: Object.assign({}, this.inputs) });
      return true;
    }
    this.lineIndex++;
    this.revealedChars = 0;
    this._transition(ScenePhase.LINE_REVEALING);
    return true;
  }

  // 入力を保留状態へ（送信ボタン相当）。検証NGなら遷移しない。
  submitInput(){
    if(this.phase !== ScenePhase.AWAITING_INPUT) return false;
    if(!this.input || !this.input.isValid()) return false;
    this._transition(ScenePhase.INPUT_PENDING);
    this._emit('InputSubmitted', { value: this.input.value.trim() });
    return true;
  }
  // 保留中の入力を確定して次へ
  acceptInput(){
    if(this.phase !== ScenePhase.INPUT_PENDING) return false;
    const value = this.input.commit();
    if(value === null) return false;
    this.inputs[this.currentLine.input.id] = value;
    this.input = null;
    return this._gotoNextLine();
  }
  // 保留中の入力を差し戻す（再入力させる）
  rejectInput(reason){
    if(this.phase !== ScenePhase.INPUT_PENDING) return false;
    this._transition(ScenePhase.AWAITING_INPUT);
    this._emit('InputRejected', { reason: reason || null });
    return true;
  }

  reset(){
    this.phase = ScenePhase.INACTIVE;
    this.lineIndex = 0;
    this.revealedChars = 0;
    this.input = null;
    this.inputs = {};
    this.imageFailed = false;
    return true;
  }
}

// ---- 画像とセリフのマージ（描画用ViewModel） ----
export function buildSceneView(session){
  const scene = session.scene;
  const line = session.currentLine;
  const revealed = line ? line.text.slice(0, session.revealedChars) : '';
  return {
    sceneId: scene.id,
    phase: session.phase,
    active: session.phase !== ScenePhase.INACTIVE,
    image: session.imageFailed ? null : scene.image,
    imageAlt: scene.imageAlt,
    imagePending: session.phase === ScenePhase.IMAGE_PENDING,
    speaker: line ? line.speaker : '',
    text: revealed,
    fullText: line ? line.text : '',
    revealing: session.phase === ScenePhase.LINE_REVEALING,
    pending: session.isPending,
    showAdvance: session.phase === ScenePhase.LINE_PENDING,
    progress: { index: session.lineIndex, total: scene.lines.length },
    input: session.input ? {
      id: session.input.spec.id,
      label: session.input.spec.label,
      placeholder: session.input.spec.placeholder,
      maxLength: session.input.maxLength,
      value: session.input.value,
      valid: session.input.isValid(),
      awaiting: session.phase === ScenePhase.AWAITING_INPUT,
      pending: session.phase === ScenePhase.INPUT_PENDING
    } : null,
    cleared: session.phase === ScenePhase.SCENE_CLEARED
  };
}

// ---- 描画（スタブ） ----
// 呼ばれるまでDOMを作らない。既存レイアウトへ影響させないため、
// 自前のoverlayコンテナとscoped styleを遅延生成する。
const SCENE_STYLE_ID = 'neon-visual-scene-style';
const SCENE_STYLE = `
#visualScene{position:fixed;inset:0;z-index:90;display:none;background:#020617;}
#visualScene.show{display:block;}
#visualSceneImage{position:absolute;inset:0;background-size:cover;background-position:center top;}
#visualSceneImage.pending{opacity:0;}
#visualSceneBox{position:absolute;left:0;right:0;bottom:0;padding:0 12px calc(env(safe-area-inset-bottom,0px) + 14px);}
#visualSceneName{display:inline-block;padding:5px 14px;border:1px solid #334155;border-bottom:none;
  border-radius:10px 10px 0 0;background:rgba(15,23,42,.92);color:#e2e8f0;font-size:14px;font-weight:800;}
#visualSceneName:empty{display:none;}
#visualSceneText{min-height:84px;padding:12px 14px;border:1px solid #334155;border-radius:0 10px 10px 10px;
  background:rgba(15,23,42,.92);color:#e2e8f0;font-size:15px;line-height:1.7;white-space:pre-wrap;}
#visualSceneAdvance{position:absolute;right:22px;bottom:calc(env(safe-area-inset-bottom,0px) + 20px);
  color:#22d3ee;font-size:14px;opacity:0;transition:opacity .2s;}
#visualSceneAdvance.show{opacity:1;}
#visualSceneInput{display:none;gap:8px;margin-top:8px;}
#visualSceneInput.show{display:flex;}
#visualSceneInput input{flex:1 1 auto;min-height:48px;padding:0 12px;border:1px solid #334155;border-radius:9px;
  background:#111827;color:#e2e8f0;font-size:16px;}
#visualSceneInput button{flex:0 0 96px;min-height:48px;border:1px solid #22d3ee;border-radius:9px;
  background:#0e7490;color:#ecfeff;font-size:15px;font-weight:800;}
#visualSceneInput button:disabled{opacity:.4;}
`;

export function createSceneRenderer(root){
  const doc = (root && root.ownerDocument) || (typeof document !== 'undefined' ? document : null);
  if(!doc) throw new Error('DOM is not available');
  const host = root || doc.body;

  if(!doc.getElementById(SCENE_STYLE_ID)){
    const style = doc.createElement('style');
    style.id = SCENE_STYLE_ID;
    style.textContent = SCENE_STYLE;
    doc.head.appendChild(style);
  }

  let el = doc.getElementById('visualScene');
  if(!el){
    el = doc.createElement('div');
    el.id = 'visualScene';
    el.innerHTML = `
      <div id="visualSceneImage"></div>
      <div id="visualSceneBox">
        <div id="visualSceneName"></div>
        <div id="visualSceneText"></div>
        <div id="visualSceneInput">
          <input type="text" id="visualSceneInputField" />
          <button type="button" id="visualSceneInputSubmit">送信</button>
        </div>
      </div>
      <div id="visualSceneAdvance">▽</div>`;
    host.appendChild(el);
  }

  const $ = id => doc.getElementById(id);
  const api = {
    element: el,
    handlers: { onAdvance: null, onInputChange: null, onInputSubmit: null },
    render(view){
      el.classList.toggle('show', !!view.active);
      const img = $('visualSceneImage');
      img.style.backgroundImage = view.image ? `url('${view.image}')` : '';
      img.classList.toggle('pending', !!view.imagePending);
      $('visualSceneName').textContent = view.speaker || '';
      $('visualSceneText').textContent = view.text || '';
      $('visualSceneAdvance').classList.toggle('show', !!view.showAdvance);
      const inputRow = $('visualSceneInput');
      inputRow.classList.toggle('show', !!view.input);
      if(view.input){
        const field = $('visualSceneInputField');
        field.placeholder = view.input.placeholder || '';
        field.maxLength = view.input.maxLength;
        if(field.value !== view.input.value) field.value = view.input.value;
        field.disabled = !view.input.awaiting;
        $('visualSceneInputSubmit').disabled = !view.input.awaiting || !view.input.valid;
      }
      return api;
    },
    destroy(){
      el.remove();
      const style = doc.getElementById(SCENE_STYLE_ID);
      if(style) style.remove();
    }
  };

  el.addEventListener('click', e => {
    if(e.target.closest('#visualSceneInput')) return; // 入力欄のタップは送りに使わない
    if(api.handlers.onAdvance) api.handlers.onAdvance();
  });
  $('visualSceneInputField').addEventListener('input', e => {
    if(api.handlers.onInputChange) api.handlers.onInputChange(e.target.value);
  });
  $('visualSceneInputSubmit').addEventListener('click', () => {
    if(api.handlers.onInputSubmit) api.handlers.onInputSubmit();
  });

  return api;
}

// ---- 有効化ゲート ----
// フラグOFFなら null を返し、DOMも作らない。呼び出し側は結果がnullなら何もしない。
export function mountVisualScene(opts){
  const o = opts || {};
  const flag = o.flag || SceneFlag.VISUAL_SCENE_STUB;
  if(!isSceneEnabled(flag, o.flags)) return null;

  const scene = o.scene || STUB_SCENE;
  const session = new VisualSceneSession(scene, { flags: o.flags });
  const renderer = o.renderer || createSceneRenderer(o.root);
  const draw = () => renderer.render(buildSceneView(session));

  renderer.handlers.onAdvance = () => {
    if(session.phase === ScenePhase.INPUT_PENDING){ session.acceptInput(); draw(); return; }
    session.advance();
    draw();
  };
  renderer.handlers.onInputChange = v => { if(session.input){ session.input.setValue(v); draw(); } };
  renderer.handlers.onInputSubmit = () => { session.submitInput(); draw(); };

  session.on('PhaseChanged', draw);
  session.start();
  if(session.phase === ScenePhase.IMAGE_PENDING) session.imageReady();
  draw();
  return { session, renderer, draw };
}
