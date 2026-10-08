# 랜덤 디펜스 (Random Defense)

Verse8(Agent8) 플랫폼용 하이브리드 캐주얼 디펜스 게임. **TypeScript + Vite** 클라이언트와
**Agent8 GameServer**(`server/`)로 구성된다. 기획 의도·KPI·퍼블리싱 피치는 [`docs/GDD.md`](docs/GDD.md) 참고.

- 소환 → 합성 → 강화 → 배치로 사각 링을 도는 몹 웨이브를 막는다 (몹 100마리 누적 시 패배)
- **캠페인** 3챕터 × 10스테이지 (별 3개 도전, 첫 클리어 보상, 유닛 해금)
- **유닛 컬렉션** 8종 (기본 3 + 해금 5), 덱 4슬롯, 영구 레벨·퍽
- **PvP 실시간 1:1** (같은 웨이브를 동시에 막으며 몹을 보내 상대를 무너뜨림), 트로피·티어·시즌 패스·랭킹
- **무한 모드** 50웨이브 생존
- **수익화**: Verse8 VX Shop 결제 + Verse8 Ads(보상형/전면)

## 실행

```bash
npm install
npm run dev        # 개발 서버 (DEV 전용 디버그 버튼·가짜 광고 활성)
npm run typecheck  # 타입 검사
npm run build      # 타입검사 + 프로덕션 빌드 → dist/

# 게임 서버 (PvP/클라우드 저장/결제 지급)
cd server && npm install
npm run build && npm test   # gameserver-node 로컬 러너로 테스트 (isolated-vm)

# 밸런스 시뮬레이터
npx tsx tools/simulate.ts 20          # 무한 모드: 연구 진척별 도달 웨이브
npx tsx tools/simulate.ts stages 8    # 캠페인: 스테이지별 클리어율/별 (연구 × 유닛 레벨)
SIM_HPG=0.12 npx tsx tools/simulate.ts 20   # HP 성장률 실험
```

`VITE_AGENT8_VERSE` 가 없으면 **오프라인 모드**: localStorage 저장, 데모 VX(1000)로 결제 흉내,
PvP 는 AI 연습전만 가능. Verse8 프로젝트(.env 에 `VITE_AGENT8_VERSE`)에서는 자동으로
게임서버·VX Shop·Ads 가 활성화된다.

## 프로젝트 구조

```
├── game/                    # Vite 루트 (index.html)
│   ├── public/{sprites,tiles}
│   └── src/
│       ├── main.ts          # 부팅(플랫폼 init → 클라우드 메타 → 미지급 결제 동기화) / 판 흐름 / 루프
│       ├── engine.ts        # 게임 엔진 (웨이브·전투·스킬·합성·PvP 송수신·부활) - DOM 없음
│       ├── config.ts        # 모든 데이터/밸런스 (유닛·스킬·스테이지·상품·시즌패스·PvP)
│       ├── progress.ts      # 캠페인 진행·유닛 해금/레벨·덱·기능 해금
│       ├── shop.ts          # 결제 지급(중복 방지)·월정액·시즌패스 보상
│       ├── ads.ts           # @verse8/ads 보상형/전면 광고
│       ├── pvp.ts           # PvP 세션 (온라인 룸 / AI 봇) 공통 인터페이스
│       ├── ai.ts            # 봇 플레이 정책
│       ├── net/server.ts    # @agent8/gameserver 연결 (GS/RS 호출)
│       ├── platform.ts      # LocalPlatform / Verse8Platform (저장·결제 추상화)
│       ├── menu.ts          # 로비와 모든 메타 패널
│       ├── ui.ts            # 게임 화면 HUD/영웅관리/PvP HUD/결과/튜토리얼
│       ├── render.ts        # 캔버스 렌더러 (투사체·파티클·화면흔들림·보스바)
│       ├── assets.ts        # 스프라이트 로더 + 해금 유닛 색조 변형 시트 생성
│       ├── audio.ts         # Mixkit 효과음(WebAudio 버퍼) + 트랙별 BGM(메뉴/전투/보스/PvP, <audio> 반복)
│       ├── meta.ts / types.ts / dom.ts / style.css
├── server/                  # Agent8 GameServer (server/src/server.ts, test/)
├── tools/simulate.ts        # 헤드리스 밸런스 시뮬레이터
└── docs/GDD.md              # 게임 기획/퍼블리싱 문서
```

## Verse8 연동

### 1) 게임 서버 (`server/`)
`@agent8/gameserver-node` 형식(`export class Server`). 배포 시 Verse8 도구가
`npx -y @agent8/gameserver-node build` → `npx -y @agent8/deploy` 로 올린다.

| 함수 | 설명 |
| --- | --- |
| `loadProfile` / `saveProfile` | 계정 클라우드 저장 (pvp 필드는 서버 권위) |
| `$onItemPurchased(event)` | VX Shop 결제 완료 훅 → `pendingPurchases` 기록 |
| `claimPurchases` | 대기 구매를 가져가고 비움 (클라는 `purchaseId` 로 중복 지급 방지) |
| `pvpQueue` / `pvpPoll` / `pvpCancel` | 트로피 근접 매칭 (대기 시간에 따라 허용 폭 확대) |
| `pvpReady` / `pvpSnap` / `pvpAttack` / `pvpDefeat` | 룸: 동시 시작·상태 중계·몹 보내기·패배 보고 |
| `onRoomLeave` | 경기 중 이탈 → 상대 승리 |
| `pvpLeaderboard` | `pvpRanking` 컬렉션 상위 50 |

### 2) VX Shop 상품 등록
Verse8 VX Shop 에 아래 **productId** 로 상품을 등록해야 한다 (가격은 등록값이 표시에 우선).
가격은 100 VX = 1달러 기준. 상점의 '효율 N%' 는 기본 보석 상품(100 VX = 보석 100) 대비 가치로,
`config.ts` 의 `productEfficiency` 가 등록 가격으로 계산한다. 상품 이미지: `launch/vxshop/{productId}.png` (1:1).

| productId | 내용 | 가격(VX) | 1인 구매 제한 | 효율 |
| --- | --- | --- | --- | --- |
| `starter_pack` | 보석 150 + 소환권 10 + 골드 부스터 1 | 100 | 1 | 300% |
| `monthly_pass` | 즉시 보석 300 + 30일간 매일 보석 40 | 500 | - | 300% |
| `ad_remove` | 전면광고 제거, 보상형 광고 즉시 보상, 3배속, 보석 500 | 500 | 1 | - |
| `season_premium` | 이번 시즌 PvP 패스 프리미엄 트랙 | 1000 | - (시즌당 게임이 막음) | - |
| `summon_ticket_pack` | 소환권 24장 | 200 | - | 120% |
| `mythic_ticket` | 신화 확정 소환권 1장 | 500 | - | 120% |
| `gold_booster_pack` | 골드 부스터 5개 | 200 | - | 125% |
| `crystal_100` / `crystal_550` / `crystal_1200` | 보석 100 / 550 / 1,200 | 100 / 500 / 1000 | - | 100 / 110 / 120% |
| `crystal_2600` / `crystal_7000` / `crystal_15000` | 보석 2,600 / 7,000 / 15,000 | 2000 / 5000 / 10000 | - | 130 / 140 / 150% |

### 3) 광고 플레이스먼트 (`ads.ts` `AD_PLACEMENTS`)
`reward_double`(결과 보상 2배), `reward_revive`(실패 시 1회 부활), `reward_ticket`(하루 3회 소환권 5장),
`interstitial_result`(1-4 이후, 2판마다 1회. 광고 제거 구매자 제외). Verse8 대시보드의 placementId 와 맞춘다.

## v1 프로토타입 빌드 (`config.ts` 의 `V1`)

Voodoo 프로토타입 v1 범위에 맞춘 빌드. `V1 = true` 이면:
- 로비 = 아레나 카드 + **대전 시작** (1-1 튜토리얼 전엔 튜토리얼 버튼만). 하단: 덱 / 트로피 로드 / 랭킹
- **덱**: 유닛 덱(최대 4)과 몹 카드 덱(4장)을 카드를 칸으로 끌어다 놓아 편성 (칸끼리 끌면 교체, 칸 밖으로 끌면 빼기)
- 대전 상대는 온라인이면 8초 매칭 후 봇, 오프라인이면 바로 봇 - 봇은 실제 유저처럼 보이고 트로피가 오르내린다
  (Verse8 에선 `pvpBotStart`/`pvpBotResult` 로 서버가 트로피를 관리)
- **트로피 로드**(`TROPHY_ROAD`): 보석 + 유닛 해금(레인저 30 · 빙결술사 80 · 성기사 140 · 폭격수 200 · 암살자 260)
  + 몹 카드 해금(유령 45 · 방패병 95 · 망령 155 · 어둠 신관 215 · 고블린 킹 290 · 마왕 360)
- 첫 3판은 가장 약한 봇 (처음 대전에서 이기는 경험)

**몹 카드 10종** (`ATTACKS`) - 시작 4장(고블린 무리 · 질주 엘프 · 거인 · 분열 알) + 로드 6장.
카드마다 잘 막는 유닛이 달라(카드 화면 '막는 유닛') 상대 덱을 보고 고른다. 봇도 상대 덱에 카운터가 없는 카드를 고른다.

| 카드 | 골드 | 특징 | 막는 유닛 |
|---|---|---|---|
| 고블린 무리 | 40 | 약한 몹 8마리 | 마법사·폭격수 |
| 질주 엘프 | 50 | 아주 빠른 몹 4마리 | 빙결술사·전사 |
| 거인 | 80 | 느리고 단단함 | 암살자·성기사 |
| 분열 알 | 70 | 죽으면 작은 몹 3마리 | 폭격수·마법사 |
| 유령 | 60 | 물리(전사·궁수·레인저·암살자) 피해 -60% | 마법사·빙결술사 |
| 방패병 | 65 | 화살(궁수·레인저) 피해 -60% | 마법사·폭격수·전사 |
| 망령 | 60 | 한 번 되살아남 | 폭격수·궁수 |
| 어둠 신관 | 90 | 주변 몹 초당 6% 회복 | 암살자·레인저 |
| 고블린 킹 | 120 | 4초마다 졸개 3마리 | 레인저·성기사 |
| 마왕 | 140 | 아주 강함, 쿨타임 15초 | 성기사·암살자 |

카드별 승률은 `npx tsx tools/cardsim.ts [판수] [트로피]` (봇이 카드 한 종만 쓸 때).
- 캠페인은 앞 5스테이지(`CAMPAIGN`)만, 스테이지 클리어로 유닛이 열리지 않음
- 숨김: 상점/VX 결제, 광고, 퀘스트, 시즌 패스, 월정액, 무한 모드, 연구

`V1 = false` 로 두면 전체 기능(캠페인 30스테이지, 상점, 광고 등)이 돌아온다.

**PvP 밸런스 (`npx tsx tools/pvpsim.ts [판수] [플레이어실력]`)** - 플레이어(실력 0.55) 대 봇 시뮬레이션:
한 판 약 3~4분(PvP 시작 체력 x3, 웨이브당 +25%, 봇은 21~38초마다 골드를 모아 던짐), 승률 약 51~56%,
유닛 5종 해금(260 트로피)까지 약 1.2~2.6시간, 몹 카드 마지막(360)까지 약 2~3.5시간 + 튜토리얼/연습 ≈ 핵심 플레이 3시간.

## 밸런스

`tools/simulate.ts` 자동 플레이어로 검증한 곡선 (합성 공격력 등급당 3배, 시작 골드 200, 처치 골드 3, 상성 1.0/0.9):

**무한 모드 (평균 도달 웨이브, 성장률 +17%):** 연구 0 → 38.8 / 1/4 → 45.5 / 절반 → 46.6 / 3/4 → 49.5 / 풀 → 50 (100% 클리어)

**캠페인 (클리어율, 연구 0·유닛 Lv1, 성장률 +11.5%):** 챕터1 100% / 챕터2 약 90~100% / 챕터3 약 65~100%.
연구 1/4 만 해도 전 스테이지 100% - 누구나 깰 수 있게 쉽게 맞춤 (`npx tsx tools/simulate.ts stages 10`).

## 참고

- 스프라이트는 96×128(32×32 3열×4행) RPG Maker 형식, CharaMEL(ぴぽや 32x32 男女 파츠)로 만든 것.
  해금 유닛 5종(레인저/빙결술사/성기사/폭격수/암살자) 30장은 `tools/build_unit_sprites.py` 가 같은 파츠를
  합성해 만든다 (`tools/charamel.py`). CharaMEL 의 `characters/pipoya32x32_男女` 폴더를 `Asset/charamel/` 에 복사해 두고 실행.
- PvP 는 각 클라이언트가 자기 필드를 시뮬레이션하고 서버는 매칭·중계·판정만 담당한다.
  같은 `seed` 로 웨이브 구성(종족·몹 종류)이 양쪽 동일. 배속 1x 고정, 연구 미적용, 유닛 레벨 적용.
- 백그라운드 탭: 일반 모드는 멈추고, PvP 는 타이머 보조로 계속 진행된다.

## 에셋 출처

| 에셋 | 사용처 | 라이선스 |
| --- | --- | --- |
| [Tiny Swords](https://pixelfrog-assets.itch.io/tiny-swords) (Pixel Frog) | 맵 지형·장식(`tiles/`, 구버전 CC0), UI 버튼·종이·나무·리본(`ui/frame/`, Free Pack) | 구버전 CC0 / Free Pack: 상업 이용 가능, 원본 팩 재배포 금지 |
| [Kenney 1-Bit Pack](https://kenney.nl/assets/1-bit-pack) | UI 아이콘(`ui/icons/`, 색 입혀 가공) | CC0 |
| [Galmuri](https://github.com/quiple/galmuri) (Lee Minseo) | 픽셀 폰트(`fonts/`) | SIL OFL 1.1 |
| [ぴぽや Pipoya](https://pipoya.net/) 32x32 파츠 (CharaMEL) | 유닛·몹 캐릭터 시트(`sprites/`) | 상업 이용·수정 가능, 소재 재배포 금지 |
| [Mixkit](https://mixkit.co/) | 효과음(`sfx/`) 16종, BGM(`bgm/`) 4곡 | Mixkit Sound Effects / Stock Music Free License: 상업 이용 가능, 표기 불필요, 원본 단독 재판매 금지 |

원본 팩은 `Asset/`(gitignore)에 두고, 가공본만 `game/public` 에 커밋한다.
음원 음량은 `python tools/normalize_audio.py` (pyloudnorm 필요) 로 맞춘다: 효과음은 모두 같은 체감 음량(100ms 최대 −14 LUFS), BGM 은 곡끼리 같게(−16 LUFS).
가공 스크립트: `python tools/build_ui_assets.py` (Pillow 필요). 팩에 없는 아이콘(별, TV, 티켓 등)은 스크립트 안에 직접 그렸다.
