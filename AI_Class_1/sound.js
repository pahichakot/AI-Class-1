/**
 * sound.js - Web Audio API Synthesizer
 * Generates custom sci-fi sound effects procedurally without loading heavy external MP3s.
 */

class SoundEffects {
  constructor() {
    this.ctx = null;
    // Check local storage for persistent mute setting, default to unmuted (false)
    this.muted = localStorage.getItem('aura_muted') === 'true';
  }

  /**
   * Lazily initialize Web Audio context (browsers block audio until a user gesture occurs)
   */
  init() {
    if (this.ctx) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    } catch (e) {
      console.warn("Web Audio API is not supported in this browser:", e);
    }
  }

  /**
   * Toggles mute state and saves setting to localStorage
   * @returns {boolean} New muted state
   */
  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('aura_muted', this.muted);
    
    // Play a tiny confirmation sound if unmuting
    if (!this.muted) {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      setTimeout(() => this.playSwitch(), 50);
    }
    return this.muted;
  }

  /**
   * Plays a quick slide-up transition sweep sound
   */
  playSwitch() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    // Resume context if suspended (browser behavior)
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.15);
    
    gain.gain.setValueAtTime(0.0, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.15);
  }

  /**
   * Plays a synthesized mechanical camera shutter click
   */
  playShutter() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const now = this.ctx.currentTime;
    
    // 1. Shutter High-Freq White Noise Burst
    const bufferSize = this.ctx.sampleRate * 0.08; // 80ms duration
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 1800;
    noiseFilter.Q.value = 3.0;
    
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.2, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.005, now + 0.08);
    
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    
    noise.start(now);
    noise.stop(now + 0.08);
    
    // 2. High-pitch metallic beep tone overlay
    const beep = this.ctx.createOscillator();
    const beepGain = this.ctx.createGain();
    
    beep.type = 'sine';
    beep.frequency.setValueAtTime(1400, now);
    beep.frequency.exponentialRampToValueAtTime(600, now + 0.05);
    
    beepGain.gain.setValueAtTime(0.08, now);
    beepGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    
    beep.connect(beepGain);
    beepGain.connect(this.ctx.destination);
    
    beep.start(now);
    beep.stop(now + 0.05);
  }

  /**
   * Plays an upward arpeggio chime when tracking starts
   */
  playChime() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const now = this.ctx.currentTime;
    
    const playNote = (freq, delay, duration) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + delay);
      
      gain.gain.setValueAtTime(0.0, now + delay);
      gain.gain.linearRampToValueAtTime(0.08, now + delay + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + duration);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.start(now + delay);
      osc.stop(now + delay + duration);
    };
    
    // Ascending major chord (C5 -> E5 -> G5 -> C6)
    playNote(523.25, 0.0, 0.35);    // C5
    playNote(659.25, 0.08, 0.35);   // E5
    playNote(783.99, 0.16, 0.35);   // G5
    playNote(1046.50, 0.24, 0.45);  // C6
  }
}

// Instantiate globally for direct access in other modules
window.sfx = new SoundEffects();
