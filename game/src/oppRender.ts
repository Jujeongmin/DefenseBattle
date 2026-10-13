// ============================================================
//  PvP 상대 전장 렌더러 - 상대가 보내는 스냅샷(PVP.reportInterval 간격)으로 상대 필드를 그린다.
//  스냅샷에 실린 보낸 쪽 게임 시간으로, 조금 늦은 시점(DELAY)을 감싸는 두 스냅샷 사이를 보간한다
//  (도착 간격이 흔들려도 몹이 멈칫하거나 순간이동하지 않게). 내가 던진 몹은 결과가 오기 전에 미리 그린다.
// ============================================================
import { MAP, SNAP_KIND, DROP_WARN, pathAt, type BoardSnapshot } from './engine';
import { unitSprite, mobSprite } from './assets';
import { GRADES, JOBS, RACES, PLAY_SPEED, PVP, ATTACKS, UNIT_BY_ID } from './config';
import { fieldBackground, FRAME, WALK_SEQ, ATTACK_SEQ, JOB_TINT, UNIT_DRAW } from './render';
import type { Job, Race } from './types';

interface SnapMob { x: number; y: number; race: Race; kind: number; dir: number; size: number; variant: number }
interface SnapUnit { job: Job; grade: number; x: number; y: number; face: number; atk: boolean }
interface SnapFrame { at: number; t: number; mobs: Map<number, SnapMob>; units: SnapUnit[]; fx: number[][]; played: boolean }
/** 다시 그리는 공격 이펙트 (상대 화면 전용, 실제 시간 ms 기준) */
interface Fx { kind: number; a: number[]; start: number; dur: number }
/** 상대 화면은 이만큼(게임 초) 늦게 따라간다 - 다음 스냅샷이 조금 늦게 와도 그 사이를 이어 그릴 여유 */
const DELAY = 1.5 * PVP.reportInterval * PLAY_SPEED;

const UNIT_SIZE = UNIT_DRAW;
const deq = (v: number) => (v / 255) * MAP.size;

function parse(s: BoardSnapshot, at: number, t: number): SnapFrame {
  const mobs = new Map<number, SnapMob>();
  for (let i = 0; i + 4 < s.mobs.length; i += 5) {
    const code = s.mobs[i + 3];
    mobs.set(s.mobs[i], {
      x: deq(s.mobs[i + 1]),
      y: deq(s.mobs[i + 2]),
      race: RACES[code & 3] ?? 'orc',
      kind: (code >> 2) & 3,
      dir: (code >> 4) & 3,
      variant: (code >> 6) & 7,
      size: s.mobs[i + 4],
    });
  }
  const units: SnapUnit[] = [];
  for (let i = 0, k = 0; i + 3 < s.units.length; i += 4, k++) {
    const job = JOBS[s.units[i]];
    if (!job) continue;
    const code = s.uc?.[k] ?? 0; // 방향 | 공격 중 4 (예전 클라이언트는 없음 → 정면·대기)
    units.push({ job, grade: s.units[i + 1], x: deq(s.units[i + 2]), y: deq(s.units[i + 3]), face: code & 3, atk: (code & 4) !== 0 });
  }
  units.sort((a, b) => a.y - b.y);
  return { at, t, mobs, units, fx: Array.isArray(s.fx) ? s.fx : [], played: false };
}

export class OppRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  /** 받은 스냅샷 (보낸 쪽 게임 시간 순) */
  private frames: SnapFrame[] = [];
  /** 지금 그리는 상대 게임 시간 - 매 프레임 실제 시간만큼 흐르고, 도착한 스냅샷 쪽으로 천천히 맞춘다 */
  private clock: number | null = null;
  private lastDraw = 0;
  private aim: number | null = null;              // 드래그 중인 던질 위치
  private throws: { pos: number; at: number; card: number }[] = []; // 방금 던진 몹 (상대 쪽 결과가 오기 전까지 미리 보여 줌)
  private fx: Fx[] = [];

  setAim(pos: number | null): void { this.aim = pos; }
  markThrow(pos: number, card: number): void { this.throws.push({ pos, at: performance.now(), card }); }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  push(s: BoardSnapshot): void {
    if (s.v !== 2) return; // 구버전 클라이언트 상대: 스프라이트 정보가 없다
    const at = performance.now();
    // 보낸 쪽 게임 시간이 없으면(구버전) 도착 시각으로 대신한다
    const t = typeof s.t === 'number' ? s.t : (at / 1000) * PLAY_SPEED;
    const last = this.frames[this.frames.length - 1];
    if (last && t <= last.t) return; // 늦게 도착한 옛 스냅샷
    this.frames.push(parse(s, at, t));
    if (this.frames.length > 8) this.frames.shift();
  }

  /**
   * 그릴 시점(상대 게임 시간)을 정한다: 가장 최근 스냅샷 시간 + 도착 뒤 흐른 시간 - DELAY.
   * 도착 간격이 흔들려도 이 값은 매 프레임 실제 시간만큼만 부드럽게 흐르게 하고, 어긋남은 조금씩 따라잡는다.
   */
  private tick(now: number): number {
    const latest = this.frames[this.frames.length - 1];
    const target = latest.t + ((now - latest.at) / 1000) * PLAY_SPEED - DELAY;
    const dt = this.lastDraw ? Math.min(1, (now - this.lastDraw) / 1000) : 0;
    this.lastDraw = now;
    if (this.clock === null || Math.abs(target - this.clock) > 1 * PLAY_SPEED) this.clock = target; // 처음·크게 어긋남(0.5초 이상): 바로 맞춤
    else {
      this.clock += dt * PLAY_SPEED;
      this.clock += (target - this.clock) * Math.min(1, dt * 2);
    }
    return this.clock;
  }

  draw(): void {
    const c = this.canvas;
    // 화면 크기 × 기기 배율로 내부 해상도를 맞춰 선명하게
    const px = Math.round(c.clientWidth * (window.devicePixelRatio || 1));
    if (px > 0 && c.width !== px) { c.width = px; c.height = px; }
    const ctx = this.ctx;
    const k = c.width / MAP.size;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const bg = fieldBackground();
    if (bg) ctx.drawImage(bg, 0, 0);
    else { ctx.fillStyle = '#6c9a3a'; ctx.fillRect(0, 0, MAP.size, MAP.size); }

    const now = performance.now();
    this.drawThrowMarks(ctx, now);
    if (!this.frames.length) { this.drawEcho(ctx, now); return; }
    // 그릴 시점을 감싸는 두 스냅샷(f0 ≤ clock ≤ f1) 사이를 보간
    const clock = this.tick(now);
    let i = 0;
    while (i < this.frames.length - 1 && this.frames[i + 1].t <= clock) i++;
    const f0 = this.frames[i];
    const f1 = this.frames[Math.min(i + 1, this.frames.length - 1)];
    const span = f1.t - f0.t;
    const a = span > 0 ? Math.min(1, Math.max(0, (clock - f0.t) / span)) : 1;
    this.spawnFx(clock, now);
    if (i > 2) this.frames.splice(0, i - 1); // 지난 스냅샷 정리 (f0 앞 하나는 남김)
    const cur = f1; // 유닛·오라는 가까운 쪽(최신) 상태로
    const t = (now / 1000) * PLAY_SPEED;

    // 전설 이상 유닛 발밑 오라 (전력 비교용)
    for (const u of cur.units) {
      if (u.grade < 3) continue;
      ctx.fillStyle = GRADES[u.grade]?.color ?? '#fff';
      ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.ellipse(u.x, u.y + 22, 30, 11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // 몹: f0 에 있던 몹을 f1 위치 쪽으로. f1 에서 사라진 몹(처치)은 f1 시점까지만, 새로 나온 몹은 f1 에 도달하면 나타난다
    const mobs: [number, SnapMob, number, number][] = [];
    for (const [id, m0] of f0.mobs) {
      const m1 = f1.mobs.get(id);
      if (!m1) { if (a < 1) mobs.push([id, m0, m0.x, m0.y]); continue; }
      mobs.push([id, m1, m0.x + (m1.x - m0.x) * a, m0.y + (m1.y - m0.y) * a]);
    }
    if (a >= 1) for (const [id, m1] of f1.mobs) if (!f0.mobs.has(id)) mobs.push([id, m1, m1.x, m1.y]);
    for (const [id, m, x, y] of mobs) {
      const s = m.size;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(x, y + s * 0.38, s * 0.32, s * 0.12, 0, 0, Math.PI * 2); ctx.fill();
      const spr = mobSprite(m.race, m.variant);
      if (spr.ready) {
        const col = WALK_SEQ[Math.floor((t + id * 0.07) / 0.16) % WALK_SEQ.length];
        ctx.drawImage(spr.img, col * FRAME, m.dir * FRAME, FRAME, FRAME, x - s / 2, y - s / 2, s, s);
      } else {
        ctx.fillStyle = '#357';
        ctx.beginPath(); ctx.arc(x, y, s / 2, 0, Math.PI * 2); ctx.fill();
      }
      if (m.kind !== SNAP_KIND.normal) {
        // 보낸 몹/정예는 붉게, 보스는 금색 테두리
        ctx.strokeStyle = m.kind === SNAP_KIND.boss ? '#ffd54f' : '#ff5a3d';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(x, y, s * 0.42, 0, Math.PI * 2); ctx.stroke();
      }
    }

    for (const [n, u] of cur.units.entries()) {
      const spr = unitSprite(u.job, GRADES[u.grade]?.key ?? 'common');
      if (spr.ready) {
        // 몹 쪽을 보고, 이번 구간에 공격했으면 휘두르는 프레임을 돌린다 (내 화면 유닛과 같은 동작)
        const col = u.atk ? ATTACK_SEQ[Math.floor(now / 70 + n) % ATTACK_SEQ.length] : 1;
        ctx.drawImage(spr.img, col * FRAME, u.face * FRAME, FRAME, FRAME, u.x - UNIT_SIZE / 2, u.y - UNIT_SIZE / 2, UNIT_SIZE, UNIT_SIZE);
      } else {
        ctx.fillStyle = JOB_TINT[u.job];
        ctx.fillRect(u.x - 8, u.y - 8, 16, 16);
      }
    }
    this.drawFx(ctx, now);
    this.drawEcho(ctx, now);
  }

  /**
   * 그리는 시점이 어떤 스냅샷 구간(앞 스냅샷 시간 ~ 그 스냅샷 시간)에 들어오면 그 구간에 있었던 공격 이펙트를
   * 구간 길이만큼 흩어서 다시 재생한다 (몹 움직임과 같은 시점에 맞춰 보인다).
   */
  private spawnFx(clock: number, now: number): void {
    for (let j = 0; j < this.frames.length; j++) {
      const fr = this.frames[j];
      if (fr.played) continue;
      const prev = this.frames[j - 1];
      if (!prev) { fr.played = true; continue; } // 앞 구간을 모르는 첫 스냅샷
      if (clock < prev.t) break;
      fr.played = true;
      const windowMs = Math.max(50, ((fr.t - prev.t) / PLAY_SPEED) * 1000);
      for (const a of fr.fx) {
        const kind = a[0];
        const dur = kind === 0 ? 150 : kind === 1 ? 260 : 300;
        this.fx.push({ kind, a, start: now + Math.random() * windowMs, dur });
      }
    }
    if (this.fx.length > 160) this.fx.splice(0, this.fx.length - 160);
  }

  /** 투사체(직업별 모양)·폭발 고리·처치 파편 - render.ts 와 같은 모양을 작게 */
  private drawFx(ctx: CanvasRenderingContext2D, now: number): void {
    this.fx = this.fx.filter((f) => now < f.start + f.dur);
    for (const f of this.fx) {
      const p = (now - f.start) / f.dur;
      if (p < 0) continue;
      const a = f.a;
      if (f.kind === 0) {
        const x1 = deq(a[1]), y1 = deq(a[2]) - 8, x2 = deq(a[3]), y2 = deq(a[4]);
        const x = x1 + (x2 - x1) * p, y = y1 + (y2 - y1) * p;
        const job = JOBS[a[5]];
        const base = job ? UNIT_BY_ID[job].base : 'archer';
        const color = a[6] === 0 && job ? JOB_TINT[job] : GRADES[a[6]]?.color ?? '#fff';
        ctx.save();
        if (base === 'wizard') {
          const r = 6 + a[6] * 0.8;
          const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
          g.addColorStop(0, 'rgba(255,255,255,0.95)');
          g.addColorStop(0.35, color);
          g.addColorStop(1, 'rgba(142,91,216,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.translate(x, y);
          ctx.rotate(Math.atan2(y2 - y1, x2 - x1));
          ctx.strokeStyle = base === 'archer' ? '#f5e6c8' : color;
          ctx.lineWidth = base === 'archer' ? 4 : 6;
          ctx.lineCap = 'round';
          ctx.beginPath();
          if (base === 'archer') { ctx.moveTo(-14, 0); ctx.lineTo(10, 0); } else ctx.arc(-6, 0, 14, -1.1, 1.1);
          ctx.stroke();
        }
        ctx.restore();
      } else if (f.kind === 1) {
        const x = deq(a[1]), y = deq(a[2]), r = a[3];
        const c = a[4] ?? 0xffffff;
        const rgb = `${(c >> 16) & 255},${(c >> 8) & 255},${c & 255}`;
        ctx.fillStyle = `rgba(${rgb},${0.4 * (1 - p)})`;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(${rgb},${1 - p})`;
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(x, y, r * (0.4 + p * 0.6), 0, Math.PI * 2); ctx.stroke();
      } else {
        const x = deq(a[1]), y = deq(a[2]), boss = a[3] === 1;
        ctx.strokeStyle = `rgba(255,240,150,${1 - p})`;
        ctx.lineWidth = boss ? 8 : 5;
        ctx.beginPath(); ctx.arc(x, y, p * (boss ? 90 : 36) + 6, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }

  /**
   * 내가 던진 몹을 상대 결과가 오기 전에 미리 보여 준다: 카드에서 날아간 몹(0.38초)이 착지 지점으로 떨어지고,
   * 상대 화면에서 실제로 내려앉아 스냅샷으로 돌아올 때(약 1.5초)까지 그 자리에 있다가 사라진다.
   */
  private drawEcho(ctx: CanvasRenderingContext2D, now: number): void {
    const FLY = 380, FALL = (DROP_WARN / PLAY_SPEED) * 1000, HOLD = 450, FADE = 300;
    for (const t of this.throws) {
      const el = now - t.at - FLY;
      if (el < 0 || el > FALL + HOLD + FADE) continue;
      const a = ATTACKS[t.card];
      if (!a) continue;
      const spr = mobSprite(a.race, a.variant);
      if (!spr.ready) continue;
      const p = pathAt(t.pos);
      const s = 44 * a.size;
      const k = Math.min(1, el / FALL);
      const drop = (1 - k * k) * 220; // 위에서 떨어진다
      ctx.globalAlpha = el > FALL + HOLD ? 1 - (el - FALL - HOLD) / FADE : 1;
      const n = Math.min(3, a.count);
      for (let i = 0; i < n; i++) {
        const ox = (i - (n - 1) / 2) * s * 0.45, oy = (i % 2) * s * 0.2;
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.ellipse(p.x + ox, p.y + oy + s * 0.38, s * 0.32 * (0.4 + 0.6 * k), s * 0.12, 0, 0, Math.PI * 2); ctx.fill();
        ctx.drawImage(spr.img, FRAME, 0, FRAME, FRAME, p.x + ox - s / 2, p.y + oy - s / 2 - drop, s, s);
      }
      ctx.globalAlpha = 1;
    }
  }

  // 조준 중인 길 위치(진행 방향 화살표 포함)와 방금 던진 자리
  private drawThrowMarks(ctx: CanvasRenderingContext2D, now: number): void {
    this.throws = this.throws.filter((t) => now - t.at < 380 + (DROP_WARN / PLAY_SPEED) * 1000 + 800);
    for (const t of this.throws) {
      if (now - t.at > 900) continue;
      const p = pathAt(t.pos);
      const k = (now - t.at) / 900;
      ctx.strokeStyle = `rgba(255, 90, 61, ${1 - k})`;
      ctx.lineWidth = 10;
      ctx.beginPath(); ctx.arc(p.x, p.y, 30 + k * 60, 0, Math.PI * 2); ctx.stroke();
    }
    if (this.aim === null) return;
    const p = pathAt(this.aim);
    const n = pathAt(this.aim + 0.03); // 몹이 갈 방향
    const pulse = 1 + Math.sin(now / 90) * 0.12;
    ctx.fillStyle = 'rgba(255, 90, 61, 0.35)';
    ctx.strokeStyle = '#ff5a3d';
    ctx.lineWidth = 8;
    ctx.beginPath(); ctx.arc(p.x, p.y, 46 * pulse, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const ang = Math.atan2(n.y - p.y, n.x - p.x);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);
    ctx.fillStyle = '#fff2a8';
    ctx.beginPath(); ctx.moveTo(78, 0); ctx.lineTo(50, -20); ctx.lineTo(50, 20); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
