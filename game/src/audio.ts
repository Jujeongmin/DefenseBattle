// ============================================================
//  사운드 - Mixkit 효과음(public/sfx) + BGM(public/bgm)
//  효과음은 WebAudio 버퍼로 미리 디코딩해 겹쳐 재생하고, BGM 은 <audio> 로 스트리밍 반복 재생한다.
//  엔진과 분리(이벤트로 호출). 원본은 Asset/mixkit (가공: 앞 무음 제거, BGM 모노 64kbps).
// ============================================================
const MUTE_KEY = 'randomdefense.muted.v1';

type Sfx =
  | 'button' | 'coin' | 'summon' | 'mythic' | 'unlock' | 'merge' | 'arrow' | 'magic' | 'sword'
  | 'hit' | 'boss_kill' | 'boss' | 'send' | 'incoming' | 'win' | 'lose';

// 파일별 기본 볼륨 (원본 음량 차이 보정)
const SFX_VOL: Record<Sfx, number> = {
  button: 0.5, coin: 0.45, summon: 0.5, mythic: 0.7, unlock: 0.6, merge: 0.6,
  arrow: 0.22, magic: 0.18, sword: 0.25, hit: 0.25, boss_kill: 0.7, boss: 0.75,
  send: 0.55, incoming: 0.5, win: 0.7, lose: 0.7,
};

type BgmTrack = 'menu' | 'battle' | 'boss' | 'pvp';
const BGM_VOL = 0.35;

class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<Sfx, AudioBuffer>();
  private loading = false;
  private muted: boolean;
  private lastPlayed = new Map<Sfx, number>();
  private bgm: HTMLAudioElement | null = null;
  private track: BgmTrack | null = null;

  constructor() {
    this.muted = localStorage.getItem(MUTE_KEY) === '1';
  }

  // 첫 사용자 입력에서 오디오 해제 (브라우저 자동재생 정책). 그 전에 요청된 BGM 도 이때 재생.
  installUnlock(): void {
    const unlock = () => {
      this.ensure();
      if (this.bgm && this.bgm.paused && !this.muted) void this.bgm.play().catch(() => {});
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  private ensure(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
      this.load();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private load(): void {
    if (this.loading || !this.ctx) return;
    this.loading = true;
    const ctx = this.ctx;
    for (const name of Object.keys(SFX_VOL) as Sfx[]) {
      fetch(`sfx/${name}.mp3`)
        .then((r) => r.arrayBuffer())
        .then((b) => ctx.decodeAudioData(b))
        .then((buf) => { this.buffers.set(name, buf); })
        .catch(() => { /* 없는 효과음은 무음 */ });
    }
  }

  /** minGap: 같은 소리가 너무 촘촘히 겹치지 않게 하는 최소 간격(ms) */
  private play(name: Sfx, opts: { vol?: number; rate?: number; minGap?: number } = {}): void {
    if (this.muted || !this.ctx || !this.master) return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    const now = performance.now();
    if (opts.minGap && now - (this.lastPlayed.get(name) ?? 0) < opts.minGap) return;
    this.lastPlayed.set(name, now);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    const g = this.ctx.createGain();
    g.gain.value = SFX_VOL[name] * (opts.vol ?? 1);
    src.connect(g);
    g.connect(this.master);
    src.start();
  }

  isMuted(): boolean { return this.muted; }
  toggleMute(): boolean {
    this.muted = !this.muted;
    localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    if (this.master) this.master.gain.value = this.muted ? 0 : 1;
    if (this.bgm) {
      if (this.muted) this.bgm.pause();
      else void this.bgm.play().catch(() => {});
    }
    return this.muted;
  }

  // ---- 효과음 ----
  button(): void { this.play('button', { minGap: 40 }); }
  coin(): void { this.play('coin', { minGap: 60 }); }
  summon(mythic = false): void { this.play(mythic ? 'mythic' : 'summon', { minGap: 50 }); }
  fanfareUnlock(): void { this.play('unlock'); }
  merge(): void { this.play('merge'); }

  // 직업별 공격음 - 초당 수십 번 불리므로 간격 제한 + 음높이를 살짝 흔들어 단조로움 방지
  attack(job?: 'archer' | 'wizard' | 'warrior'): void {
    const rate = 0.92 + Math.random() * 0.16;
    if (job === 'wizard') this.play('magic', { rate, minGap: 140 });
    else if (job === 'warrior') this.play('sword', { rate, minGap: 110 });
    else this.play('arrow', { rate, minGap: 90 });
  }

  kill(boss: boolean): void {
    if (boss) { this.play('boss_kill'); return; }
    this.play('hit', { rate: 0.9 + Math.random() * 0.2, minGap: 60 });
  }

  sendAttack(): void { this.play('send', { minGap: 100 }); }
  incoming(): void { this.play('incoming', { minGap: 300 }); }
  boss(): void { this.play('boss'); } // 보스 등장 경고

  gameEnd(cleared: boolean): void {
    this.stopBgm();
    this.play(cleared ? 'win' : 'lose');
  }

  // ---- BGM ----
  startBgm(track: BgmTrack = 'battle'): void {
    this.ensure();
    if (this.track === track && this.bgm && !this.bgm.paused) return;
    this.stopBgm();
    this.track = track;
    const a = new Audio(`bgm/${track}.mp3`);
    a.loop = true;
    a.volume = BGM_VOL;
    this.bgm = a;
    if (!this.muted) void a.play().catch(() => { /* 첫 입력 전이면 installUnlock 에서 재생 */ });
  }
  stopBgm(): void {
    if (this.bgm) { this.bgm.pause(); this.bgm.src = ''; }
    this.bgm = null;
    this.track = null;
  }
  switchBgm(track: BgmTrack): void {
    if (this.track === track && this.bgm) return;
    this.startBgm(track);
  }
}

export const audio = new AudioManager();
