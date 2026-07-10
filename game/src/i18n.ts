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
  'menu.shop':       { en: '🛒 Shop', ko: '🛒 상점' },
  'menu.lab':        { en: '🔬 Lab', ko: '🔬 연구소' },
  'menu.recordPre':  { en: 'Best:', ko: '최고 기록:' },
  'menu.recordSuf':  { en: 'waves', ko: '웨이브' },
  'hud.wave':        { en: 'Wave {n}', ko: '웨이브 {n}' },
  'hud.summon':      { en: 'Summon', ko: '소환' },
  'hud.sell':        { en: 'Sell', ko: '판매' },
  'hud.home':        { en: 'Home', ko: '메인' },
  'hud.probInfo':    { en: 'Odds ⓘ', ko: '확률 정보 ⓘ' },
  'hud.upgrade':     { en: 'Upgrade', ko: '강화' },

  // 소환 로그 / 배너 (엔진)
  'log.summon':      { en: '{rate}% {job} {grade} summoned', ko: '{rate}% {job} {grade}등급 소환' },
  'banner.mythic':   { en: '✨ {grade} {job} Summoned! ✨', ko: '✨ {job} {grade} 등급 소환! ✨' },

  // 게임 오버
  'over.clear':      { en: '🎉 Clear!', ko: '🎉 클리어!' },
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
  'shop.pull1':      { en: '1 Pull', ko: '1회 뽑기' },
  'shop.pull10':     { en: '10 Pull', ko: '10연 뽑기' },
  'shop.buyGems':    { en: 'Buy Gems', ko: '보석 구매' },
  'shop.gemPack':    { en: '{n} Gems', ko: '보석 {n}개' },
  'shop.packages':   { en: 'Packages', ko: '패키지' },
  'shop.adTitle':    { en: 'Ad Removal Pack', ko: '광고 제거 패키지' },
  'shop.adDesc':     { en: 'Remove ads + unlock 3x speed · VX {n}', ko: '광고 제거 + 3배속 해금 · VX {n}' },
  'shop.owned':      { en: 'Owned ✓', ko: '보유 중 ✓' },
  'shop.vxNote':     { en: '* VX top-up (real payment) will be enabled with Verse8 integration. Demo balance for now.', ko: '* VX 충전(실제 결제)은 Verse8 연동 시 활성화됩니다. 현재는 데모 잔액입니다.' },

  // 가챠 결과
  'gacha.got':       { en: 'Units acquired!', ko: '유닛 획득!' },

  // 확률 정보
  'prob.titleGacha': { en: 'Odds (Unit Gacha)', ko: '확률 정보 (유닛 가챠)' },
  'prob.titleSummon':{ en: 'Odds (In-Game Summon)', ko: '확률 정보 (게임 내 소환)' },
  'prob.introGacha': { en: 'On a unit gacha pull, grade and job are each rolled independently at the rates below. Multiply a grade odds by a job odds for the chance of one specific unit (e.g. Archer + Legendary).', ko: '유닛 가챠 시 아래 확률로 등급과 직업이 각각 독립적으로 결정됩니다. 등급과 직업 확률을 곱하면 특정 유닛(예: 궁수+전설) 1종이 나올 확률입니다.' },
  'prob.introSummon':{ en: 'On summon, grade and job are each rolled independently at the rates below. Multiply a grade odds by a job odds for the chance of one specific unit.', ko: '유닛 소환 시 아래 확률로 등급과 직업이 각각 독립적으로 결정됩니다. 등급과 직업 확률을 곱하면 특정 유닛이 나올 확률입니다.' },
  'prob.gradeHeader':{ en: 'Grade odds', ko: '등급 확률' },
  'prob.jobHeader':  { en: 'Job odds (equal)', ko: '직업 확률 (균등)' },
  'prob.footerGacha':{ en: '* A 10-pull guarantees at least one Legendary+.<br>* If no Mythic+ appears for {pity} pulls, the next pull is a guaranteed Mythic+ ({cur}/{pity} now, {rem} left).<br>* Real payment (VX) is used only to buy gems and does not directly affect pull odds.', ko: '* 10연 뽑기는 전설 이상 유닛이 1개 이상 나오도록 보장됩니다.<br>* 신화 이상이 {pity}회 연속 나오지 않으면 다음 뽑기에서 신화 이상이 확정됩니다. (현재 {cur}/{pity}회, {rem}회 남음)<br>* 실제 결제(VX)는 보석 구매에만 사용되며 뽑기 확률에 직접 영향을 주지 않습니다.' },
  'prob.footerSummon':{ en: '* In-game 20-gold summon rolls grade at the rates above with no pity/guarantee.', ko: '* 게임 내 20골드 소환은 위 확률로 등급이 결정되며, 별도의 보장(천장)은 없습니다.' },

  // 설정
  'set.title':       { en: 'Settings', ko: '설정' },
  'set.language':    { en: 'Language', ko: '언어' },
  'set.muteAll':     { en: 'Mute all', ko: '전체 음소거' },
  'set.muteOn':      { en: '🔇 On', ko: '🔇 켜짐' },
  'set.muteOff':     { en: '🔊 Off', ko: '🔊 꺼짐' },
  'set.bgm':         { en: '🎵 Music', ko: '🎵 배경음악' },
  'set.sfx':         { en: '🔊 SFX', ko: '🔊 효과음' },
  'set.dataSection': { en: 'Data', ko: '데이터' },
  'set.reset':       { en: 'Reset progress', ko: '진행 데이터 초기화' },
  'set.resetDesc':   { en: 'Delete gems, collection, achievements, records', ko: '보석·컬렉션·업적·기록 삭제' },
  'set.resetBtn':    { en: 'Reset', ko: '초기화' },
  'set.resetTitle':  { en: 'Really reset?', ko: '정말 초기화할까요?' },
  'set.resetBody':   { en: 'All progress (gems, collection, achievements, best record) will be permanently deleted and cannot be undone.', ko: '보석·컬렉션·업적·최고 기록 등 모든 진행 데이터가 영구히 삭제되며 되돌릴 수 없습니다.' },
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
