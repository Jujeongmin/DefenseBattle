// ============================================================
//  PvP 상대 전장 렌더러 - 상대가 보내는 스냅샷(0.5초 간격)으로 상대 필드를 그린다.
//  몹은 id 로 이전 스냅샷과 짝지어 그 사이를 보간한다 (한 주기 늦게 보여 주는 대신 부드럽게).
// ============================================================
import { MAP, SNAP_KIND, pathAt, type BoardSnapshot } from './engine';
import { unitSprite, mobSprite } from './assets';
import { GRADES, JOBS, RACES, PLAY_SPEED } from './config';
import { fieldBackground, FRAME, WALK_SEQ, JOB_TINT, UNIT_DRAW } from './render';
import type { Job, Race } from './types';

interface SnapMob { x: number; y: number; race: Race; kind: number; dir: number; size: number }
interface SnapUnit { job: Job; grade: number; x: number; y: number }
interface SnapFrame { at: number; mobs: Map<number, SnapMob>; units: SnapUnit[] }

const UNIT_SIZE = UNIT_DRAW;
const deq = (v: number) => (v / 255) * MAP.size;

function parse(s: BoardSnapshot, at: number): SnapFrame {
  const mobs = new Map<number, SnapMob>();
  for (let i = 0; i + 4 < s.mobs.length; i += 5) {
    const code = s.mobs[i + 3];
    mobs.set(s.mobs[i], {
      x: deq(s.mobs[i + 1]),
      y: deq(s.mobs[i + 2]),
      race: RACES[code & 3] ?? 'orc',
      kind: (code >> 2) & 3,
      dir: (code >> 4) & 3,
      size: s.mobs[i + 4],
    });
  }
  const units: SnapUnit[] = [];
  for (let i = 0; i + 3 < s.units.length; i += 4) {
    const job = JOBS[s.units[i]];
    if (!job) continue;
    units.push({ job, grade: s.units[i + 1], x: deq(s.units[i + 2]), y: deq(s.units[i + 3]) });
  }
  units.sort((a, b) => a.y - b.y);
  return { at, mobs, units };
}

export class OppRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private prev: SnapFrame | null = null;
  private cur: SnapFrame | null = null;
  private aim: number | null = null;              // 드래그 중인 던질 위치
  private throws: { pos: number; at: number }[] = []; // 방금 던진 자리 (잠깐 표시)

  setAim(pos: number | null): void { this.aim = pos; }
  markThrow(pos: number): void { this.throws.push({ pos, at: performance.now() }); }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  push(s: BoardSnapshot): void {
    if (s.v !== 2) return; // 구버전 클라이언트 상대: 스프라이트 정보가 없다
    this.prev = this.cur;
    this.cur = parse(s, performance.now());
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
    const cur = this.cur;
    if (!cur) return;
    const prev = this.prev;
    const span = prev ? Math.max(1, cur.at - prev.at) : 1;
    const a = prev ? Math.min(1, Math.max(0, (now - cur.at) / span)) : 1;
    const t = (now / 1000) * PLAY_SPEED;

    // 전설 이상 유닛 발밑 오라 (전력 비교용)
    for (const u of cur.units) {
      if (u.grade < 3) continue;
      ctx.fillStyle = GRADES[u.grade]?.color ?? '#fff';
      ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.ellipse(u.x, u.y + 22, 30, 11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    for (const [id, m] of cur.mobs) {
      const p = prev?.mobs.get(id);
      const x = p ? p.x + (m.x - p.x) * a : m.x;
      const y = p ? p.y + (m.y - p.y) * a : m.y;
      const s = m.size;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(x, y + s * 0.38, s * 0.32, s * 0.12, 0, 0, Math.PI * 2); ctx.fill();
      const spr = mobSprite(m.race);
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

    for (const u of cur.units) {
      const spr = unitSprite(u.job, GRADES[u.grade]?.key ?? 'common');
      if (spr.ready) {
        ctx.drawImage(spr.img, FRAME, 0, FRAME, FRAME, u.x - UNIT_SIZE / 2, u.y - UNIT_SIZE / 2, UNIT_SIZE, UNIT_SIZE);
      } else {
        ctx.fillStyle = JOB_TINT[u.job];
        ctx.fillRect(u.x - 8, u.y - 8, 16, 16);
      }
    }
  }

  // 조준 중인 길 위치(진행 방향 화살표 포함)와 방금 던진 자리
  private drawThrowMarks(ctx: CanvasRenderingContext2D, now: number): void {
    this.throws = this.throws.filter((t) => now - t.at < 900);
    for (const t of this.throws) {
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
