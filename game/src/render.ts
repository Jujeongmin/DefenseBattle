// ============================================================
//  캔버스 렌더러
// ============================================================
import { MAP, Game, pathAt, GAP_SAMPLES } from './engine';
import { unitSprite, mobSprite, tileSprite, uiSprite } from './assets';
import { GRADES, UNIT_BY_ID, PLAY_SPEED, ATTACKS, UNITS } from './config';
import type { Job, Mob, Effect } from './types';

export const JOB_TINT: Record<Job, string> = Object.fromEntries(UNITS.map((u) => [u.id, u.tint])) as Record<Job, string>;

// 스프라이트 시트: 32x32 프레임, 3열(걷기) x 4행(하/좌/우/상)
export const FRAME = 32;
/** 유닛 그리기 크기 (논리 720 기준) */
export const UNIT_DRAW = 62;
export const WALK_SEQ = [1, 0, 1, 2]; // 걷기 컬럼 순서 (1=정지 기준)
export const ATTACK_SEQ = [1, 2, 0, 1]; // 공격 스윙 프레임 순서 (1=정지 기준) - oppRender 도 쓴다
const ATTACK_ANIM_DUR = 0.1;     // engine.ts 의 u.flash 초기값과 동일해야 함

// ---- Tiny Swords 지형 타일 ----
// tiles/terrain.png = Tilemap_Flat 원본(640x256, 64px 셀). 잔디 4x4 오토타일 = 열 0~3.
// tiles/dirtpath.png = 모래 4x4 오토타일을 흙색으로 톤 변환한 시트.
//   각 4x4 안의 배치: 열/행 0~2 가 3x3(모서리·변·중앙), 열 3 은 세로 1칸 폭 변형,
//   행 3 은 가로 1칸 높이 변형, (3,3) 은 단독 타일.
// tiles/deco.png = 덤불/돌 장식 가로 시트(64px 셀 6개).
const TILE = 45;       // 720 / 16
const SRC = 64;        // 원본 타일 한 칸 크기
const PATH_INSET = 70; // 경로 중심선 여백 (PATH.corners 와 동일)
const BAND_HALF = 30;  // 흙길 밴드 반폭
const DECO_COUNT = 6;
const FONT = 'Galmuri11, sans-serif';

// 3x3 오토타일에서 이웃 유무(위/아래/좌/우)에 따라 쓸 셀의 (col,row) 를 고른다.
function autoTile(up: boolean, down: boolean, left: boolean, right: boolean): { cx: number; cy: number } {
  const cx = left && right ? 1 : left ? 2 : right ? 0 : 3;
  const cy = up && down ? 1 : up ? 2 : down ? 0 : 3;
  return { cx, cy };
}

// 좌표 기반 결정론적 해시(0~1) - 장식 배치가 매번 같도록
function hash2(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) ^ (a << 13);
  h = Math.imul(h ^ (h >>> 15), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}

// 잔디 필드 + 흙길 링(오토타일) + 바깥 테두리 장식
function drawTiles(ctx: CanvasRenderingContext2D): void {
  const terrain = tileSprite('terrain');
  const dirt = tileSprite('dirtpath');
  const deco = tileSprite('deco');
  const n = Math.ceil(MAP.size / TILE);
  const o1 = PATH_INSET - BAND_HALF;         // 흙길 바깥 경계
  const i1 = PATH_INSET + BAND_HALF;         // 흙길 안쪽 경계
  const oFar = MAP.size - o1, iFar = MAP.size - i1;
  const isPath = (gx: number, gy: number) => {
    const cx = gx * TILE + TILE / 2, cy = gy * TILE + TILE / 2;
    const inOuter = cx >= o1 && cx <= oFar && cy >= o1 && cy <= oFar;
    const inInner = cx > i1 && cx < iFar && cy > i1 && cy < iFar;
    return inOuter && !inInner;
  };
  for (let gy = 0; gy < n; gy++) {
    for (let gx = 0; gx < n; gx++) {
      if (terrain.ready) ctx.drawImage(terrain.img, SRC, SRC, SRC, SRC, gx * TILE, gy * TILE, TILE, TILE);
      else { ctx.fillStyle = '#8bb04a'; ctx.fillRect(gx * TILE, gy * TILE, TILE, TILE); }
    }
  }
  for (let gy = 0; gy < n; gy++) {
    for (let gx = 0; gx < n; gx++) {
      if (!isPath(gx, gy)) continue;
      if (!dirt.ready) { ctx.fillStyle = '#a9843f'; ctx.fillRect(gx * TILE, gy * TILE, TILE, TILE); continue; }
      const { cx, cy } = autoTile(isPath(gx, gy - 1), isPath(gx, gy + 1), isPath(gx - 1, gy), isPath(gx + 1, gy));
      ctx.drawImage(dirt.img, cx * SRC, cy * SRC, SRC, SRC, gx * TILE, gy * TILE, TILE, TILE);
    }
  }
  // 길 바깥 잔디에만 덤불/돌 (길 안쪽은 유닛 배치 구역이라 비워둔다)
  if (!deco.ready) return;
  for (let gy = 0; gy < n; gy++) {
    for (let gx = 0; gx < n; gx++) {
      if (isPath(gx, gy)) continue;
      const cx = gx * TILE + TILE / 2, cy = gy * TILE + TILE / 2;
      if (cx > o1 && cx < oFar && cy > o1 && cy < oFar) continue;
      if (hash2(gx, gy) > 0.4) continue;
      const idx = Math.floor(hash2(gx + 91, gy + 17) * DECO_COUNT);
      ctx.drawImage(deco.img, idx * SRC, 0, SRC, SRC, gx * TILE, gy * TILE, TILE, TILE);
    }
  }
}

// 필드 비네트
function decorate(cx: CanvasRenderingContext2D): void {
  const S = MAP.size;
  cx.save();
  const g = cx.createRadialGradient(S / 2, S / 2, S * 0.25, S / 2, S / 2, S * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.28)');
  cx.fillStyle = g;
  cx.fillRect(0, 0, S, S);
  cx.restore();
}

// 타일 배경은 오프스크린에 한 번만 그려 재사용 (매 프레임 2백여 장 drawImage 방지).
// 내 전장과 PvP 상대 전장이 함께 쓴다. 타일 로드 전이면 null.
let bgCache: HTMLCanvasElement | null = null;
export function fieldBackground(): HTMLCanvasElement | null {
  if (bgCache) return bgCache;
  if (!['terrain', 'dirtpath', 'deco'].every((n) => tileSprite(n).ready)) return null;
  const c = document.createElement('canvas');
  c.width = MAP.size; c.height = MAP.size;
  const cx = c.getContext('2d')!;
  cx.imageSmoothingEnabled = false;
  drawTiles(cx);
  decorate(cx);
  bgCache = c;
  return c;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private game: Game;
  private t = 0; // 애니메이션 시계(초)

  constructor(canvas: HTMLCanvasElement, game: Game) {
    this.ctx = canvas.getContext('2d')!;
    this.game = game;
    canvas.width = MAP.size;
    canvas.height = MAP.size;
  }

  draw(): void {
    const ctx = this.ctx;
    this.t = (performance.now() / 1000) * PLAY_SPEED; // 걷기 애니메이션도 게임 속도에 맞춘다
    ctx.imageSmoothingEnabled = false; // 픽셀 아트 선명하게
    ctx.clearRect(0, 0, MAP.size, MAP.size);
    ctx.save();
    const sh = this.game.shake;
    if (sh > 0.2) ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    this.drawBackground();
    this.drawZones();
    this.drawGaps();
    this.drawBurns();
    this.drawUnitAuras();
    this.drawMobs();
    this.drawUnits();
    this.drawUnitSparkles();
    this.drawEffects();
    this.drawDrag(); // 드래그 화살표는 최상단
    ctx.restore();
    this.drawBossBar();
  }

  private drawBackground(): void {
    const bg = fieldBackground();
    if (bg) this.ctx.drawImage(bg, 0, 0);
    else drawTiles(this.ctx);
  }

  // 상단 보스 체력 바 (보스가 살아있을 때)
  private drawBossBar(): void {
    const boss = this.game.mobs.find((m) => m.boss);
    if (!boss) return;
    const ctx = this.ctx;
    const w = MAP.size * 0.62, h = 16, x = (MAP.size - w) / 2, y = 14;
    const ratio = Math.max(0, boss.hp / boss.maxHp);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    this.roundRect(x - 3, y - 3, w + 6, h + 6, 8); ctx.fill();
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#ff3b3b'); g.addColorStop(1, '#ff9f43');
    ctx.fillStyle = g;
    this.roundRect(x, y, w * ratio, h, 6); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `bold 13px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`BOSS  ${Math.ceil(ratio * 100)}%   ${Math.max(0, this.game.bossTimer / PLAY_SPEED).toFixed(0)}s`, MAP.size / 2, y + h / 2 + 1);
    ctx.restore();
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    if (w <= 0) return;
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 시트에서 (col,row) 프레임을 (dx,dy) 에 size 크기로 그린다
  private frame(img: CanvasImageSource, col: number, row: number, dx: number, dy: number, size: number): void {
    this.ctx.drawImage(img, col * FRAME, row * FRAME, FRAME, FRAME, dx, dy, size, size);
  }

  private walkCol(phase: number, period: number): number {
    return WALK_SEQ[Math.floor((this.t + phase) / period) % WALK_SEQ.length];
  }

  // flash(공격 발동 후 남은 시간, ATTACK_ANIM_DUR 에서 0으로 감소)를 스윙 프레임으로 변환
  private attackCol(flash: number): number {
    const progress = 1 - Math.max(0, Math.min(1, flash / ATTACK_ANIM_DUR));
    const idx = Math.min(ATTACK_SEQ.length - 1, Math.floor(progress * ATTACK_SEQ.length));
    return ATTACK_SEQ[idx];
  }

  private zonePath(i: number): void {
    const t = this.game.zones[i].tri;
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(t[0].x, t[0].y);
    ctx.lineTo(t[1].x, t[1].y);
    ctx.lineTo(t[2].x, t[2].y);
    ctx.closePath();
  }

  /** 화염술사 불 장판 */
  private drawBurns(): void {
    const ctx = this.ctx;
    for (const b of this.game.burns) {
      const left = Math.min(1, (b.until - this.game.time) / 0.6);
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      g.addColorStop(0, `rgba(255,190,60,${0.45 * left})`);
      g.addColorStop(0.6, `rgba(255,90,30,${0.3 * left})`);
      g.addColorStop(1, 'rgba(255,60,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (0.95 + Math.sin(this.t * 9 + b.x) * 0.05), 0, Math.PI * 2); ctx.fill();
    }
  }

  /** 어떤 유닛도 닿지 않는 길 구간을 빨갛게 - 어디가 뚫렸는지 보고 구역을 바꾼다 (0.4초마다 다시 계산) */
  private gaps: { x: number; y: number }[] = [];
  private gapAt = -1;
  /** 지금 빨갛게 보이는 빈틈 수 (판 안 안내용) */
  get gapCount(): number { return this.gaps.length; }
  private drawGaps(): void {
    const g = this.game;
    if (!g.units.length) return;
    if (this.t - this.gapAt > 0.4 || this.gapAt < 0) {
      this.gapAt = this.t;
      this.gaps = g.pathGaps().map((i) => pathAt(i / GAP_SAMPLES));
    }
    if (!this.gaps.length) return;
    const ctx = this.ctx;
    ctx.fillStyle = `rgba(255,50,40,${0.22 + Math.sin(this.t * 4) * 0.08})`;
    for (const p of this.gaps) ctx.fillRect(p.x - 12, p.y - 12, 24, 24);
  }

  private drawZones(): void {
    const ctx = this.ctx;
    const drag = this.game.drag;
    ctx.save();
    this.game.zones.forEach((zone, i) => {
      this.zonePath(i);
      const isFrom = drag?.from === i;
      const isTo = drag?.to === i;
      if (isFrom) {
        // 출발 구역: 밝게 들어올림
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
      } else if (isTo) {
        // 대상 구역: 금색 하이라이트 (교환 가능 표시)
        ctx.fillStyle = 'rgba(255,207,63,0.22)';
      } else if (drag) {
        // 드래그 중 나머지 구역은 살짝 어둡게 → 후보가 도드라짐
        ctx.fillStyle = 'rgba(0,0,0,0.10)';
      } else {
        ctx.fillStyle = zone.job
          ? this.hexA(JOB_TINT[zone.job], 0.10)
          : 'rgba(255,255,255,0.02)';
      }
      ctx.fill();
      if (isFrom || isTo) {
        ctx.setLineDash([10, 6]);
        ctx.lineDashOffset = -this.t * 40; // 개미행렬 점선
        ctx.strokeStyle = isTo ? '#ffcf3f' : 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 4;
      } else {
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(20,20,20,0.18)';
        ctx.lineWidth = 2;
      }
      ctx.stroke();
      ctx.setLineDash([]);
    });
    ctx.restore();
  }

  // 드래그 중: 출발 구역 중심 → 포인터 화살표
  private drawDrag(): void {
    const drag = this.game.drag;
    if (!drag) return;
    const ctx = this.ctx;
    const from = this.game.zones[drag.from];
    const dx = drag.x - from.cx, dy = drag.y - from.cy;
    const len = Math.hypot(dx, dy);
    if (len < 24) return; // 너무 짧으면 생략
    const ux = dx / len, uy = dy / len;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(from.cx, from.cy);
    ctx.lineTo(drag.x - ux * 16, drag.y - uy * 16);
    ctx.stroke();
    // 화살촉
    ctx.beginPath();
    ctx.moveTo(drag.x, drag.y);
    ctx.lineTo(drag.x - ux * 18 - uy * 9, drag.y - uy * 18 + ux * 9);
    ctx.lineTo(drag.x - ux * 18 + uy * 9, drag.y - uy * 18 - ux * 9);
    ctx.closePath();
    ctx.fill();
    // 교환 아이콘 (대상 구역 위)
    if (drag.to !== null) {
      const to = this.game.zones[drag.to];
      this.drawSwapMark(to.cx, to.cy);
    }
    ctx.restore();
  }

  // 구역 교환 표시: 엇갈린 두 화살표
  private drawSwapMark(x: number, y: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.fillStyle = '#fff';
    for (const dir of [1, -1]) {
      const yy = y + dir * 8;
      ctx.beginPath();
      ctx.moveTo(x - dir * 16, yy - 3);
      ctx.lineTo(x + dir * 8, yy - 3);
      ctx.lineTo(x + dir * 8, yy - 9);
      ctx.lineTo(x + dir * 18, yy);
      ctx.lineTo(x + dir * 8, yy + 9);
      ctx.lineTo(x + dir * 8, yy + 3);
      ctx.lineTo(x - dir * 16, yy + 3);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
    }
    ctx.restore();
  }

  private hexA(hex: string, a: number): string {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  private drawMobs(): void {
    const ctx = this.ctx;
    for (const m of this.game.mobs) {
      const s = m.size;
      // 발밑 그림자
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(m.x, m.y + s * 0.38, s * 0.32, s * 0.12, 0, 0, Math.PI * 2); ctx.fill();
      this.drawMobAura(m);
      const spr = mobSprite(m.race, m.variant);
      if (spr.ready) {
        const basePeriod = m.kind === 'fast' ? 0.1 : m.kind === 'tank' ? 0.22 : 0.16;
        const period = m.slow > 0 ? basePeriod / Math.max(0.3, 1 - m.slowPct) : basePeriod; // 둔화: 걸음도 느리게
        const col = m.pause > 0 ? 1 : this.walkCol(m.id * 0.07, period); // 코너 정지 시 대기 프레임
        ctx.save();
        if (m.hitFlash > 0) ctx.globalAlpha = 0.65;
        if (m.ghost) ctx.globalAlpha *= 0.6 + Math.sin(this.t * 3 + m.id) * 0.1; // 유령: 반투명
        if (m.hidden) ctx.globalAlpha *= 0.22; // 그림자 도적: 숨음
        this.frame(spr.img, col, m.dir, m.x - s / 2, m.y - s / 2, s);
        ctx.restore();
        // 상태 색 덧칠 (ctx.filter 는 사파리 미지원이라 source-atop 대신 반투명 원으로 표시)
        // 중독(초록)·표식(붉은 과녁)
        if (m.poison && m.poison.until > this.game.time) {
          ctx.fillStyle = `rgba(120,220,80,${0.18 + m.poison.stacks * 0.07})`;
          ctx.beginPath(); ctx.arc(m.x, m.y, s * 0.34, 0, Math.PI * 2); ctx.fill();
        }
        if (m.markUntil && m.markUntil > this.game.time) {
          ctx.strokeStyle = 'rgba(255,80,60,0.9)';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(m.x, m.y - s * 0.62, 6, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(m.x - 9, m.y - s * 0.62); ctx.lineTo(m.x + 9, m.y - s * 0.62); ctx.moveTo(m.x, m.y - s * 0.62 - 9); ctx.lineTo(m.x, m.y - s * 0.62 + 9); ctx.stroke();
        }
        if (m.enraged) {
          ctx.fillStyle = `rgba(255,60,40,${0.22 + Math.sin(this.t * 10 + m.id) * 0.08})`;
          ctx.beginPath(); ctx.arc(m.x, m.y, s * 0.38, 0, Math.PI * 2); ctx.fill();
        }
        if (m.slow > 0) {
          // 둔화(전사·빙결술사): 얼음빛 덧칠 + 발밑 얼음 고리 (끝나갈 때 옅어진다)
          const k = Math.min(1, m.slow / 0.4);
          ctx.fillStyle = `rgba(120,200,255,${0.34 * k})`;
          ctx.beginPath(); ctx.arc(m.x, m.y, s * 0.36, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = `rgba(150,220,255,${0.9 * k})`;
          ctx.lineWidth = 5;
          ctx.beginPath(); ctx.ellipse(m.x, m.y + s * 0.38, s * 0.42, s * 0.16, 0, 0, Math.PI * 2); ctx.stroke();
        }
        if (m.hitFlash > 0.06) {
          // 피격 순간 흰 번쩍임
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.35;
          this.frame(spr.img, col, m.dir, m.x - s / 2, m.y - s / 2, s);
          ctx.restore();
        }
      } else {
        ctx.fillStyle = m.boss ? '#b23' : '#357';
        ctx.beginPath(); ctx.arc(m.x, m.y, s / 2, 0, Math.PI * 2); ctx.fill();
      }
      const w = Math.max(28, s * 0.8), h = m.boss ? 6 : 4;
      const ratio = Math.max(0, m.hp / m.maxHp);
      const by = m.y - s / 2 - 8;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(m.x - w / 2 - 1, by - 1, w + 2, h + 2);
      ctx.fillStyle = m.kind === 'card' && !m.boss ? '#ff8a3d' : '#ff5252'; // 체력 막대는 빨강 고정 (상대가 보낸 몹만 주황)
      ctx.fillRect(m.x - w / 2, by, w * ratio, h);
      if (m.slow > 0) {
        // 체력 막대 오른쪽 파란 아래 화살표 두 개 = 느려짐
        const ax = m.x + w / 2 + 10, ay = by - 6;
        ctx.fillStyle = '#8fd8ff';
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.lineWidth = 3;
        for (const dy of [0, 8]) {
          ctx.beginPath(); ctx.moveTo(ax - 8, ay + dy); ctx.lineTo(ax + 8, ay + dy); ctx.lineTo(ax, ay + dy + 8); ctx.closePath();
          ctx.stroke(); ctx.fill();
        }
      }
      const big = m.card !== undefined && ATTACKS[m.card].hpMult >= 5 && m.gold === undefined; // 거인·킹·마왕은 이름표
      if (m.boss || big) {
        ctx.fillStyle = m.boss ? '#ffd54f' : '#ff8a3d';
        ctx.font = `bold 14px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        const label = m.boss ? 'BOSS' : ATTACKS[m.card!].kr;
        ctx.strokeText(label, m.x, by - 5);
        ctx.fillText(label, m.x, by - 5);
      }
    }
  }

  // 몹 종류별 표식: 탱커=방패 링, 빠름=잔상 선, 보스=붉은 오라
  private drawMobAura(m: Mob): void {
    const ctx = this.ctx;
    if (m.boss) {
      const r = m.size * 0.55 + Math.sin(this.t * 4) * 3;
      const g = ctx.createRadialGradient(m.x, m.y, r * 0.3, m.x, m.y, r);
      g.addColorStop(0, 'rgba(255,60,60,0.0)');
      g.addColorStop(1, 'rgba(255,60,60,0.35)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(m.x, m.y, r, 0, Math.PI * 2); ctx.fill();
    } else if (m.kind === 'tank') {
      ctx.strokeStyle = 'rgba(180,200,230,0.7)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(m.x, m.y + 2, m.size * 0.42, 0, Math.PI * 2); ctx.stroke();
    } else if (m.kind === 'fast' && m.pause <= 0) {
      const dx = m.dir === 1 ? 1 : m.dir === 2 ? -1 : 0;
      const dy = m.dir === 0 ? -1 : m.dir === 3 ? 1 : 0;
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 2;
      for (let i = -1; i <= 1; i++) {
        const ox = dy !== 0 ? i * 8 : 0, oy = dx !== 0 ? i * 8 : 0;
        ctx.beginPath();
        ctx.moveTo(m.x + dx * 14 + ox, m.y + dy * 14 + oy);
        ctx.lineTo(m.x + dx * 28 + ox, m.y + dy * 28 + oy);
        ctx.stroke();
      }
    } else if (m.kind === 'card') {
      // 상대가 던진 몹: 발밑 붉은 고리 (+ 신관은 회복 범위)
      const def = ATTACKS[m.card!];
      if (def.heal) {
        ctx.fillStyle = 'rgba(126,232,126,0.10)';
        ctx.beginPath(); ctx.arc(m.x, m.y, 130, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = `rgba(255,90,61,${0.55 + Math.sin(this.t * 6) * 0.2})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(m.x, m.y + m.size * 0.38, m.size * 0.36, m.size * 0.14, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }

  // 전설 이상 유닛 발밑 등급 오라 (유닛보다 먼저 그림)
  private drawUnitAuras(): void {
    const ctx = this.ctx;
    for (const u of this.game.units) {
      if (u.gradeIndex < 3) continue;
      const color = GRADES[u.gradeIndex].color;
      const pulse = 0.5 + Math.sin(this.t * 3 + u.id) * 0.2;
      ctx.fillStyle = this.hexA(color, 0.28 * pulse + 0.1);
      ctx.beginPath(); ctx.ellipse(u.x, u.y + 22, 30, 11, 0, 0, Math.PI * 2); ctx.fill();
      if (u.gradeIndex >= 4) {
        ctx.strokeStyle = this.hexA(color, 0.7 * pulse);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(u.x, u.y + 22, 36, 13, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }

  /** 신화·태초 유닛: 몸 둘레를 도는 반짝임 (신화 금빛 2개, 태초 진홍 3개) - 옷이 처음부터 화려한 유닛도 등급이 한눈에 보이게 */
  private drawUnitSparkles(): void {
    const ctx = this.ctx;
    for (const u of this.game.units) {
      if (u.gradeIndex < 4) continue;
      const n = u.gradeIndex >= 5 ? 3 : 2;
      const color = GRADES[u.gradeIndex].color;
      for (let i = 0; i < n; i++) {
        const a = this.t * 1.6 + u.id + (i * Math.PI * 2) / n;
        const x = u.x + Math.cos(a) * 26, y = u.y - 6 + Math.sin(a) * 10;
        const tw = 0.5 + 0.5 * Math.sin(this.t * 6 + i * 2 + u.id); // 깜빡임
        const r = 2 + tw * 4;
        ctx.fillStyle = this.hexA('#ffffff', 0.55 + tw * 0.45);
        ctx.fillRect(x - 1, y - r, 2, r * 2);
        ctx.fillRect(x - r, y - 1, r * 2, 2);
        ctx.fillStyle = this.hexA(color, 0.95);
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      }
    }
  }

  private drawUnits(): void {
    const ctx = this.ctx;
    for (const u of this.game.units) {
      const spr = unitSprite(u.job, u.grade);
      const s = UNIT_DRAW; // 작은 화면에서도 알아보게
      if (spr.ready) {
        if (u.moveTo) {
          // 구역 교환 등으로 이동 중: 이동 방향 행 + 걷기 사이클 재생
          const col = this.walkCol(u.id * 0.09, 0.14);
          this.frame(spr.img, col, u.dir, u.x - s / 2, u.y - s / 2, s);
        } else {
          // 정지 상태: 공격 중인 몹 쪽(u.face, 없으면 정면). 공격할 때만 스윙, 그 외엔 고정 Idle 프레임
          const col = u.flash > 0 ? this.attackCol(u.flash) : 1;
          this.frame(spr.img, col, u.face ?? 0, u.x - s / 2, u.y - s / 2, s);
        }
      } else {
        ctx.fillStyle = JOB_TINT[u.job];
        ctx.fillRect(u.x - s / 2, u.y - s / 2, s, s);
      }
      // 공격 피드백은 스윙 프레임으로 충분하다. 스프라이트 칸 전체를 흰색으로 덮으면
      // 투명 영역까지 칠해져 공격마다 흰 네모가 깜빡인다.
    }
  }

  /** 상대가 던진 몹: 착지 지점에 붉은 경고 고리, 하늘에서 포물선으로 떨어진다 */
  private drawDrop(e: Extract<Effect, { type: 'drop' }>): void {
    const ctx = this.ctx;
    const k = 1 - e.ttl / e.dur; // 0 → 1 (착지)
    const a = ATTACKS[e.card];
    // 경고 고리 (점점 좁아짐)
    const r = 26 + (1 - k) * 34;
    ctx.strokeStyle = `rgba(255,70,50,${0.5 + Math.sin(this.t * 18) * 0.3})`;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(e.x, e.y + 10, r, r * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = `rgba(0,0,0,${0.15 + k * 0.25})`;
    ctx.beginPath(); ctx.ellipse(e.x, e.y + 10, 8 + k * 16, 3 + k * 6, 0, 0, Math.PI * 2); ctx.fill();
    // 떨어지는 몹 (위쪽 바깥에서 비스듬히)
    const spr = mobSprite(a.race, a.variant);
    if (!spr.ready) return;
    const s = 60 * a.size * (0.7 + k * 0.3);
    const h = (1 - k) * (1 - k) * 520;
    const x = e.x + (1 - k) * (e.seed - 0.5) * 160;
    ctx.save();
    ctx.translate(x, e.y - h);
    ctx.rotate((1 - k) * (e.seed > 0.5 ? 1 : -1) * 3);
    this.frame(spr.img, 1, 0, -s / 2, -s / 2, s);
    ctx.restore();
  }

  private drawEffects(): void {
    const ctx = this.ctx;
    for (const e of this.game.effects) {
      switch (e.type) {
        case 'proj': this.drawProj(e); break;
        case 'pop': {
          const life = e.boss ? 0.8 : 0.45;
          const p = 1 - e.ttl / life;
          const alpha = Math.max(0, 1 - p);
          const r = p * (e.boss ? 70 : 26) + 4;
          ctx.strokeStyle = `rgba(255,240,150,${alpha})`;
          ctx.lineWidth = e.boss ? 5 : 3;
          ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.stroke();
          // 파편
          const n = e.boss ? 14 : 6;
          ctx.fillStyle = `rgba(255,200,90,${alpha})`;
          for (let i = 0; i < n; i++) {
            const ang = e.seed + (i / n) * Math.PI * 2;
            const d = 6 + p * (e.boss ? 80 : 30);
            ctx.fillRect(e.x + Math.cos(ang) * d - 2, e.y + Math.sin(ang) * d - 2 + p * p * 12, 4, 4);
          }
          break;
        }
        case 'splash': {
          const p = 1 - e.ttl / 0.35;
          const alpha = Math.max(0, 1 - p);
          const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * (0.5 + p * 0.5));
          g.addColorStop(0, this.hexA(e.color, 0.45 * alpha));
          g.addColorStop(1, this.hexA(e.color, 0));
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = this.hexA(e.color, alpha);
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (0.4 + p * 0.6), 0, Math.PI * 2); ctx.stroke();
          break;
        }
        case 'slash': {
          const p = 1 - e.ttl / 0.25;
          ctx.save();
          ctx.translate(e.x, e.y);
          ctx.rotate(e.seed);
          ctx.strokeStyle = `rgba(255,240,200,${1 - p})`;
          ctx.lineWidth = 5 * (1 - p) + 1;
          ctx.beginPath(); ctx.arc(0, 0, 22, -0.9 + p * 0.6, 0.9 + p * 0.6); ctx.stroke();
          ctx.restore();
          break;
        }
        case 'merge': {
          const p = 1 - e.ttl / 0.7;
          ctx.strokeStyle = this.hexA(e.color, 1 - p);
          ctx.lineWidth = 4;
          for (let k = 0; k < 2; k++) {
            ctx.beginPath(); ctx.arc(e.x, e.y, 10 + p * (50 + k * 25), 0, Math.PI * 2); ctx.stroke();
          }
          ctx.fillStyle = this.hexA(e.color, (1 - p) * 0.8);
          for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2 + p * 2;
            const d = 40 * (1 - p);
            ctx.beginPath(); ctx.arc(e.x + Math.cos(ang) * d, e.y + Math.sin(ang) * d, 3, 0, Math.PI * 2); ctx.fill();
          }
          break;
        }
        case 'summon': {
          const p = 1 - e.ttl / 0.5;
          // 기둥 빛
          const h = (e.big ? 120 : 70) * (1 - p * 0.5);
          const g = ctx.createLinearGradient(0, e.y - h, 0, e.y + 16);
          g.addColorStop(0, this.hexA(e.color, 0));
          g.addColorStop(1, this.hexA(e.color, 0.55 * (1 - p)));
          ctx.fillStyle = g;
          ctx.fillRect(e.x - (e.big ? 18 : 12), e.y - h, e.big ? 36 : 24, h + 16);
          ctx.strokeStyle = this.hexA(e.color, 1 - p);
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(e.x, e.y + 16, 10 + p * 22, 4 + p * 8, 0, 0, Math.PI * 2); ctx.stroke();
          break;
        }
        case 'burst': this.drawBurst(e); break;
        case 'drop': this.drawDrop(e); break;
        case 'beam': {
          const k = e.ttl / e.dur;
          ctx.save();
          ctx.globalAlpha = Math.max(0, k);
          ctx.strokeStyle = e.color;
          ctx.lineCap = 'round';
          ctx.lineWidth = e.w;
          ctx.beginPath(); ctx.moveTo(e.x1, e.y1); ctx.lineTo(e.x2, e.y2); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.8)';
          ctx.lineWidth = Math.max(1, e.w * 0.35);
          ctx.beginPath(); ctx.moveTo(e.x1, e.y1); ctx.lineTo(e.x2, e.y2); ctx.stroke();
          ctx.restore();
          break;
        }
        case 'dmg': {
          const p = 1 - e.ttl / 0.7;            // 0→1 진행
          const alpha = Math.max(0, Math.min(1, (e.ttl / 0.7) * 1.6));
          ctx.globalAlpha = alpha;
          const size = e.crit ? 24 + (p < 0.15 ? (0.15 - p) * 60 : 0) : 17;
          ctx.font = `bold ${size}px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(0,0,0,0.75)';
          ctx.fillStyle = e.crit ? '#ff6b3d' : '#ffe066';
          const ty = e.y - p * 28;
          const text = e.crit ? `${this.short(e.value)}!` : this.short(e.value);
          ctx.strokeText(text, e.x, ty);
          ctx.fillText(text, e.x, ty);
          ctx.globalAlpha = 1;
          break;
        }
        case 'gold': {
          const p = 1 - e.ttl / 0.8;
          ctx.globalAlpha = Math.max(0, 1 - p * p);
          ctx.font = `bold 15px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(0,0,0,0.7)';
          ctx.fillStyle = '#ffcf3f';
          const ty = e.y - 14 - p * 22;
          const label = `+${e.value}`;
          const tw = ctx.measureText(label).width;
          ctx.strokeText(label, e.x - 8, ty);
          ctx.fillText(label, e.x - 8, ty);
          const coin = uiSprite('coin');
          if (coin.ready) ctx.drawImage(coin.img, e.x - 8 + tw / 2 + 1, ty - 13, 16, 16);
          ctx.globalAlpha = 1;
          break;
        }
      }
    }
  }

  // 큰 수 축약 (12.3K, 4.5M)
  private short(v: number): string {
    if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e4) return (v / 1e3).toFixed(1) + 'K';
    return String(v);
  }

  // 직업별 투사체: 궁수=화살, 마법사=마력구, 전사=검기
  private drawProj(e: Extract<import('./types').Effect, { type: 'proj' }>): void {
    const ctx = this.ctx;
    const p = 1 - e.ttl / e.dur; // 0→1 비행 진행
    const x = e.x1 + (e.x2 - e.x1) * p;
    const y = e.y1 + (e.y2 - e.y1) * p;
    const ang = Math.atan2(e.y2 - e.y1, e.x2 - e.x1);
    const color = e.grade === 0 ? JOB_TINT[e.job] : GRADES[e.grade]?.color ?? '#fff';
    const base = UNIT_BY_ID[e.job].base;
    ctx.save();
    if (base === 'archer') {
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.strokeStyle = this.hexA(color, 0.5);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(-6, 0); ctx.stroke(); // 궤적
      ctx.strokeStyle = '#f5e6c8';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(6, 0); ctx.stroke();
      ctx.fillStyle = '#ddd';
      ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(3, -3); ctx.lineTo(3, 3); ctx.closePath(); ctx.fill();
    } else if (base === 'wizard') {
      const r = (e.job === 'bomber' ? 8 : 5) + e.grade * 0.8;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.35, this.hexA(color, 0.85));
      g.addColorStop(1, 'rgba(142,91,216,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.strokeStyle = this.hexA(color, 0.9);
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(-6, 0, 12, -1.1, 1.1); ctx.stroke();
    }
    ctx.restore();
  }

  private drawBurst(e: Extract<import('./types').Effect, { type: 'burst' }>): void {
    const ctx = this.ctx;
    // 태초 등급 타격 폭발: 확장 링 2겹 + 방사형 파편
    const p = 1 - e.ttl / 0.45;                    // 0→1 진행
    const alpha = Math.max(0, 1 - p);
    const r = 8 + p * 46;
    ctx.save();
    ctx.strokeStyle = `rgba(255,110,40,${alpha})`;
    ctx.lineWidth = 4 * (1 - p) + 1;
    ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = `rgba(255,230,120,${alpha})`;
    ctx.lineWidth = 2.5 * (1 - p) + 0.5;
    ctx.beginPath(); ctx.arc(e.x, e.y, r * 0.55, 0, Math.PI * 2); ctx.stroke();
    if (p < 0.35) {
      ctx.fillStyle = `rgba(255,255,220,${(1 - p / 0.35) * 0.9})`;
      ctx.beginPath(); ctx.arc(e.x, e.y, 10 * (1 - p / 0.35) + 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = `rgba(255,170,60,${alpha})`;
    for (let i = 0; i < 6; i++) {
      const ang = e.seed + (i / 6) * Math.PI * 2;
      const d = 10 + p * 40;
      const size = 3.5 * (1 - p) + 0.5;
      ctx.beginPath();
      ctx.arc(e.x + Math.cos(ang) * d, e.y + Math.sin(ang) * d, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
