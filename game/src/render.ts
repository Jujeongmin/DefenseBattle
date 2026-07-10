// ============================================================
//  캔버스 렌더러
// ============================================================
import { MAP, Game } from './engine';
import { unitSprite, mobSprite, tileSprite } from './assets';
import type { Job } from './types';

const JOB_TINT: Record<Job, string> = { archer: '#3fae4a', wizard: '#8e5bd8', warrior: '#c9a13b' };

// 스프라이트 시트: 32x32 프레임, 3열(걷기) x 4행(하/좌/우/상)
const FRAME = 32;
const WALK_SEQ = [1, 0, 1, 2]; // 걷기 컬럼 순서 (1=정지 기준)
const ATTACK_SEQ = [1, 2, 0, 1]; // 공격 스윙 프레임 순서 (1=정지 기준)
const ATTACK_ANIM_DUR = 0.1;     // engine.ts 의 u.flash 초기값과 동일해야 함

// 타일 맵 설정 (16px 원본 타일 → TILE 크기로 스케일)
const TILE = 45; // 720 / 16
const GRASS_SRC = { sx: 16, sy: 80 }; // grass.png 의 채움 잔디 타일
const DIRT_SRC = { sx: 0, sy: 0 };    // dirt.png 의 채움 흙 타일
const PATH_INSET = 70;                // 경로 중심선 여백 (PATH.corners 와 동일)
const BAND_HALF = 30;                 // 흙길 밴드 반폭

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
    this.t = performance.now() / 1000;
    ctx.imageSmoothingEnabled = false; // 픽셀 아트 선명하게
    ctx.clearRect(0, 0, MAP.size, MAP.size);
    this.drawTiles();
    this.drawZones();
    this.drawMobs();
    this.drawUnits();
    this.drawEffects();
    this.drawDrag(); // 드래그 화살표는 최상단
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

  // 잔디 필드 + 흙길 링을 타일로 그린다
  private drawTiles(): void {
    const ctx = this.ctx;
    const grass = tileSprite('grass');
    const dirt = tileSprite('dirt');
    const n = Math.ceil(MAP.size / TILE);
    const o1 = PATH_INSET - BAND_HALF;         // 흙길 바깥 경계
    const i1 = PATH_INSET + BAND_HALF;          // 흙길 안쪽 경계
    const oFar = MAP.size - o1, iFar = MAP.size - i1;
    for (let gy = 0; gy < n; gy++) {
      for (let gx = 0; gx < n; gx++) {
        const cx = gx * TILE + TILE / 2, cy = gy * TILE + TILE / 2;
        const inOuter = cx >= o1 && cx <= oFar && cy >= o1 && cy <= oFar;
        const inInner = cx > i1 && cx < iFar && cy > i1 && cy < iFar;
        const isPath = inOuter && !inInner;    // 사각 링(흙길)
        const spr = isPath ? dirt : grass;
        const src = isPath ? DIRT_SRC : GRASS_SRC;
        if (spr.ready) {
          ctx.drawImage(spr.img, src.sx, src.sy, 16, 16, gx * TILE, gy * TILE, TILE, TILE);
        } else {
          ctx.fillStyle = isPath ? '#d3b183' : '#8bb04a';
          ctx.fillRect(gx * TILE, gy * TILE, TILE, TILE);
        }
      }
    }
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
      ctx.font = 'bold 30px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⇄', to.cx, to.cy);
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
      const spr = mobSprite(m.race);
      if (spr.ready) {
        const col = m.pause > 0 ? 1 : this.walkCol(m.id * 0.07, 0.16); // 코너 정지 시 대기 프레임
        if (m.hitFlash > 0) { ctx.save(); ctx.globalAlpha = 0.6; }
        this.frame(spr.img, col, m.dir, m.x - s / 2, m.y - s / 2, s);
        if (m.hitFlash > 0) ctx.restore();
      } else {
        ctx.fillStyle = m.boss ? '#b23' : '#357';
        ctx.beginPath(); ctx.arc(m.x, m.y, s / 2, 0, Math.PI * 2); ctx.fill();
      }
      const w = s, h = 4;
      const ratio = Math.max(0, m.hp / m.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(m.x - w / 2, m.y - s / 2 - 8, w, h);
      ctx.fillStyle = m.boss ? '#ff5252' : '#7ee87e';
      ctx.fillRect(m.x - w / 2, m.y - s / 2 - 8, w * ratio, h);
      if (m.boss) {
        ctx.fillStyle = '#ffd54f';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('BOSS', m.x, m.y - s / 2 - 12);
      }
    }
  }

  private drawUnits(): void {
    const ctx = this.ctx;
    for (const u of this.game.units) {
      const spr = unitSprite(u.job, u.grade);
      const s = 45; // 30 → 1.5배
      if (spr.ready) {
        if (u.moveTo) {
          // 구역 교환 등으로 이동 중: 이동 방향 행 + 걷기 사이클 재생
          const col = this.walkCol(u.id * 0.09, 0.14);
          this.frame(spr.img, col, u.dir, u.x - s / 2, u.y - s / 2, s);
        } else {
          // 정지 상태: 정면(row 0). 공격 중일 때만 스윙, 그 외엔 고정 Idle 프레임
          const col = u.flash > 0 ? this.attackCol(u.flash) : 1;
          this.frame(spr.img, col, 0, u.x - s / 2, u.y - s / 2, s);
        }
      } else {
        ctx.fillStyle = JOB_TINT[u.job];
        ctx.fillRect(u.x - s / 2, u.y - s / 2, s, s);
      }
      if (u.flash > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(u.x - s / 2, u.y - s / 2, s, s);
      }
    }
  }

  private drawEffects(): void {
    const ctx = this.ctx;
    for (const e of this.game.effects) {
      if (e.type === 'shot') {
        ctx.strokeStyle = this.hexA(JOB_TINT[e.job], Math.max(0, e.ttl / 0.15));
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(e.x1, e.y1);
        ctx.lineTo(e.x2, e.y2);
        ctx.stroke();
      } else if (e.type === 'pop') {
        const r = (0.4 - e.ttl) * (e.boss ? 60 : 30) + 4;
        ctx.strokeStyle = `rgba(255,240,150,${Math.max(0, e.ttl / 0.4)})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.stroke();
      } else if (e.type === 'burst') {
        // 태초 등급 타격 폭발: 확장 링 2겹 + 방사형 파편
        const p = 1 - e.ttl / 0.45;                    // 0→1 진행
        const alpha = Math.max(0, 1 - p);
        const r = 8 + p * 46;
        ctx.save();
        // 바깥 링 (붉은 주황)
        ctx.strokeStyle = `rgba(255,110,40,${alpha})`;
        ctx.lineWidth = 4 * (1 - p) + 1;
        ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.stroke();
        // 안쪽 링 (밝은 노랑, 반박자 늦게)
        ctx.strokeStyle = `rgba(255,230,120,${alpha})`;
        ctx.lineWidth = 2.5 * (1 - p) + 0.5;
        ctx.beginPath(); ctx.arc(e.x, e.y, r * 0.55, 0, Math.PI * 2); ctx.stroke();
        // 중심 섬광 (초반에만)
        if (p < 0.35) {
          ctx.fillStyle = `rgba(255,255,220,${(1 - p / 0.35) * 0.9})`;
          ctx.beginPath(); ctx.arc(e.x, e.y, 10 * (1 - p / 0.35) + 2, 0, Math.PI * 2); ctx.fill();
        }
        // 방사형 파편 6개
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
      } else if (e.type === 'dmg') {
        const p = 1 - e.ttl / 0.6;            // 0→1 진행
        const alpha = Math.max(0, Math.min(1, e.ttl / 0.6 * 1.5));
        ctx.globalAlpha = alpha;
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.fillStyle = '#ffe066';
        const ty = e.y - p * 26;
        ctx.strokeText(String(e.value), e.x, ty);
        ctx.fillText(String(e.value), e.x, ty);
        ctx.globalAlpha = 1;
      }
    }
  }
}
