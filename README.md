# 랜덤 디펜스 (Random Defense)

Verse8(Agent8) 플랫폼 업로드용 타워 디펜스 게임. **TypeScript + Vite** 기반이며, `index.html` 이 `game/` 폴더 안에 위치한다.

## 프로젝트 구조

```
RandomDefense/
├── package.json          # vite/typescript 의존성, dev/build/preview/typecheck 스크립트
├── tsconfig.json         # strict 모드, moduleResolution: bundler
├── vite.config.js        # root: 'game', 빌드 산출물: dist/
├── game/                 # ← Vite 루트 (index.html 위치)
│   ├── index.html        # 진입 HTML (UI 뼈대), <script src="./src/main.ts">
│   ├── public/sprites/   # 유닛·몹 스프라이트 (빌드 시 루트로 복사)
│   └── src/
│       ├── main.ts       # 부팅 & 화면전환(메인↔게임) & 메인 루프
│       ├── menu.ts       # 메인 화면 (게임시작/상점/연구소/퀘스트)
│       ├── types.ts      # 공용 타입 정의 (Job/Race/Unit/Mob/Zone/PlatformAdapter ...)
│       ├── config.ts     # 모든 밸런스/데이터 테이블
│       ├── engine.ts     # 맵·경로·웨이브·전투·경제 로직 (Game 클래스)
│       ├── render.ts     # 캔버스 렌더러 (스프라이트 시트 애니메이션)
│       ├── ui.ts         # 게임 내 DOM UI (소환/강화/판매/드래그)
│       ├── meta.ts       # 크리스탈·연구·퀘스트 상태 (platform 통해 저장)
│       ├── platform.ts   # 저장/상점/계정 추상화 (Verse8 SDK 교체 지점)
│       ├── audio.ts      # WebAudio 효과음/BGM 합성 (에셋 없음)
│       ├── assets.ts     # 스프라이트 로더
│       ├── vite-env.d.ts # Vite 타입 참조 (*.css 등)
│       └── style.css
├── tools/
│   └── simulate.ts       # 헤드리스 밸런스 시뮬레이터 (npx tsx tools/simulate.ts)
└── dist/                 # 빌드 산출물 (npm run build)
```

## 실행

```bash
npm install
npm run dev        # 개발 서버
npm run typecheck  # 타입 검사 (tsc --noEmit)
npm run build      # 타입검사 + 프로덕션 빌드 → dist/
npm run preview    # 빌드 결과 미리보기
```

## 기획서 → 코드 매핑

| 기획 항목 | 구현 위치 |
| --- | --- |
| 1. 직업/상성 데미지 | `config.ts` `DMG_MULT`, `engine.ts` `unitDamage()` |
| 1-2. 등급별 능력치 | `config.ts` `GRADES` |
| 2. 유닛 배치(4 삼각형 존/교환) | `engine.ts` `zones`, `swapZones()`, `ui.ts` 드래그 |
| 3. 등급 확률 소환 | `config.ts` `rollGrade()` |
| 3-1. 등급별 사거리(전설+ 전체) | `config.ts` `GRADE_RANGE`, `engine.ts` `unitRange()` |
| 4. 판매 | `engine.ts` `sellOne()`, `ui.ts` 판매 패널 |
| 5. 강화(**직업 단위** — 모든 등급 공유, +10%/Lv) | `engine.ts` `upgrade(job)`, `getJobStacks()` |
| 6. 전투(가까운 적/처치 골드/100마리 오버) | `engine.ts` `updateCombat()`, `killMob()` |
| 7. 웨이브(50, 40마리, +11% HP, 5초 대기) | `engine.ts` `startNextWave()`, `updateWaveState()` |
| 7-1. 보스 웨이브(2배 크기, 120초) | `engine.ts` 보스 처리, `bossTimer` |
| 8. 골드(시작 100, 소환 20, 처치 2/보스 100) | `config.ts` `ECONOMY`, `engine.ts` |
| 9. 소환 텍스트/신화 전용 연출 | `engine.ts` `pushLog`/`mythicBanner`, `ui.ts` |
| 10. 배속(1/2/3x, 3x=상점 광고제거 해금) | `ui.ts` 배속 버튼(`isAdRemoved`), `menu.ts` 상점 |
| 11. 연구소(5개 항목, **메인 화면**) | `config.ts` `RESEARCH`, `meta.ts`, `menu.ts` |
| 12. 퀘스트(일일/업적, 메인 화면) | `config.ts`, `meta.ts`, `menu.ts` |
| 13. 화면 구성(메인 화면 + 게임 화면) | `index.html`(`#main-menu`/`#game-frame`) + `style.css` |

## 밸런스 (기획서 대비 변경)

기획서 원안(HP +20%/웨이브, 연구 +2%/레벨)은 **몹 체력이 지수 증가**하는데 유닛 파워는
선형이라, 약 25웨이브에서 벽에 막혀 **50웨이브 클리어가 수학적으로 불가능**했다.
헤드리스 시뮬레이터(`tools/simulate.ts`)로 검증 후, "반복 성장(하드코어)" 목표에 맞춰 조정:

| 항목 | 원안 | 변경 | 이유 |
| --- | --- | --- | --- |
| 웨이브당 HP 증가 | +20% | **+11%** | 지수 벽 완화 → 성장 시 클리어 가능 |
| 공격력 연구 | +2%/Lv | **+4%/Lv** | 연구 성장이 후반 벽을 넘게 |
| 골드 획득 연구 | +2%/Lv | **+4%/Lv** | 〃 |
| 시작 골드 연구 | +5/Lv | **+10/Lv** | 〃 |
| 보스 피해 연구 | +2%/Lv | **+4%/Lv** | 〃 |

**결과 곡선(자동플레이 40회 평균 도달 웨이브):** 무연구 16 → 1/4 연구 36 → 절반 45 →
풀연구 50(클리어율 98%). 연구 없이는 못 깨고, 성장할수록 도달이 오르는 하드코어 곡선.

밸런스 재측정: `npx tsx tools/simulate.ts 40` (기본), `... search`(그리드 탐색), `... army`(군대 크기).

## Verse8 연동 준비

저장/상점/계정은 `platform.ts` 의 `PlatformAdapter` 인터페이스로 추상화되어 있다.
현재는 `LocalPlatform`(localStorage, Node 에선 메모리 폴백)만 구현. 추후 Verse8 SDK 로
`Verse8Platform` 을 만들어 `setPlatform(new Verse8Platform(...))` 한 줄로 교체하면 된다.
- `loadMeta()/saveMeta()` — 크리스탈·연구·퀘스트 서버/계정 저장
- `getVX()/spendVX()` — Verse8 플랫폼 재화(VX) 잔액/차감. 상점에서 **VX 로 보석(💎) 구매**
- `isAdRemoved()/purchaseAdRemoval()` — 광고제거 패키지(3배속 해금, VX ${300})
- `accountId()` — 로그인 계정 식별

상점 상품은 `config.ts` `CRYSTAL_PACKAGES`(보석 패키지)·`AD_REMOVE_VX` 로 정의.
로컬에서는 데모용 기본 VX(500)가 주어지며, 실제 VX 충전(결제)은 Verse8 연동 시 활성화된다.

## 참고

- 스프라이트는 96×128(32×32 3열×4행) RPG Maker 형식 시트. 몹은 이동 방향으로 행(하/좌/우/상)을
  고르고 걷기 프레임을 순환, 유닛은 정면 대기+공격 프레임. DOM 아이콘은 CSS `background-position`
  으로 한 프레임만 표시(`.frame-sprite`).
- 맵은 Sprout Lands 타일(잔디 `grass.png`, 흙길 `dirt.png`, 각 16px)로 렌더. 필드=잔디,
  경로 링=흙길 밴드(`render.ts` `drawTiles`). 타일은 `game/public/tiles/`.
- 하단 유닛 카드는 현재 웨이브 몹 대비 **상성 %**(직업×종족)를 표시하고 웨이브마다 갱신한다.
- 판매는 "영웅 판매" 패널: 수량(1/10/ALL) 선택 + 6등급 카드 + 직업 탭(`ui.ts` `openSell`).
- 몹 타격 시 데미지 숫자가 떠오른다(`Effect` `dmg`, 성능상 동시 60개 상한).
- 몬스터는 **좌상에서 시작해 반시계방향**(좌상→좌하→우하→우상)으로 순환하며, 각 코너에서 0.25초 정지한다.
- 연구소·상점·퀘스트는 게임 밖 **메인 화면**에 있다. 게임 중에는 🏠 버튼으로 메인에 돌아간다.
- 유닛은 소환 시 직업별 삼각형 존에 자동 배치되고, 존을 드래그해 서로 교환할 수 있다(전략적 위치 선정).
- 크리스탈/연구/업적은 브라우저 localStorage 에 계정 단위로 영구 저장된다.
- 배속이 없거나 백그라운드 탭에서는 브라우저가 `requestAnimationFrame` 을 멈추므로, 화면이 보일 때만 게임이 진행된다(정상 동작).
