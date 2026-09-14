// js/bgm.js
const FILE_MAP = {
  title:        'title_loop.m4a',
  airy:         'airy_loop.m4a',
  pulse:        'pulse_loop.m4a',
  sector:       'sector_loop.m4a',
  transmission: 'transmission_loop.m4a',
  urgent:       'urgent_loop.m4a',
  victory:      'victory.m4a'
};

export class BgmEngine {
  constructor(){
    this.current = null;
    this.currentName = null;
    this.volume = 0.25;
    this.unlocked = false;
    this.muted = false;
    this.audioElements = new Set();
  }

  setMuted(muted){
    this.muted = muted;
    for(const audio of this.audioElements) audio.muted = muted;
  }

  unlock(){
    if(navigator.audioSession){
      try { navigator.audioSession.type = 'playback'; } catch(e){}
    }
    this.unlocked = true;
  }

  _fadeOut(audio, ms){
    if(!audio) return;
    const start = audio.volume;
    const steps = 12;
    const dt = ms / steps;
    let i = 0;
    const timer = setInterval(() => {
      i++;
      audio.volume = Math.max(0, start * (1 - i/steps));
      if(i >= steps){
        clearInterval(timer);
        try { audio.pause(); audio.src = ''; } catch(e){}
        this.audioElements.delete(audio);
      }
    }, dt);
  }

  play(name, loop = true, vol){
    if(!this.unlocked) return;
    const file = FILE_MAP[name];
    if(!file) return;

    if(this.currentName === name && this.current && !this.current.paused){
      if(typeof vol === 'number') this.current.volume = vol;
      return;
    }

    if(this.current){
      this._fadeOut(this.current, 300);
      this.current = null;
    }

    const a = new Audio('audio/' + file);
    a.loop = loop;
    a.volume = typeof vol === 'number' ? vol : this.volume;
    a.muted = this.muted;
    a.preload = 'auto';
    this.audioElements.add(a);
    a.play().catch(e => console.warn('BGM play failed:', name, e.message));
    this.current = a;
    this.currentName = name;
  }

  stop(){
    if(this.current){
      this._fadeOut(this.current, 300);
      this.current = null;
      this.currentName = null;
    }
  }

  duck(ms = 1500){
    if(!this.current) return;
    const original = this.current.volume;
    this.current.volume = original * 0.3;
    setTimeout(() => {
      if(this.current) this.current.volume = original;
    }, ms);
  }
}