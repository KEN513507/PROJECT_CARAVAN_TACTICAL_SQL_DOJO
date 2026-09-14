// js/sound.js
export class SoundEngine {
  constructor(){ this.ctx = null; }

  init(){
    if(!this.ctx){
      const AC = window.AudioContext || window.webkitAudioContext;
      if(AC) this.ctx = new AC();
    }
    if(this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  _blip(type, f0, f1, at, dur, vol){
    if(!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.connect(g); g.connect(this.ctx.destination);
    o.type = type;
    o.frequency.setValueAtTime(f0, at);
    if(f1 !== f0) o.frequency.linearRampToValueAtTime(f1, at + dur);
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0008, at + dur);
    o.start(at); o.stop(at + dur + 0.02);
  }

  tap(){ this.init(); if(!this.ctx) return;
    this._blip('sine', 600, 600, this.ctx.currentTime, 0.05, 0.045);
  }

  success(){ this.init(); if(!this.ctx) return;
    const t = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      this._blip('triangle', f, f, t + i * 0.07, 0.22, 0.085));
  }

  error(){ this.init(); if(!this.ctx) return;
    const t = this.ctx.currentTime;
    this._blip('sawtooth', 140, 90, t, 0.24, 0.10);
  }

  fanfare(){ this.init(); if(!this.ctx) return;
    const t = this.ctx.currentTime;
    const seq = [
      [523.25,0.00,0.18,0.09],[659.25,0.12,0.18,0.09],
      [783.99,0.24,0.18,0.09],[1046.5,0.36,0.42,0.10],
      [783.99,0.54,0.16,0.08],[1046.5,0.68,0.80,0.11]
    ];
    seq.forEach(n => this._blip('triangle', n[0], n[0], t + n[1], n[2], n[3]));
  }
}