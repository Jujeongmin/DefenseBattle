// ============================================================
//  다국어(i18n) - 기본 영어(en), 한국어(ko) 지원
//  - Node(시뮬)에서도 안전하도록 localStorage 접근을 가드한다.
//  - 언어 변경은 페이지 리로드로 반영(패널들은 열릴 때 새 언어로 재렌더).
// ============================================================
import type { Job, Race, GradeKey } from './types';

export type Lang = 'en' | 'ko';
const LANG_KEY = 'randomdefense.lang.v1';

function readLang(): Lang {
  try {
    if (typeof localStorage !== 'undefined') {
      const v = localStorage.getItem(LANG_KEY);
      if (v === 'en' || v === 'ko') return v;
    }
  } catch { /* ignore */ }
  return 'en'; // 기본값: 영어
}

let lang: Lang = readLang();
export function getLang(): Lang { return lang; }
export function setLang(l: Lang): void {
  lang = l;
  try { localStorage.setItem(LANG_KEY, l); } catch { /* ignore */ }
}

// ---------- 직업 / 종족 / 등급 이름 ----------
const JOB_NAME: Record<Lang, Record<Job, string>> = {
  en: { archer: 'Archer', wizard: 'Mage', warrior: 'Warrior' },
  ko: { archer: '궁수', wizard: '마법사', warrior: '전사' },
};
const RACE_NAME: Record<Lang, Record<Race, string>> = {
  en: { troll: 'Troll', orc: 'Orc', undead: 'Undead' },
  ko: { troll: '트롤', orc: '오크', undead: '언데드' },
};
const GRADE_NAME: Record<Lang, Record<GradeKey, string>> = {
  en: { common: 'Common', rare: 'Rare', elite: 'Elite', legendary: 'Legendary', mythic: 'Mythic', eternal: 'Eternal' },
  ko: { common: '일반', rare: '고급', elite: '정예', legendary: '전설', mythic: '신화', eternal: '태초' },
};
export function jobName(j: Job): string { return JOB_NAME[lang][j]; }
export function raceName(r: Race): string { return RACE_NAME[lang][r]; }
export function gradeName(g: GradeKey): string { return GRADE_NAME[lang][g]; }

// ---------- 일반 UI 문자열 ----------
type Params = Record<string, string | number>;
const STRINGS: Record<string, Record<Lang, string>> = {
  // 공통
  'common.close':    { en: 'Close', ko: '닫기' },
  'common.confirm':  { en: 'Confirm', ko: '확인' },
  'common.cancel':   { en: 'Cancel', ko: '취소' },
  'common.continue': { en: 'Continue', ko: '계속하기' },
  'common.leave':    { en: 'Leave', ko: '나가기' },
  'common.max':      { en: 'MAX', ko: 'MAX' },

  // 메인 화면 / 상단바 / 하단
  'app.title':       { en: 'Random Defense', ko: '랜덤 디펜스' },
  'menu.start':      { en: 'Start Game', ko: '게임 시작' },
  'menu.shop':       { en: 'Shop', ko: '상점' },
  'menu.lab':        { en: 'Lab', ko: '연구소' },
  'menu.rank':       { en: 'Rankings', ko: '랭킹' },
  'menu.reset':      { en: 'Reset Progress', ko: '데이터 초기화' },
  'menu.recordPre':  { en: 'Best:', ko: '최고 기록:' },
  'menu.recordSuf':  { en: 'waves', ko: '웨이브' },
  'hud.wave':        { en: 'Wave {n}', ko: '웨이브 {n}' },
  'hud.summon':      { en: 'Summon', ko: '소환' },
  'hud.sell':        { en: 'Sell', ko: '판매' },
  'hud.home':        { en: 'Home', ko: '메인' },
  'hud.probInfo':    { en: 'Odds ⓘ', ko: '확률 정보 ⓘ' },
  'hud.upgrade':     { en: 'Upgrade', ko: '강화' },
  'hud.nextWave':    { en: 'Next wave {s}s', ko: '다음 웨이브 {s}s' },

  // 소환 로그 / 배너 (엔진)
  'log.summon':      { en: '{rate}% {job} {grade} summoned', ko: '{rate}% {job} {grade}등급 소환' },
  'banner.mythic':   { en: '✨ {grade} {job} Summoned! ✨', ko: '✨ {job} {grade} 등급 소환! ✨' },

  // 게임 오버
  'over.clear':      { en: 'Clear!', ko: '클리어!' },
  'over.gameover':   { en: 'Game Over', ko: '게임 오버' },
  'over.reward':     { en: 'Crystals earned', ko: '획득 크리스탈' },
  'over.owned':      { en: 'Owned', ko: '보유' },
  'over.toMain':     { en: 'To Main', ko: '메인으로' },
  'over.mobLimit':   { en: 'Too many monsters on the map', ko: '몹이 100마리를 넘었습니다' },
  'over.bossTimeout':{ en: 'Boss time limit exceeded', ko: '보스 제한시간 초과' },
  'over.clear50':    { en: 'Cleared all 50 waves!', ko: '50 웨이브 클리어!' },

  // 나가기 확인
  'exit.title':      { en: 'Return to the main menu?', ko: '메인으로 나갈까요?' },
  'exit.body':       { en: "Leaving now discards this run's progress (Wave {n}).", ko: '지금 나가면 이번 판(Wave {n}) 진행 상황이 저장되지 않고 사라집니다.' },

  // 판매 패널
  'sell.title':      { en: 'Sell Units', ko: '영웅 판매' },
  'sell.hint':       { en: 'Choose how many to sell at once.', ko: '한 번에 판매할 개수를 선택할 수 있어요' },
  'sell.all':        { en: 'ALL', ko: 'ALL' },

  // 업적 토스트
  'toast.achievement': { en: 'Achievement: {name} (+{n}💎)', ko: '업적 달성: {name} (+{n}💎)' },

  // 연구소 (유닛 강화 / 퀘스트)
  'lab.title':       { en: 'Lab', ko: '연구소' },
  'lab.tabUnits':    { en: 'Units', ko: '유닛 강화' },
  'lab.tabQuest':    { en: 'Quests', ko: '퀘스트' },
  'lab.hint':        { en: 'Spend collected units to star them up for a permanent in-battle boost.', ko: '뽑은 유닛을 소모해 스타업하면 해당 유닛이 게임 내에서 영구 강화됩니다.' },
  'lab.atkBonus':    { en: 'ATK +{n}%', ko: '공격 +{n}%' },
  'lab.owned':       { en: 'Owned {have} / {need}', ko: '보유 {have} / {need}' },
  'lab.ownedMax':    { en: 'Owned {have}', ko: '보유 {have}' },
  'lab.starUp':      { en: 'Star Up', ko: '스타업' },

  // 퀘스트
  'quest.daily':     { en: 'Daily Quests', ko: '일일 퀘스트' },
  'quest.achievements': { en: 'Achievements', ko: '업적' },
  'quest.done':      { en: 'Done', ko: '완료' },
  'quest.inProgress':{ en: 'In progress', ko: '진행중' },
  'quest.rewardPre': { en: 'Reward', ko: '보상' },
  'quest.unlocked':  { en: 'Done ✓', ko: '달성 ✓' },
  'quest.locked':    { en: 'Locked', ko: '미달성' },

  // 퀘스트/업적 이름 (config 의 key 로 조회)
  'q.summon30':      { en: 'Summon 30 units', ko: '유닛 30회 소환' },
  'q.kill200':       { en: 'Kill 200 monsters', ko: '몬스터 200마리 처치' },
  'q.wave20':        { en: 'Reach wave 20', ko: '20웨이브 도달' },
  'q.sell20':        { en: 'Sell 20 units', ko: '유닛 20회 판매' },
  'a.firstLegendary':{ en: 'Get your first Legendary', ko: '전설 유닛 최초 획득' },
  'a.firstMythic':   { en: 'Get your first Mythic', ko: '신화 유닛 최초 획득' },
  'a.firstEternal':  { en: 'Get your first Eternal', ko: '태초 유닛 최초 획득' },
  'a.clear10':       { en: 'Clear wave 10', ko: '10웨이브 클리어' },
  'a.clear20':       { en: 'Clear wave 20', ko: '20웨이브 클리어' },
  'a.clear30':       { en: 'Clear wave 30', ko: '30웨이브 클리어' },
  'a.clear40':       { en: 'Clear wave 40', ko: '40웨이브 클리어' },
  'a.clear50':       { en: 'Clear wave 50', ko: '50웨이브 클리어' },

  // 상점
  'shop.title':      { en: 'Shop', ko: '상점' },
  'shop.gachaTitle': { en: 'Unit Gacha', ko: '유닛 가챠' },
  'shop.gachaDesc':  { en: 'Get random job × grade units!<br>Star them up in the Lab for permanent power.', ko: '랜덤 직업×등급 유닛 획득!<br>연구소에서 스타업 → 영구 강화' },
  'shop.pityHint':   { en: '{rem} more pull(s) → guaranteed Mythic+ (Mythic 80% / Eternal 20%)', ko: '{rem}번 더 뽑으면 신화 이상 확정 (신화 80% / 태초 20%)' },
  'shop.pityReady':  { en: 'Next pull is a guaranteed Mythic+! (Mythic 80% / Eternal 20%)', ko: '다음 뽑기는 신화 이상 확정! (신화 80% / 태초 20%)' },
  'shop.pull1':      { en: '1 Pull', ko: '1회 뽑기' },
  'shop.pull10':     { en: '10 Pull', ko: '10연 뽑기' },
  'shop.buyGems':    { en: 'Buy Gems', ko: '보석 구매' },
  'shop.gemPack':    { en: '{n} Gems', ko: '보석 {n}개' },
  'shop.packages':   { en: 'Packages', ko: '패키지' },
  'shop.adTitle':    { en: 'Ad Removal Pack', ko: '광고 제거 패키지' },
  'shop.adDesc':     { en: 'Remove ads + unlock 3x speed · VX {n}', ko: '광고 제거 + 3배속 해금 · VX {n}' },
  'shop.owned':      { en: 'Owned ✓', ko: '보유 중 ✓' },
  'shop.vxNote':     { en: '* Tapping a VX price opens Verse8’s secure payment window. If you don’t have enough VX, you can top up there.', ko: '* VX 가격 버튼을 누르면 Verse8 결제창이 열립니다. VX가 부족하면 결제창에서 바로 충전할 수 있어요.' },

  'shop.purchaseSuccess': { en: 'Purchase Successful!', ko: '구매 성공!' },

  // 가챠 결과
  'gacha.got':       { en: 'Units acquired!', ko: '유닛 획득!' },

  // 확률 정보
  'prob.titleGacha': { en: 'Odds (Unit Gacha)', ko: '확률 정보 (유닛 가챠)' },
  'prob.titleSummon':{ en: 'Odds (In-Game Summon)', ko: '확률 정보 (게임 내 소환)' },
  'prob.introGacha': { en: 'On a unit gacha pull, grade and job are each rolled independently at the rates below. Multiply a grade odds by a job odds for the chance of one specific unit (e.g. Archer + Legendary).', ko: '유닛 가챠 시 아래 확률로 등급과 직업이 각각 독립적으로 결정됩니다. 등급과 직업 확률을 곱하면 특정 유닛(예: 궁수+전설) 1종이 나올 확률입니다.' },
  'prob.introSummon':{ en: 'On summon, grade and job are each rolled independently at the rates below. Multiply a grade odds by a job odds for the chance of one specific unit.', ko: '유닛 소환 시 아래 확률로 등급과 직업이 각각 독립적으로 결정됩니다. 등급과 직업 확률을 곱하면 특정 유닛이 나올 확률입니다.' },
  'prob.gradeHeader':{ en: 'Grade odds', ko: '등급 확률' },
  'prob.jobHeader':  { en: 'Job odds (equal)', ko: '직업 확률 (균등)' },
  'prob.footerGacha':{ en: '* If no Mythic+ appears for {pity} pulls, the next pull is a guaranteed Mythic+ ({cur}/{pity} now, {rem} left).<br>* A guaranteed Mythic+ splits Mythic : Eternal = 4 : 1 (Mythic 80% / Eternal 20%).<br>* Real payment (VX) is used only to buy gems and does not directly affect pull odds.', ko: '* 신화 이상이 {pity}회 연속 나오지 않으면 다음 뽑기에서 신화 이상이 확정됩니다. (현재 {cur}/{pity}회, {rem}회 남음)<br>* 신화 이상 확정 시 신화 : 태초 = 4 : 1 (신화 80% / 태초 20%)로 결정됩니다.<br>* 실제 결제(VX)는 보석 구매에만 사용되며 뽑기 확률에 직접 영향을 주지 않습니다.' },
  'prob.footerSummon':{ en: '* In-game 20-gold summon rolls grade at the rates above with no pity/guarantee.', ko: '* 게임 내 20골드 소환은 위 확률로 등급이 결정되며, 별도의 보장(천장)은 없습니다.' },

  // 설정
  'set.title':       { en: 'Settings', ko: '설정' },
  'set.language':    { en: 'Language', ko: '언어' },
  'set.muteAll':     { en: 'Mute all', ko: '전체 음소거' },
  'set.muteOn':      { en: '🔇 On', ko: '🔇 켜짐' },
  'set.muteOff':     { en: '🔊 Off', ko: '🔊 꺼짐' },
  'set.bgm':         { en: 'Music', ko: '배경음악' },
  'set.sfx':         { en: '🔊 SFX', ko: '🔊 효과음' },
  'set.dataSection': { en: 'Data', ko: '데이터' },
  'set.reset':       { en: 'Reset progress', ko: '진행 데이터 초기화' },
  'set.resetDesc':   { en: 'Delete gems, collection, achievements, records', ko: '보석·컬렉션·업적·기록 삭제' },
  'set.resetBtn':    { en: 'Reset', ko: '초기화' },
  'set.resetTitle':  { en: 'Really reset?', ko: '정말 초기화할까요?' },
  'set.resetBody':   { en: 'All progress (gems, collection, achievements, best record) will be permanently deleted and cannot be undone.', ko: '보석·컬렉션·업적·최고 기록 등 모든 진행 데이터가 영구히 삭제되며 되돌릴 수 없습니다.' },
  'set.tutorial':    { en: 'Replay tutorial', ko: '튜토리얼 다시보기' },
  'set.tutorialDesc':{ en: 'Show the beginner guide on your next game', ko: '다음 게임 시작 시 초보 가이드 표시' },
  'set.tutorialBtn': { en: 'Replay', ko: '다시보기' },
  'set.tutorialDone':{ en: 'On next game ✓', ko: '다음 게임에 표시 ✓' },

  // 튜토리얼 / 온보딩
  'tut.skip':        { en: 'Skip', ko: '건너뛰기' },
  'tut.next':        { en: 'Next', ko: '다음' },
  'tut.start':       { en: "Let's go!", ko: '시작하기!' },
  'tut.summonTitle': { en: 'Recruit units', ko: '유닛 소환' },
  'tut.summon':      { en: 'Hold the Summon button to recruit random units. Each summon costs {cost} gold. Try it now! 👇', ko: '소환 버튼을 길게 눌러 랜덤 유닛을 뽑으세요. 한 번에 {cost} 골드가 듭니다. 지금 눌러보세요! 👇' },
  'tut.stacksTitle': { en: 'Job & matchup', ko: '직업과 상성' },
  'tut.stacks':      { en: 'Units are grouped by job (Mage/Archer/Warrior). The % is their damage vs THIS wave\'s enemy — 🟢 green is strong, 🔴 red is weak. Stack up your strong jobs!', ko: '유닛은 직업(마법사/궁수/전사)별로 묶입니다. %는 이번 웨이브 적에 대한 피해량이에요 — 🟢 초록은 강함, 🔴 빨강은 약함. 강한 직업을 많이 모으세요!' },
  'tut.raceTitle':   { en: 'Watch the enemy', ko: '적 종족 확인' },
  'tut.race':        { en: 'The enemy race changes each wave (Troll/Orc/Undead). Check here and rely on the job that counters it.', ko: '적 종족은 웨이브마다 바뀝니다(트롤/오크/언데드). 여기서 확인하고 상성이 좋은 직업을 활용하세요.' },
  'tut.goldTitle':   { en: 'Earn gold', ko: '골드 획득' },
  'tut.gold':        { en: 'Defeated enemies drop gold — spend it to summon, upgrade, or sell. Survive all 50 waves. Good luck! ⚔️', ko: '적을 처치하면 골드를 얻습니다 — 소환·강화·판매에 쓰세요. 50웨이브까지 살아남으세요. 행운을 빕니다! ⚔️' },

  // 상점 보상형 광고
  'shop.adSection':  { en: 'Rewarded Ad', ko: '보상형 광고' },
  'shop.adCooldownBtn': { en: 'Available again in {time}', ko: '{time} 후 다시 시청 가능' },
  'shop.adFreeBtn':  { en: 'Claim free', ko: '광고 없이 받기' },
  'shop.adWatchBtn': { en: '📺 Watch ad to claim', ko: '📺 광고 시청하고 받기' },
  'shop.adRemovedInfo': { en: 'Ad-free: get free gems once every 30 minutes, no ad needed!', ko: '광고제거 상태: 30분마다 한 번, 광고 없이 무료 보석을 받으세요!' },
  'shop.adInfo':     { en: 'Watch an ad once every 30 minutes for free gems.', ko: '30분마다 한 번, 광고를 보고 무료 보석을 받으세요!' },
  'shop.adGranted':  { en: '✅ Reward claimed! (+{n} gems)', ko: '✅ 보상 지급 완료! (보석 +{n})' },
  'shop.adLoading':  { en: '⏳ Loading ad...', ko: '⏳ 광고 불러오는 중...' },
  'shop.adDismissed':{ en: '⚠️ Watch the full ad to get the reward.', ko: '⚠️ 광고를 끝까지 봐야 보상이 지급됩니다.' },
  'shop.adNoFill':   { en: '⚠️ No ad available right now. Please try again later.', ko: '⚠️ 지금은 볼 수 있는 광고가 없어요. 잠시 후 다시 시도해 주세요.' },
  'shop.adUnsupported': { en: 'ℹ️ Ads are not available in this environment.', ko: 'ℹ️ 이 환경에서는 광고를 볼 수 없습니다.' },
  'shop.minSec':     { en: '{m}m {s}s', ko: '{m}분 {s}초' },

  // 게임오버 - 2배 보상 광고
  'over.doubleAdTitle': { en: '📺 Watch ad for 2x reward', ko: '📺 광고 시청하고 2배 보상' },
  'over.doubleAdDesc':  { en: 'Watch an ad to get 2x gems ({n})!', ko: '광고를 보면 보석을 2배 ({n}개) 받을 수 있어요!' },
  'over.doubleBtn':     { en: '📺 Get 2x', ko: '📺 2배 받기' },
  'over.skipBtn':       { en: 'Take as-is', ko: '그냥 받기' },
  'over.adRemovedAutoDouble': { en: '✅ Ad-free bonus: 2x gems granted automatically!', ko: '✅ 광고제거 혜택: 2배 보석 자동 지급!' },
  'over.adLoading':     { en: 'Loading ad...', ko: '광고 로딩 중...' },
  'over.doubleGranted': { en: '✅ 2x reward granted! (+{n} gems)', ko: '✅ 2배 보상 지급 완료! (+{n} 보석)' },
  'over.adIncomplete':  { en: '⚠️ Watch the full ad to get the 2x reward.', ko: '⚠️ 광고를 끝까지 시청해야 2배 보상이 지급됩니다.' },
  'over.adLoadFailed':  { en: '⚠️ Failed to load ad. Please try again.', ko: '⚠️ 광고 로딩 실패. 다시 시도해 주세요.' },
  'over.baseGranted':   { en: '✅ Base reward granted (+{n} gems)', ko: '✅ 기본 보상 지급 완료 (+{n} 보석)' },

  // 게임오버 - 랭킹 등록
  'over.rankTitle':     { en: 'Live Rankings', ko: '실시간 랭킹 등록' },
  'over.rankDesc':      { en: "Submit this run's record (Wave {n}) to the leaderboard!", ko: '이번 판 기록({n}웨이브)을 랭킹에 올리세요!' },
  'over.rankSubmitBtn': { en: 'Submit', ko: '기록 등록' },
  'over.rankRegistering': { en: 'Submitting to server...', ko: '서버에 등록하는 중...' },
  'over.rankSubmitFailed': { en: '❌ Submit failed: {msg}', ko: '❌ 등록 실패: {msg}' },
  'over.networkError':   { en: 'Network error', ko: '네트워크 오류' },
  // 랭킹 등록 결과 (서버는 구조값만 반환, 문구는 여기서 조립)
  'rank.resFirst':       { en: '✅ First record registered! (Wave {n})', ko: '✅ 첫 기록 등록 완료! ({n}웨이브)' },
  'rank.resNewBest':     { en: '✅ New best record! (previous: Wave {prev})', ko: '✅ 새로운 최고 기록 달성! (이전 기록: {prev}웨이브)' },
  'rank.resNotBeaten':   { en: 'ℹ️ You already have a higher record. (Wave {n})', ko: 'ℹ️ 이미 더 높은 최고 기록이 있습니다. ({n}웨이브)' },

  // 랭킹 패널
  'rank.title':         { en: 'Live Rankings', ko: '실시간 랭킹' },
  'rank.loading':        { en: 'Loading rankings...', ko: '랭킹 데이터를 불러오는 중...' },
  'rank.connectError':   { en: '❌ Failed to connect to the server.', ko: '❌ 서버 연결에 실패했습니다.' },
  'rank.checkNetwork':   { en: 'Please check your network connection.', ko: '네트워크 상태를 확인해 주세요.' },
  'rank.noRecords':      { en: 'No rankings registered yet.', ko: '등록된 랭킹 기록이 없습니다.' },
  'rank.myBest':         { en: 'My Best', ko: '내 최고 기록 (My Best)' },
  'rank.notRegistered':  { en: 'Not on the leaderboard yet.<br/>Register your best record (<b>Wave {n}</b>) below!', ko: '아직 랭킹에 등록되지 않았습니다.<br/>최고 기록(<b>{n}웨이브</b>)을 아래에서 등록해보세요!' },
  'rank.waveSuf':        { en: 'Wave {n}', ko: '{n}웨이브' },
  'rank.nicknameManage': { en: 'Nickname', ko: '닉네임 관리 (Set Nickname)' },
  'rank.maxChars':       { en: 'Max 15 chars', ko: '최대 15자' },
  'rank.changeNickname': { en: 'Change', ko: '닉네임 변경' },
  'rank.nicknameEmpty':  { en: '⚠️ Please enter a nickname.', ko: '⚠️ 닉네임을 입력해 주세요.' },
  'rank.nicknameTooLong':{ en: '⚠️ Nickname must be 15 characters or fewer.', ko: '⚠️ 닉네임은 최대 15자까지 가능합니다.' },
  'rank.saving':         { en: 'Saving...', ko: '변경 완료 처리 중...' },
  'rank.nicknameChangedRegistered': { en: '✅ Nickname changed and best record ({n} waves) registered!', ko: '✅ 닉네임이 변경되고 최고 기록({n}웨이브)이 랭킹에 등록되었습니다!' },
  'rank.deviceNicknameSet': { en: '✅ Device nickname set successfully!', ko: '✅ 기기 닉네임이 성공적으로 설정되었습니다!' },
  'rank.serverTimeout':  { en: 'Server connection timed out', ko: '서버 연결 시간 초과' },
  'rank.serverUnavailable': { en: 'Could not connect to the server', ko: '서버에 연결할 수 없습니다' },
  'rank.registerFailed': { en: '❌ Registration failed: {msg}', ko: '❌ 서버 등록 실패: {msg}' },
  'rank.unknownError':   { en: 'Unknown error', ko: '알 수 없는 오류' },
};

export function t(key: string, params?: Params): string {
  const entry = STRINGS[key];
  let s = entry ? entry[lang] : key;
  if (params) {
    for (const k in params) {
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(params[k]));
    }
  }
  return s;
}
