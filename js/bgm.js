// js/bgm.js
// ============================================================
// BGM CONTRACT
// ------------------------------------------------------------
// つなぎ目でぶつ切りにしない。フェードアウトとフェードインを重ねて繋ぐ。
//   ループの継ぎ目 : 曲の終わり際に同じ曲の頭を重ねてクロスフェード
//   曲の切り替え   : 旧曲を落としながら新曲を上げる
//
// メモリは増やさない:
//   - 1曲あたり <audio> は最大2本。2本目は最初の継ぎ目が近づいたときに初めて作る
//     （同じ src なので取得は1回。以降は2本を交互に使い回し、作り直さない）
//   - 曲を切り替えたら前の曲の要素は src を外して即座に解放する
//   - 音量の補間は全部まとめて1本のタイマーで回す。仕事が無ければタイマーも止める
//   - 音源を丸ごと復号する Web Audio のバッファは使わない（数十MBになるため）
//
// 音量は Web Audio の GainNode で動かす。iOS Safari は audio.volume を無視するので、
// .volume だけでフェードすると iPhone でぶつ切りのままになる。
// GainNode は <audio> を流したまま通すだけなので、復号バッファは持たない（メモリはほぼ0）。
// AudioContext が使えない環境では .volume へ自動で落とす。
// ============================================================

// 音源の置き場所。実体は assets/title/audio/ にある。
const AUDIO_DIR = 'assets/title/audio/';
const FILE_MAP = {
  title:        'title_loop.m4a',
  airy:         'airy_loop.m4a',
  pulse:        'pulse_loop.m4a',
  sector:       'sector_loop.m4a',
  transmission: 'transmission_loop.m4a',
  urgent:       'urgent_loop.m4a',
  victory:      'victory.m4a'
};

// ループの継ぎ目を重ねる長さ(ms)。曲が短ければ曲長の1/4まで縮める。
export const CROSSFADE_MS = 1600;
// 曲を切り替えるときに重ねる長さ(ms)。
export const SWITCH_MS = 900;
// 音量を動かすタイマーの刻み(ms)。フェード中と再生中だけ回る。
const TICK_MS = 50;

// ---- 音源ファイルが無いときの代替 ----
// audio/*.m4a は配布に含まれていないため、Web Audio で静かなアンビエントを合成する。
// 目的は「無音でない」ことであって曲を鳴らすことではないので、
// 2音を重ねてゆっくり揺らすだけに留める（CPUもメモリもほぼ使わない）。
const SYNTH_ROOT = {
  title: 146.83,        // D3
  airy: 174.61,         // F3
  pulse: 130.81,        // C3
  sector: 155.56,       // Eb3
  transmission: 196.00, // G3
  urgent: 116.54,       // Bb2
  victory: 261.63       // C4
};

class AmbientSynth {
  constructor(){ this.ctx = null; this.nodes = null; this.muted = false; }

  start(name, muted){
    this.stop();
    this.muted = muted;
    const root = SYNTH_ROOT[name];
    if(!root) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return;
    if(!this.ctx) this.ctx = new AC();
    if(this.ctx.state === 'suspended') this.ctx.resume();

    const now = this.ctx.currentTime;
    const level = muted ? 0 : 0.05;
    const out = this.ctx.createGain();
    // 合成音もいきなり鳴らさない。前の音が落ちる間に重ねて上げる。
    out.gain.setValueAtTime(0, now);
    out.gain.linearRampToValueAtTime(level, now + SWITCH_MS / 1000);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.connect(out);
    out.connect(this.ctx.destination);

    // 主音と5度。わずかにずらして揺らぎを作る。
    const oscs = [root, root * 1.5, root * 2.005].map((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = i === 2 ? 'sine' : 'triangle';
      o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.value = i === 0 ? 0.6 : (i === 1 ? 0.28 : 0.14);
      o.connect(g); g.connect(filter);
      o.start();
      return o;
    });

    // ゆっくりした音量の揺らぎ
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = muted ? 0 : 0.02;
    lfo.connect(lfoGain); lfoGain.connect(out.gain);
    lfo.start();

    this.nodes = { out, filter, oscs, lfo, lfoGain };
  }

  setMuted(muted){
    this.muted = muted;
    if(this.nodes){
      this.nodes.out.gain.cancelScheduledValues(this.ctx.currentTime);
      this.nodes.out.gain.value = muted ? 0 : 0.05;
      this.nodes.lfoGain.gain.value = muted ? 0 : 0.02;
    }
  }

  stop(){
    if(!this.nodes) return;
    const { out, oscs, lfo } = this.nodes;
    try {
      out.gain.cancelScheduledValues(this.ctx.currentTime);
      out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.12);
      const all = [...oscs, lfo];
      setTimeout(() => all.forEach(o => { try { o.stop(); } catch(e){} }), 400);
    } catch(e){}
    this.nodes = null;
  }
}

export class BgmEngine {
  constructor(){
    this.currentName = null;
    this.volume = 0.25;
    this.unlocked = false;
    this.muted = false;
    this.audioElements = new Set();   // 生きている <audio> 全部（消音の一括切替に使う）
    this.ctx = null;                  // 音量を動かすためだけの AudioContext
    this.master = null;               // 全体の消音用。個々のゲインはここへ集める
    this.deck = null;                 // 再生中の曲。{ name, file, loop, vol, a:[el,el|null], i }
    this.fades = [];                  // 進行中の音量補間
    this.timer = null;                // 全部まとめて回す唯一のタイマー
    this.synth = new AmbientSynth();
    this.useSynth = false;            // 音源が読めなかったら合成へ切り替える
  }

  // 呼び出し側は今まで通り bgm.current を見られる。
  get current(){ return this.deck ? this.deck.a[this.deck.i] : null; }

  setMuted(muted){
    this.muted = muted;
    for(const audio of this.audioElements) audio.muted = muted;
    if(this.master) this.master.gain.value = muted ? 0 : 1;
    this.synth.setMuted(muted);
  }

  unlock(){
    if(navigator.audioSession){
      try { navigator.audioSession.type = 'playback'; } catch(e){}
    }
    this.unlocked = true;
  }

  // ---- 音量の出口 ----
  // <audio> を GainNode 経由で鳴らす。iOS でも音量を動かせるようにするため。
  // 作れない環境（AudioContext 無し / 経路を作れない）では .volume へ落とす。
  _out(a){
    if(a._gain !== undefined) return a._gain;
    a._gain = null;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if(AC){
        if(!this.ctx){
          this.ctx = new AC();
          this.master = this.ctx.createGain();
          this.master.gain.value = this.muted ? 0 : 1;
          this.master.connect(this.ctx.destination);
        }
        if(this.ctx.state === 'suspended') this.ctx.resume();
        const src = this.ctx.createMediaElementSource(a);   // 要素1本につき1回だけ
        const g = this.ctx.createGain();
        g.gain.value = 0;
        src.connect(g); g.connect(this.master);
        a._gain = g;
      }
    } catch(e){ a._gain = null; }
    return a._gain;
  }

  _setVol(a, v){
    const g = this._out(a);
    if(g) g.gain.value = v;
    else a.volume = v;
  }

  _getVol(a){
    const g = a._gain;
    return g ? g.gain.value : a.volume;
  }

  // ---- 音量の補間 ----
  // shape 'power': 片端が0のときの重ね方。sin/cos で繋ぐと合計の音量感が保たれ、
  //                真ん中がへこまない（直線で繋ぐと重なった瞬間だけ痩せて聞こえる）。
  // shape 'linear': 単純な増減（ダッキングなど、重ねない用途）。
  _fade(el, to, ms, shape = 'linear', then){
    if(!el) return;
    this.fades = this.fades.filter(f => f.el !== el);   // 同じ要素の古い指示は捨てる
    this.fades.push({ el, from: this._getVol(el), to, t0: performance.now(), ms, shape, then });
    this._run();
  }

  _run(){
    if(this.timer !== null) return;
    this.timer = setInterval(() => this._tick(), TICK_MS);
  }

  _tick(){
    const now = performance.now();
    for(const f of this.fades.slice()){
      const k = f.ms > 0 ? Math.min(1, (now - f.t0) / f.ms) : 1;
      const v = f.shape === 'power'
        ? f.from * Math.cos(k * Math.PI / 2) + f.to * Math.sin(k * Math.PI / 2)
        : f.from + (f.to - f.from) * k;
      try { this._setVol(f.el, Math.max(0, Math.min(1, v))); } catch(e){}
      if(k >= 1){
        this.fades.splice(this.fades.indexOf(f), 1);
        try { f.then?.(); } catch(e){}
      }
    }
    this._watchSeam();
    // やることが無くなったらタイマーを止める（鳴っていない間はCPUを使わない）
    if(!this.fades.length && !(this.deck && this.deck.loop)){
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // ---- ループの継ぎ目 ----
  // 終わり際になったら、同じ曲の頭を別の要素で重ねて鳴らし、旧を落として新を上げる。
  _watchSeam(){
    const d = this.deck;
    if(!d || !d.loop || d.crossing) return;
    const el = d.a[d.i];
    if(!el || el.paused) return;
    const dur = el.duration;
    if(!isFinite(dur) || dur <= 0) return;
    const ms = Math.min(CROSSFADE_MS, dur * 250);   // 短い曲では重ねる時間も短く
    if((dur - el.currentTime) * 1000 > ms) return;

    const j = d.i ^ 1;
    if(!d.a[j]) d.a[j] = this._make(d);             // 2本目はここで初めて作る
    const next = d.a[j];
    try { next.currentTime = 0; } catch(e){}
    this._setVol(next, 0);
    next.play?.()?.catch(() => {});
    this._fade(next, d.vol, ms, 'power');
    this._fade(el, 0, ms, 'power', () => {
      try { el.pause(); el.currentTime = 0; } catch(e){}
    });
    d.i = j;
    d.crossing = true;
    setTimeout(() => { if(this.deck === d) d.crossing = false; }, ms + 80);
  }

  _make(d){
    const a = new Audio(AUDIO_DIR + d.file);
    a.loop = false;              // 継ぎ目は自前で繋ぐ。ブラウザ任せにすると瞬間で戻る。
    a.preload = 'auto';
    a.muted = this.muted;
    this._setVol(a, 0);
    this.audioElements.add(a);
    // 音源が配置されていない構成では合成音へ切り替える（無音にしない）
    a.addEventListener('error', () => {
      this.useSynth = true;
      this._release(a);
      if(this.currentName === d.name) this.synth.start(d.name, this.muted);
    }, { once: true });
    return a;
  }

  _release(a){
    if(!a) return;
    this.fades = this.fades.filter(f => f.el !== a);
    try { a._gain?.disconnect(); } catch(e){}
    try { a.pause(); a.removeAttribute('src'); a.load(); } catch(e){}
    this.audioElements.delete(a);
  }

  // 前の曲を落としながら手放す。落としきった要素からすぐ解放する。
  _retire(d, ms){
    if(!d) return;
    for(const a of d.a){
      if(!a) continue;
      if(a.paused){ this._release(a); continue; }
      this._fade(a, 0, ms, 'power', () => this._release(a));
    }
  }

  play(name, loop = true, vol){
    if(!this.unlocked) return;
    if(this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    const file = FILE_MAP[name];
    if(!file) return;

    // 同じ曲が鳴っているなら鳴らし直さない（音量だけ合わせる）
    if(this.currentName === name && this.deck && this.current && !this.current.paused){
      if(typeof vol === 'number' && vol !== this.deck.vol){
        this.deck.vol = vol;
        this._fade(this.current, vol, 250);
      }
      return;
    }

    const old = this.deck;
    this.deck = null;
    this._retire(old, SWITCH_MS);     // 旧曲は落としながら、新曲を上げる

    if(this.useSynth){
      this.synth.start(name, this.muted);
      this.currentName = name;
      return;
    }

    const d = { name, file, loop, vol: typeof vol === 'number' ? vol : this.volume,
                a: [null, null], i: 0, crossing: false };
    d.a[0] = this._make(d);
    d.a[0].play?.()?.catch(() => {
      this.useSynth = true;
      this.synth.start(name, this.muted);
    });
    this._fade(d.a[0], d.vol, SWITCH_MS, 'power');
    this.deck = d;
    this.currentName = name;
    this._run();
  }

  stop(){
    this.synth.stop();
    const old = this.deck;
    this.deck = null;
    this.currentName = null;
    this._retire(old, SWITCH_MS);
  }

  // 会話や効果音の間だけ音量を下げる。曲は切らない。
  duck(ms = 1500){
    const el = this.current;
    if(!el || !this.deck) return;
    const base = this.deck.vol;
    this._fade(el, base * 0.3, 220);
    clearTimeout(this._duckTimer);
    this._duckTimer = setTimeout(() => {
      const back = this.current;
      if(back && this.deck) this._fade(back, this.deck.vol, 450);
    }, ms);
  }
}
