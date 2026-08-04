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

// ---- Tiny Swords 지형 타일 ----
// tiles/terrain.png = Tilemap_Flat 원본(640x256, 64px 셀).
//   잔디 4x4 오토타일 = 열 0~3, 모래 4x4 오토타일 = 열 5~8.
//   각 4x4 안의 배치: 열/행 0~2 가 3x3(모서리·변·중앙), 열 3 은 세로 1칸 폭 변형,
//   행 3 은 가로 1칸 높이 변형, (3,3) 은 단독 타일.
const TILE = 45; // 720 / 16
const SRC = 64;  // 원본 타일 한 칸 크기
const GRASS_COL0 = 0; // 잔디 블록 시작 열 (모래 블록은 dirtpath.png 로 따로 톤 변환해 사용)
const PATH_INSET = 70;                // 경로 중심선 여백 (PATH.corners 와 동일)
const BAND_HALF = 30;                 // 길 밴드 반폭

// 3x3 오토타일에서 이웃 유무(위/아래/좌/우)에 따라 쓸 셀의 (col,row) 오프셋을 고른다.
// 이웃이 있으면 그쪽은 "안쪽"이므로 가운데(1)를, 없으면 가장자리(0 또는 2)를 쓴다.
function autoTile(up: boolean, down: boolean, left: boolean, right: boolean): { cx: number; cy: number } {
  const cx = left && right ? 1 : left ? 2 : right ? 0 : 3; // 양쪽 다 없으면 세로 변형 열(3)
  const cy = up && down ? 1 : up ? 2 : down ? 0 : 3;       // 위아래 다 없으면 가로 변형 행(3)
  return { cx, cy };
}

// 장식 스프라이트(덤불/돌) - tiles/deco.png 가로 시트, 64px 셀 6개
const DECO_COUNT = 6;

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

  // 지형: 잔디 벌판 위에 모래 길(몹 이동 링)을 얹는다.
  // 모래는 4x4 오토타일이라 이웃한 모래 방향을 보고 가장자리 셀을 골라, 길 경계가 잔디와
  // 자연스럽게 마감된다.
  // (바다 테두리는 넣지 않는다: 경로 바깥 여백이 40px 뿐이라 타일 한 칸(45px)도 안 들어가고,
  //  넣으려면 경로를 안쪽으로 옮겨야 하는데 그건 몹 이동 거리 = 밸런스를 바꾼다.)
  private drawTiles(): void {
    const ctx = this.ctx;
    const terrain = tileSprite('terrain');
    const n = Math.ceil(MAP.size / TILE);
    const o1 = PATH_INSET - BAND_HALF;   // 길 바깥 경계
    const i1 = PATH_INSET + BAND_HALF;   // 길 안쪽 경계
    const oFar = MAP.size - o1, iFar = MAP.size - i1;

    const isPath = (gx: number, gy: number) => {
      const cx = gx * TILE + TILE / 2, cy = gy * TILE + TILE / 2;
      const inOuter = cx >= o1 && cx <= oFar && cy >= o1 && cy <= oFar;
      const inInner = cx > i1 && cx < iFar && cy > i1 && cy < iFar;
      return inOuter && !inInner;
    };

    // 1) 잔디 벌판: 안쪽 채움 타일만 반복 (가장자리 처리 불필요)
    for (let gy = 0; gy < n; gy++) {
      for (let gx = 0; gx < n; gx++) {
        if (terrain.ready) {
          ctx.drawImage(terrain.img, (GRASS_COL0 + 1) * SRC, 1 * SRC, SRC, SRC,
            gx * TILE, gy * TILE, TILE, TILE);
        } else {
          ctx.fillStyle = '#8bb04a';
          ctx.fillRect(gx * TILE, gy * TILE, TILE, TILE);
        }
      }
    }

    // 2) 흙길: 오토타일로 가장자리를 골라 그린다.
    //    dirtpath.png 는 Tiny Swords 모래 4x4 블록을 갈색으로 톤 변환한 별도 시트(자체 4x4).
    const dirt = tileSprite('dirtpath');
    for (let gy = 0; gy < n; gy++) {
      for (let gx = 0; gx < n; gx++) {
        if (!isPath(gx, gy)) continue;
        if (!dirt.ready) {
          ctx.fillStyle = '#a9843f';
          ctx.fillRect(gx * TILE, gy * TILE, TILE, TILE);
          continue;
        }
        const { cx, cy } = autoTile(
          isPath(gx, gy - 1), isPath(gx, gy + 1),
          isPath(gx - 1, gy), isPath(gx + 1, gy),
        );
        ctx.drawImage(dirt.img, cx * SRC, cy * SRC, SRC, SRC,
          gx * TILE, gy * TILE, TILE, TILE);
      }
    }

    // 3) 길 바깥 잔디 테두리에만 덤불/돌을 고정 해시로 흩뿌린다.
    //    (길 안쪽은 유닛 배치 구역이라 비워둔다)
    const deco = tileSprite('deco');
    if (deco.ready) {
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
  }

  // 배치 구역의 네 모서리에만 작은 돌 표식을 찍어 전장 범위를 알린다.
  // (예전엔 사각형 외곽선을 통째로 그렸는데, 얇은 선이 맵 위에 떠 있어 디버그 오버레이처럼
  //  보였다. 범위는 모서리 표식과 구역 룬만으로 충분히 읽힌다.)
  private drawArenaFrame(): void {
    const z = this.game.zones;
    if (z.length < 4) return;
    const corners = [z[0].tri[0], z[1].tri[0], z[2].tri[0], z[3].tri[0]];
    const ctx = this.ctx;
    ctx.save();
    for (const p of corners) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 3, 7, 3.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8d8b84';
      ctx.beginPath(); ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#b9b7ae';
      ctx.beginPath(); ctx.arc(p.x - 1.2, p.y - 1.4, 3.2, 0, Math.PI * 2); ctx.fill();
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
      // 구역 경계선은 드래그(구역 교환) 중에만 그린다.
      // 평소에도 삼각형 3변을 다 그으면 맵 한가운데에 커다란 X 자가 늘 떠 있어
      // 디버그 와이어프레임처럼 보인다. 배치 상태는 구역별 룬(drawZoneRunes)이 이미 알려준다.
      if (isFrom || isTo) {
        ctx.setLineDash([10, 6]);
        ctx.lineDashOffset = -this.t * 40; // 개미행렬 점선
        ctx.strokeStyle = isTo ? '#ffcf3f' : 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 4;
        ctx.stroke();
      } else if (drag) {
        // 드래그 중에는 나머지 구역도 후보로 보이도록 아주 옅게만
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1.5;
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

  // 2-패스로 그린다: ① 그림자+스프라이트를 몹 전부 먼저, ② HP바+보스 라벨을 몹 전부 나중에.
  // 한 몹씩 [스프라이트→HP바]를 통째로 그리면, 붙어서 이동하는 뒤 몹의 몸통이 앞 몹의 HP바를
  // 덮어버리는 문제가 있어(그리기 순서=배열 순서일 뿐 화면상 앞뒤와 무관), HP바 레이어를 통째로
  // 스프라이트 레이어 위로 분리해 항상 모든 몹 몸통보다 위(레이어 순서 상 위)에 오도록 한다.
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
    }
    for (const m of this.game.mobs) {
      const s = m.size;
      const ratio = Math.max(0, m.hp / m.maxHp);
      this.drawHpBar(m.x, m.y - s / 2 - 16, s, ratio, m.boss ? '#ff5252' : '#7ee87e');
      if (m.boss) {
        ctx.save();
        ctx.font = '900 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(50,0,0,0.85)';
        ctx.fillStyle = '#ffd54f';
        const ty = m.y - s / 2 - 23;
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
