// ============================================================
//  사운드 - WebAudio 합성 (에셋 파일 없음)
//  효과음 + 절차적 BGM 루프. 엔진과 분리(이벤트로 호출).
// ============================================================
type Wave = OscillatorType;

const MUTE_KEY = 'randomdefense.muted.v1';

class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private muted: boolean;
  private lastAttack = 0;
  private lastKill = 0;
  private bgmStep = 0;
  private bgmTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.muted = localStorage.getItem(MUTE_KEY) === '1';
  }

  // 첫 사용자 입력에서 오디오 컨텍스트 해제 (브라우저 자동재생 정책)
  installUnlock(): void {
    const unlock = () => this.ensure();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  private ensure(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = 0.5;
      this.bgmGain.connect(this.master);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  isMuted(): boolean { return this.muted; }
  toggleMute(): boolean {
    this.muted = !this.muted;
    localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  // ---- 기본 톤 생성 ----
  private tone(freq: number, dur: number, type: Wave, vol: number, dest: AudioNode, when?: number, slideTo?: number): void {
    if (!this.ctx) return;
    const t = when ?? this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.02);
  }
  private sfx(freq: number, dur: number, type: Wave, vol: number, slideTo?: number): void {
    if (this.muted || !this.ctx || !this.master) return;
    this.tone(freq, dur, type, vol, this.master, undefined, slideTo);
  }

  // ---- 효과음 ----
  button(): void { this.sfx(520, 0.05, 'square', 0.12); }

  summon(mythic = false): void {
    if (mythic) { this.fanfare(); return; }
    this.sfx(400, 0.12, 'square', 0.18, 760);
  }
  private fanfare(): void {
    if (this.muted || !this.ctx || !this.master) return;
    const notes = [523, 659, 784, 1047];
    notes.forEach((n, i) => this.tone(n, 0.2, 'square', 0.2, this.master!, this.ctx!.currentTime + i * 0.1));
  }

  attack(): void {
    const now = performance.now();
    if (now - this.lastAttack < 70) return; // 겹침 방지 (최대 ~14/초)
    this.lastAttack = now;
    this.sfx(640 + Math.random() * 80, 0.04, 'square', 0.05);
  }

  kill(boss: boolean): void {
    if (boss) { this.sfx(200, 0.5, 'sawtooth', 0.28, 55); return; }
    const now = performance.now();
    if (now - this.lastKill < 45) return;
    this.lastKill = now;
    this.sfx(320, 0.09, 'triangle', 0.12, 130);
  }

  boss(): void { this.sfx(90, 0.6, 'sawtooth', 0.24, 60); } // 보스 등장 경고
  gameEnd(cleared: boolean): void {
    if (this.muted || !this.ctx || !this.master) return;
    if (cleared) {
      [523, 659, 784, 1047, 1319].forEach((n, i) => this.tone(n, 0.3, 'square', 0.22, this.master!, this.ctx!.currentTime + i * 0.13));
    } else {
      [440, 349, 262, 196].forEach((n, i) => this.tone(n, 0.35, 'sawtooth', 0.2, this.master!, this.ctx!.currentTime + i * 0.14));
    }
  }

  // ---- BGM (절차적 루프) ----
  startBgm(): void {
    this.ensure();
    if (this.bgmTimer != null) return;
    const melody = [440, 0, 523, 587, 523, 0, 440, 0, 392, 0, 440, 349, 392, 0, 330, 0]; // 0=쉼표
    const bass = [110, 110, 146, 98];
    this.bgmStep = 0;
    this.bgmTimer = setInterval(() => {
      if (!this.ctx || !this.bgmGain || this.muted) { this.bgmStep++; return; }
      const t = this.ctx.currentTime;
      const step = this.bgmStep % melody.length;
      const n = melody[step];
      if (n) this.tone(n, 0.18, 'square', 0.05, this.bgmGain, t);
      if (step % 4 === 0) this.tone(bass[Math.floor(this.bgmStep / 4) % bass.length], 0.32, 'triangle', 0.08, this.bgmGain, t);
      this.bgmStep++;
    }, 200);
  }
  stopBgm(): void {
    if (this.bgmTimer != null) { clearInterval(this.bgmTimer); this.bgmTimer = null; }
  }
}

export const audio = new AudioManager();
