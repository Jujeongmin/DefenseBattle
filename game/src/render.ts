// ============================================================
//  캔버스 렌더러
// ============================================================
import { MAP, Game } from './engine';
import { unitSprite, mobSprite, tileSprite, uiSprite } from './assets';
import type { Job } from './types';

const JOB_TINT: Record<Job, string> = { archer: '#3fae4a', wizard: '#8e5bd8', warrior: '#c9a13b' };

// 직업×등급별 불릿 (ui/bullets.png = All_Fire_Bullet_Pixel_16x16, 16px 셀)
// 직업 = 탄 계열(궁수=화살, 마법사=오브, 전사=별), 등급 = 같은 계열의 5단계 변형 + 태초 전용탄
// 모든 탄은 우향 기준(회전으로 방향 처리), 별/오브는 대칭이라 무관
const BULLET_SRC: Record<Job, { sx: number; sy: number }[]> = {
  archer: [
    { sx: 0, sy: 256 }, { sx: 16, sy: 256 }, { sx: 32, sy: 256 },
    { sx: 48, sy: 256 }, { sx: 64, sy: 256 }, { sx: 288, sy: 256 }, // 태초: 흰 셰브런 화살
  ],
  wizard: [
    { sx: 0, sy: 208 }, { sx: 16, sy: 208 }, { sx: 32, sy: 208 },
    { sx: 48, sy: 208 }, { sx: 64, sy: 208 }, { sx: 272, sy: 240 }, // 태초: 대형 파이어볼
  ],
  warrior: [
    { sx: 0, sy: 192 }, { sx: 16, sy: 192 }, { sx: 32, sy: 192 },
    { sx: 48, sy: 192 }, { sx: 64, sy: 192 }, { sx: 272, sy: 256 }, // 태초: 빛나는 별
  ],
};
// 등급이 오를수록 탄 크기도 커짐 (18 → 28px)
function bulletSize(gradeIndex: number): number {
  return 18 + gradeIndex * 2;
}

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

// grass.png 시트에 원래부터 있던 잔디 덤불/들꽃 장식 변형(미사용) - 맵 바깥 테두리에 흩뿌려 재활용
const GRASS_DECOR_SRC = [
  { sx: 96, sy: 80 },  { sx: 112, sy: 80 },
  { sx: 96, sy: 96 },  { sx: 112, sy: 96 },
  { sx: 128, sy: 80 }, { sx: 144, sy: 80 },
];

// 좌표 기반 결정론적 해시(0~1) - 프레임마다 흔들리지 않는 고정 장식 배치용
function hash2(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) ^ (a << 13);
  h = Math.imul(h ^ (h >>> 15), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private game: Game;
  private t = 0; // 애니메이션 시계(초)
  private lastT = 0;
  // 구역별 룬 연출 상태: 직업이 바뀐(스왑된) 순간 잠깐 링이 확 번지는 플레어 연출용
  private zonePrevJob: (Job | null)[] = [null, null, null, null];
  private zoneFlare = [0, 0, 0, 0];

  constructor(canvas: HTMLCanvasElement, game: Game) {
    this.ctx = canvas.getContext('2d')!;
    this.game = game;
    canvas.width = MAP.size;
    canvas.height = MAP.size;
  }

  draw(): void {
    const ctx = this.ctx;
    this.t = performance.now() / 1000;
    const dt = this.lastT ? Math.min(0.1, this.t - this.lastT) : 0;
    this.lastT = this.t;
    ctx.imageSmoothingEnabled = false; // 픽셀 아트 선명하게
    ctx.clearRect(0, 0, MAP.size, MAP.size);
    this.drawTiles();
    this.drawArenaFrame();
    this.drawZoneRunes(dt);
    this.drawZones();
    this.drawMobs();
    this.drawUnits();
    this.drawEffects();
    this.drawDrag(); // 드래그 화살표는 최상단
    this.drawVignette();
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
        // 타일마다 아주 살짝 명도를 다르게 얹어 동일 타일 반복이 도드라지지 않게 한다(고정 해시라 안 흔들림).
        const variance = (hash2(gx * 7 + 3, gy * 13 + 5) - 0.5) * 0.12;
        if (variance > 0.002) {
          ctx.fillStyle = `rgba(255,255,255,${variance})`;
          ctx.fillRect(gx * TILE, gy * TILE, TILE, TILE);
        } else if (variance < -0.002) {
          ctx.fillStyle = `rgba(0,0,0,${-variance})`;
          ctx.fillRect(gx * TILE, gy * TILE, TILE, TILE);
        }
        // 맵 맨 바깥 테두리 줄(경로/구역과 절대 겹치지 않는 순수 잔디)에만 덤불·들꽃 장식을 흩뿌린다.
        // 매 프레임 새로 뽑지 않고 타일 좌표로 고정 해시를 써서 장식이 흔들리지 않게 한다.
        const isBorder = gx === 0 || gx === n - 1 || gy === 0 || gy === n - 1;
        if (isBorder && !isPath && grass.ready) {
          const r = hash2(gx, gy);
          if (r < 0.42) {
            const idx = Math.floor(hash2(gx + 91, gy + 17) * GRASS_DECOR_SRC.length);
            const d = GRASS_DECOR_SRC[idx];
            ctx.drawImage(grass.img, d.sx, d.sy, 16, 16, gx * TILE, gy * TILE, TILE, TILE);
          }
        }
      }
    }
  }

  // 구역 사각 아레나의 외곽을 은은한 이중선 + 모서리 장식으로 둘러 "전장"임을 시각적으로 구획한다.
  private drawArenaFrame(): void {
    const z = this.game.zones;
    if (z.length < 4) return;
    // 4개 구역 삼각형이 공유하는 정사각 아레나의 네 꼭짓점 (엔진 상수를 하드코딩하지 않고 실제 기하에서 추출)
    const A = z[0].tri[0], B = z[1].tri[0], C = z[2].tri[0], D = z[3].tri[0];
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(120,98,70,0.55)';
    ctx.lineWidth = 3;
    ctx.strokeRect(A.x, A.y, B.x - A.x, D.y - A.y);
    ctx.strokeStyle = 'rgba(230,196,120,0.30)';
    ctx.lineWidth = 1;
    ctx.strokeRect(A.x + 4, A.y + 4, (B.x - A.x) - 8, (D.y - A.y) - 8);
    // 네 모서리 다이아몬드 장식
    ctx.fillStyle = 'rgba(230,196,120,0.55)';
    for (const p of [A, B, C, D]) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
    }
    ctx.restore();
  }

  // 구역별 마법진 룬: 비어있으면 은은한 돌 링, 직업이 배치되면 그 직업 색으로 점등 + 회전 점선 + 숨쉬는 펄스.
  // 드래그로 구역을 맞바꾸면 색이 즉시 갱신되고, 변경된 순간엔 잠깐 링이 확 번지는 플레어를 더한다.
  private drawZoneRunes(dt: number): void {
    const ctx = this.ctx;
    this.game.zones.forEach((zone, i) => {
      if (this.zonePrevJob[i] !== zone.job) {
        this.zonePrevJob[i] = zone.job;
        this.zoneFlare[i] = 1;
      }
      if (this.zoneFlare[i] > 0) this.zoneFlare[i] = Math.max(0, this.zoneFlare[i] - dt / 0.5);

      const cx = zone.cx, cy = zone.cy;
      const breathe = 0.5 + 0.5 * Math.sin(this.t * (zone.job ? 1.2 : 0.5));
      ctx.save();

      if (!zone.job) {
        // 빈 구역: 은은하게 숨쉬는 돌 링
        ctx.strokeStyle = `rgba(150,138,120,${0.18 + breathe * 0.14})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI * 2); ctx.stroke();
      } else {
        const tint = JOB_TINT[zone.job];
        // 은은한 지면 글로우
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 30);
        glow.addColorStop(0, this.hexA(tint, 0.16 + breathe * 0.08));
        glow.addColorStop(1, this.hexA(tint, 0));
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(cx, cy, 30, 0, Math.PI * 2); ctx.fill();
        // 메인 링
        ctx.strokeStyle = this.hexA(tint, 0.55 + breathe * 0.2);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, 21, 0, Math.PI * 2); ctx.stroke();
        // 회전하는 점선 링 (드래그 강조와 동일한 기법 재사용)
        ctx.setLineDash([5, 5]);
        ctx.lineDashOffset = -this.t * 22;
        ctx.strokeStyle = this.hexA(tint, 0.5);
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cx, cy, 27, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }

      // 구역 교환 직후: 확장하며 사라지는 플레어 링
      if (this.zoneFlare[i] > 0) {
        const p = 1 - this.zoneFlare[i];
        const tint = zone.job ? JOB_TINT[zone.job] : '#ffffff';
        ctx.strokeStyle = this.hexA(tint, this.zoneFlare[i] * 0.8);
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, 20 + p * 24, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    });
  }

  // 캔버스 네 모서리를 살짝 어둡게 눌러 시선을 전장 중심으로 모은다 (아주 은은하게).
  private drawVignette(): void {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(MAP.size / 2, MAP.size / 2, MAP.size * 0.42, MAP.size / 2, MAP.size / 2, MAP.size * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, MAP.size, MAP.size);
    ctx.restore();
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
        ctx.strokeStyle = 'rgba(90,68,42,0.4)';
        ctx.lineWidth = 2.5;
      }
      ctx.stroke();
      if (!isFrom && !isTo && !drag) {
        // 은은한 밝은 하이라이트 선을 살짝 어긋나게 겹쳐 그어 돌바닥에 새겨진 듯한 입체감을 준다.
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(255,235,190,0.12)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
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

  // 스프라이트 발밑에 깔리는 타원 그림자 - 바닥에 떠 보이지 않도록 무게감을 준다.
  private drawShadow(x: number, y: number, s: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.4, s * 0.36, s * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 모서리가 둥근 사각형 경로 (구형 브라우저 호환용으로 ctx.roundRect 대신 수동 구현)
  private roundedRectPath(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 체력바: 어두운 배경 + 테두리 + 둥근 모서리 + 위쪽 하이라이트로 입체감을 준다.
  private drawHpBar(cx: number, top: number, w: number, ratio: number, fillColor: string): void {
    const ctx = this.ctx;
    const h = 5, r = 2.5;
    ctx.save();
    this.roundedRectPath(cx - w / 2 - 1, top - 1, w + 2, h + 2, r + 1);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fill();
    this.roundedRectPath(cx - w / 2, top, Math.max(h, w * ratio), h, r);
    ctx.save();
    this.roundedRectPath(cx - w / 2, top, w, h, r);
    ctx.clip();
    ctx.fillStyle = fillColor;
    ctx.fillRect(cx - w / 2, top, w * ratio, h);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(cx - w / 2, top, w * ratio, h * 0.45);
    ctx.restore();
    this.roundedRectPath(cx - w / 2, top, w, h, r);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  private drawMobs(): void {
    const ctx = this.ctx;
    for (const m of this.game.mobs) {
      const s = m.size;
      const spr = mobSprite(m.race);
      this.drawShadow(m.x, m.y, s);
      if (spr.ready) {
        const col = m.pause > 0 ? 1 : this.walkCol(m.id * 0.07, 0.16); // 코너 정지 시 대기 프레임
        if (m.hitFlash > 0) { ctx.save(); ctx.globalAlpha = 0.6; }
        this.frame(spr.img, col, m.dir, m.x - s / 2, m.y - s / 2, s);
        if (m.hitFlash > 0) ctx.restore();
      } else {
        ctx.fillStyle = m.boss ? '#b23' : '#357';
        ctx.beginPath(); ctx.arc(m.x, m.y, s / 2, 0, Math.PI * 2); ctx.fill();
      }
      const ratio = Math.max(0, m.hp / m.maxHp);
      this.drawHpBar(m.x, m.y - s / 2 - 9, s, ratio, m.boss ? '#ff5252' : '#7ee87e');
      if (m.boss) {
        ctx.save();
        ctx.font = '900 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(50,0,0,0.85)';
        ctx.fillStyle = '#ffd54f';
        const ty = m.y - s / 2 - 16;
        ctx.strokeText('BOSS', m.x, ty);
        ctx.fillText('BOSS', m.x, ty);
        ctx.restore();
      }
    }
  }

  private drawUnits(): void {
    const ctx = this.ctx;
    for (const u of this.game.units) {
      const spr = unitSprite(u.job, u.grade);
      const s = 45; // 30 → 1.5배
      this.drawShadow(u.x, u.y, s);
      if (spr.ready) {
        if (u.moveTo) {
          // 구역 교환 등으로 이동 중: 이동 방향 행 + 걷기 사이클 재생
          const col = this.walkCol(u.id * 0.09, 0.14);
          this.frame(spr.img, col, u.dir, u.x - s / 2, u.y - s / 2, s);
        } else {
          // 정지 상태: 마지막 이동/공격 방향을 바라본다. 공격 중일 때만 스윙 프레임 사용.
          const col = u.flash > 0 ? this.attackCol(u.flash) : 1;
          this.frame(spr.img, col, u.dir, u.x - s / 2, u.y - s / 2, s);
        }
      } else {
        ctx.fillStyle = JOB_TINT[u.job];
        ctx.fillRect(u.x - s / 2, u.y - s / 2, s, s);
      }
      // 공격 중임을 알리는 시각 피드백은 스윙 프레임 자체로 충분하므로,
      // 스프라이트 전체를 흰색으로 덮던 깜빡임 오버레이는 제거함(공격마다 반짝여 보이는 원인).
    }
  }

  private drawEffects(): void {
    const ctx = this.ctx;
    for (const e of this.game.effects) {
      if (e.type === 'shot') {
        // 유닛 불릿: All_Fire_Bullet 시트의 발사체가 유닛→타겟으로 날아감
        const bullets = uiSprite('bullets');
        const p = 1 - Math.max(0, e.ttl) / 0.15; // 0→1 진행
        const bx = e.x1 + (e.x2 - e.x1) * p;
        const by = e.y1 + (e.y2 - e.y1) * p;
        if (bullets.ready) {
          const src = BULLET_SRC[e.job][e.gradeIndex] ?? BULLET_SRC[e.job][0];
          const angle = Math.atan2(e.y2 - e.y1, e.x2 - e.x1);
          const bs = bulletSize(e.gradeIndex);
          ctx.save();
          ctx.translate(bx, by);
          ctx.rotate(angle);
          ctx.drawImage(bullets.img, src.sx, src.sy, 16, 16, -bs / 2, -bs / 2, bs, bs);
          ctx.restore();
        } else {
          ctx.fillStyle = JOB_TINT[e.job];
          ctx.beginPath(); ctx.arc(bx, by, 4, 0, Math.PI * 2); ctx.fill();
        }
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
