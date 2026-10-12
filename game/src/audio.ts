// ============================================================
//  사운드 - Mixkit 효과음(public/sfx) + BGM(public/bgm)
//  효과음은 WebAudio 버퍼로 미리 디코딩해 겹쳐 재생하고, BGM 은 <audio> 로 스트리밍 반복 재생한다.
//  엔진과 분리(이벤트로 호출). 원본은 Asset/mixkit.
//  파일 음량은 tools/normalize_audio.py 가 맞춰 둔다 (효과음끼리 같은 체감 음량, BGM 은 곡끼리 같게).
//  그래서 여기서는 효과음마다 볼륨을 따로 주지 않는다 - 튀는 소리가 생기지 않게.
// ============================================================
const MUTE_KEY = 'randomdefense.muted.v1';     // 전투 화면 스피커 버튼 (전체)
const BGM_KEY = 'randomdefense.bgm.v1';        // (예전) 설정: 배경음악 켜기/끄기 - 음량 저장이 없을 때만 읽는다
const SFX_KEY = 'randomdefense.sfx.v1';        // (예전) 설정: 효과음 켜기/끄기
const BGM_VOL_KEY = 'randomdefense.bgmVol.v1'; // 설정: 배경음악 음량 0~1
const SFX_VOL_KEY = 'randomdefense.sfxVol.v1'; // 설정: 효과음 음량 0~1

type Sfx =
  | 'button' | 'coin' | 'summon' | 'mythic' | 'unlock' | 'merge' | 'arrow' | 'magic' | 'sword'
  | 'hit' | 'boss_kill' | 'boss' | 'send' | 'incoming' | 'win' | 'lose';

const SFX: Sfx[] = [
  'button', 'coin', 'summon', 'mythic', 'unlock', 'merge', 'arrow', 'magic', 'sword',
  'hit', 'boss_kill', 'boss', 'send', 'incoming', 'win', 'lose',
];
const SFX_VOL = 0.8;  // 모든 효과음 공통 (겹칠 때 여유)
type BgmTrack = 'menu' | 'battle' | 'boss' | 'pvp';
const BGM_VOL = 0.45; // 효과음보다 약 7dB 아래

/** 설정 저장 (사생활 모드·저장 차단·노드 시뮬레이터에서도 멈추지 않게) */
const store = {
  get(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string): void { try { localStorage.setItem(k, v); } catch { /* 저장 못 해도 계속 */ } },
};

class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<Sfx, AudioBuffer>();
  private loading = false;
  private muted: boolean;
  private lastPlayed = new Map<Sfx, number>();
  private bgm: HTMLAudioElement | null = null;
  private track: BgmTrack | null = null;

  private bgmOff: boolean;
  private sfxOff: boolean;
  private bgmVol: number;
  private sfxVol: number;

  constructor() {
    this.muted = store.get(MUTE_KEY) === '1';
    const vol = (key: string, oldKey: string) => {
      const v = Number(store.get(key));
      if (store.get(key) !== null && Number.isFinite(v)) return Math.min(1, Math.max(0, v));
      return store.get(oldKey) === '0' ? 0 : 1; // 예전 켜기/끄기 설정을 이어받는다
    };
    this.bgmVol = vol(BGM_VOL_KEY, BGM_KEY);
    this.sfxVol = vol(SFX_VOL_KEY, SFX_KEY);
    this.bgmOff = this.bgmVol <= 0;
    this.sfxOff = this.sfxVol <= 0;
  }

  /** 음량 0~1 (0 이면 꺼짐) */
  getBgmVolume(): number { return this.bgmVol; }
  getSfxVolume(): number { return this.sfxVol; }
  setBgmVolume(v: number): void {
    this.bgmVol = Math.min(1, Math.max(0, v));
    this.bgmOff = this.bgmVol <= 0;
    store.set(BGM_VOL_KEY, String(this.bgmVol));
    if (!this.bgm) return;
    this.bgm.volume = BGM_VOL * this.bgmVol;
    if (!this.bgmOff && !this.muted) { if (this.bgm.paused) void this.bgm.play().catch(() => {}); }
    else this.bgm.pause();
  }
  setSfxVolume(v: number): void {
    this.sfxVol = Math.min(1, Math.max(0, v));
    this.sfxOff = this.sfxVol <= 0;
    store.set(SFX_VOL_KEY, String(this.sfxVol));
  }
  isBgmOn(): boolean { return !this.bgmOff; }
  isSfxOn(): boolean { return !this.sfxOff; }
  setBgm(on: boolean): void { this.setBgmVolume(on ? (this.bgmVol || 1) : 0); }
  setSfx(on: boolean): void {
    this.setSfxVolume(on ? (this.sfxVol || 1) : 0);
  }

  // 사용자 입력에서 오디오 해제 (브라우저 자동재생 정책). 그 전에 요청된 BGM 도 이때 재생.
  // 휴대폰 터치는 손을 뗄 때(pointerup/touchend)만 허용되므로 여러 이벤트에서 시도하고,
  // 한 번으로 끝내지 않는다 - 앱을 내렸다 올리면(iOS) 오디오가 다시 멈추기 때문
  installUnlock(): void {
    const unlock = () => {
      this.ensure();
      if (this.bgm && this.bgm.paused && !this.muted && !this.bgmOff) void this.bgm.play().catch(() => {});
    };
    for (const ev of ['pointerdown', 'pointerup', 'touchend', 'keydown']) window.addEventListener(ev, unlock, { capture: true, passive: true });
    // 다른 앱·탭으로 가면 소리를 멈추고, 돌아오면 다시 (휴대폰에서 배경음악이 계속 나오지 않게)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.bgm?.pause();
        if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => {});
      } else unlock();
    });
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
    if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => {}); // suspended / iOS interrupted
  }

  private load(): void {
    if (this.loading || !this.ctx) return;
    this.loading = true;
    const ctx = this.ctx;
    for (const name of SFX) {
      fetch(`sfx/${name}.mp3`)
        .then((r) => r.arrayBuffer())
        .then((b) => ctx.decodeAudioData(b))
        .then((buf) => { this.buffers.set(name, buf); })
        .catch(() => { /* 없는 효과음은 무음 */ });
    }
  }

  /** minGap: 같은 소리가 너무 촘촘히 겹치지 않게 하는 최소 간격(ms) */
  private play(name: Sfx, opts: { rate?: number; minGap?: number } = {}): void {
    if (this.muted || this.sfxOff || !this.ctx || !this.master) return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    const now = performance.now();
    if (opts.minGap && now - (this.lastPlayed.get(name) ?? 0) < opts.minGap) return;
    this.lastPlayed.set(name, now);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    const g = this.ctx.createGain();
    g.gain.value = SFX_VOL * this.sfxVol;
    src.connect(g);
    g.connect(this.master);
    src.start();
  }

  isMuted(): boolean { return this.muted; }
  toggleMute(): boolean {
    this.muted = !this.muted;
    store.set(MUTE_KEY, this.muted ? '1' : '0');
    if (this.master) this.master.gain.value = this.muted ? 0 : 1;
    if (this.bgm) {
      if (this.muted || this.bgmOff) this.bgm.pause();
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
    a.volume = BGM_VOL * this.bgmVol;
    this.bgm = a;
    if (!this.muted && !this.bgmOff) void a.play().catch(() => { /* 첫 입력 전이면 installUnlock 에서 재생 */ });
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
