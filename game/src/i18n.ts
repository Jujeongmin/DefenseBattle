// ============================================================
//  다국어(i18n) - 기본 영어(en), 한국어(ko), 일본어(ja), 번체 중국어(zh-Hant)
//  - Node(시뮬)에서도 안전하도록 localStorage 접근을 가드한다.
//  - 언어 변경은 페이지 리로드로 반영(패널들은 열릴 때 새 언어로 재렌더).
//  - ja / zh-Hant 는 Galmuri11 에 가나·한자 글리프가 없어 시스템 폰트로 폴백된다.
//    폴백 폰트는 Galmuri 보다 글자폭이 좁아, 레이아웃이 넘칠 위험은 오히려 낮다.
// ============================================================
import type { Job, Race, GradeKey } from './types';

export type Lang = 'en' | 'ko' | 'ja' | 'zh-Hant';
export const LANGS: Lang[] = ['en', 'ko', 'ja', 'zh-Hant'];
const LANG_KEY = 'randomdefense.lang.v1';

function readLang(): Lang {
  try {
    if (typeof localStorage !== 'undefined') {
      const v = localStorage.getItem(LANG_KEY);
      if ((LANGS as string[]).includes(v as string)) return v as Lang;
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
  ja: { archer: '弓兵', wizard: '魔法使い', warrior: '戦士' },
  'zh-Hant': { archer: '弓箭手', wizard: '法師', warrior: '戰士' },
};
const RACE_NAME: Record<Lang, Record<Race, string>> = {
  en: { troll: 'Troll', orc: 'Orc', undead: 'Undead' },
  ko: { troll: '트롤', orc: '오크', undead: '언데드' },
  ja: { troll: 'トロール', orc: 'オーク', undead: 'アンデッド' },
  'zh-Hant': { troll: '巨魔', orc: '獸人', undead: '不死族' },
};
const GRADE_NAME: Record<Lang, Record<GradeKey, string>> = {
  en: { common: 'Common', rare: 'Rare', elite: 'Elite', legendary: 'Legendary', mythic: 'Mythic', eternal: 'Eternal' },
  ko: { common: '일반', rare: '고급', elite: '정예', legendary: '전설', mythic: '신화', eternal: '태초' },
  ja: { common: 'ノーマル', rare: 'レア', elite: 'エリート', legendary: 'レジェンド', mythic: '神話', eternal: '太初' },
  'zh-Hant': { common: '普通', rare: '高級', elite: '精英', legendary: '傳說', mythic: '神話', eternal: '太初' },
};
export function jobName(j: Job): string { return JOB_NAME[lang][j]; }
export function raceName(r: Race): string { return RACE_NAME[lang][r]; }
export function gradeName(g: GradeKey): string { return GRADE_NAME[lang][g]; }

// ---------- 일반 UI 문자열 ----------
type Params = Record<string, string | number>;
const STRINGS: Record<string, Record<Lang, string>> = {
  // 공통
  'common.close':    { en: 'Close', ko: '닫기', ja: '閉じる', 'zh-Hant': '關閉' },
  'common.confirm':  { en: 'Confirm', ko: '확인', ja: '確認', 'zh-Hant': '確認' },
  'common.cancel':   { en: 'Cancel', ko: '취소', ja: 'キャンセル', 'zh-Hant': '取消' },
  'common.continue': { en: 'Continue', ko: '계속하기', ja: '続ける', 'zh-Hant': '繼續' },
  'common.leave':    { en: 'Leave', ko: '나가기', ja: '退出', 'zh-Hant': '離開' },
  'common.max':      { en: 'MAX', ko: 'MAX', ja: 'MAX', 'zh-Hant': 'MAX' },

  // 메인 화면 / 상단바 / 하단
  'app.title':       { en: 'Random Defense', ko: '랜덤 디펜스', ja: 'ランダムディフェンス', 'zh-Hant': '隨機防禦' },
  'menu.start':      { en: 'Start Game', ko: '게임 시작', ja: 'ゲーム開始', 'zh-Hant': '開始遊戲' },
  'menu.shop':       { en: 'Shop', ko: '상점', ja: 'ショップ', 'zh-Hant': '商店' },
  'menu.lab':        { en: 'Lab', ko: '연구소', ja: '研究所', 'zh-Hant': '研究所' },
  'menu.rank':       { en: 'Rankings', ko: '랭킹', ja: 'ランキング', 'zh-Hant': '排行榜' },
  'menu.reset':      { en: 'Reset Progress', ko: '데이터 초기화', ja: 'データ初期化', 'zh-Hant': '重置資料' },
  'menu.recordPre':  { en: 'Best:', ko: '최고 기록:', ja: '最高記録:', 'zh-Hant': '最高紀錄:' },
  'menu.recordSuf':  { en: 'waves', ko: '웨이브', ja: 'ウェーブ', 'zh-Hant': '波' },
  'hud.wave':        { en: 'Wave {n}', ko: '웨이브 {n}', ja: 'ウェーブ {n}', 'zh-Hant': '第 {n} 波' },
  'hud.summon':      { en: 'Summon', ko: '소환', ja: '召喚', 'zh-Hant': '召喚' },
  'hud.sell':        { en: 'Sell', ko: '판매', ja: '売却', 'zh-Hant': '出售' },
  'hud.home':        { en: 'Home', ko: '메인', ja: 'ホーム', 'zh-Hant': '主頁' },
  'hud.probInfo':    { en: 'Odds ⓘ', ko: '확률 정보 ⓘ', ja: '確率 ⓘ', 'zh-Hant': '機率 ⓘ' },
  // 유닛 카드의 강화 버튼. 카드 폭(가용 70px)에 한 줄로 들어가야 한다.
  // 'Upgrade ●20' 은 101px 이라 두 줄로 접히고, 그만큼 카드가 커져 하단이 화면 밖으로 밀렸다.
  'hud.upgrade':     { en: 'Up', ko: '강화', ja: '強化', 'zh-Hant': '強化' },
  'hud.nextWave':    { en: 'Next wave {s}s', ko: '다음 웨이브 {s}s', ja: '次のウェーブ {s}s', 'zh-Hant': '下一波 {s}s' },

  // 소환 로그 / 배너 (엔진)
  'log.summon':      { en: '{rate}% {job} {grade} summoned', ko: '{rate}% {job} {grade}등급 소환', ja: '{rate}% {job} {grade} 召喚', 'zh-Hant': '{rate}% {job} {grade} 召喚' },
  'banner.mythic':   { en: '✨ {grade} {job} Summoned! ✨', ko: '✨ {job} {grade} 등급 소환! ✨', ja: '✨ {grade} {job} 召喚！ ✨', 'zh-Hant': '✨ {grade} {job} 召喚！ ✨' },

  // 게임 오버
  'over.clear':      { en: 'Clear!', ko: '클리어!', ja: 'クリア！', 'zh-Hant': '通關！' },
  'over.gameover':   { en: 'Game Over', ko: '게임 오버', ja: 'ゲームオーバー', 'zh-Hant': '遊戲結束' },
  'over.reward':     { en: 'Crystals earned', ko: '획득 크리스탈', ja: '獲得ジェム', 'zh-Hant': '獲得寶石' },
  'over.owned':      { en: 'Owned', ko: '보유', ja: '所持', 'zh-Hant': '持有' },
  'over.toMain':     { en: 'To Main', ko: '메인으로', ja: 'メインへ', 'zh-Hant': '回主畫面' },
  'over.mobLimit':   { en: 'Too many monsters on the map', ko: '몹이 100마리를 넘었습니다', ja: 'モンスターが100体を超えました', 'zh-Hant': '怪物數量超過 100 隻' },
  'over.bossTimeout':{ en: 'Boss time limit exceeded', ko: '보스 제한시간 초과', ja: 'ボス制限時間オーバー', 'zh-Hant': '王關時間超時' },
  'over.clear50':    { en: 'Cleared all 50 waves!', ko: '50 웨이브 클리어!', ja: '50ウェーブ クリア！', 'zh-Hant': '通關全 50 波！' },

  // 나가기 확인
  'exit.title':      { en: 'Return to the main menu?', ko: '메인으로 나갈까요?', ja: 'メインに戻りますか？', 'zh-Hant': '要回到主畫面嗎？' },
  'exit.body':       { en: "Leaving now discards this run's progress (Wave {n}).", ko: '지금 나가면 이번 판(Wave {n}) 진행 상황이 저장되지 않고 사라집니다.', ja: '今退出すると、今回のプレイ（ウェーブ {n}）は保存されずに消えます。', 'zh-Hant': '現在離開的話，本局進度（第 {n} 波）不會保存並將消失。' },

  // 판매 패널
  'sell.title':      { en: 'Sell Units', ko: '영웅 판매', ja: 'ユニット売却', 'zh-Hant': '出售單位' },
  'sell.hint':       { en: 'Choose how many to sell at once.', ko: '한 번에 판매할 개수를 선택할 수 있어요', ja: '一度に売却する数を選べます。', 'zh-Hant': '可選擇一次出售的數量。' },
  'sell.all':        { en: 'ALL', ko: 'ALL', ja: 'ALL', 'zh-Hant': 'ALL' },

  // 업적 토스트
  'toast.achievement': { en: 'Achievement: {name} (+{n}💎)', ko: '업적 달성: {name} (+{n}💎)', ja: '実績達成: {name} (+{n}💎)', 'zh-Hant': '成就達成: {name} (+{n}💎)' },

  // 연구소 (유닛 강화 / 퀘스트)
  'lab.title':       { en: 'Lab', ko: '연구소', ja: '研究所', 'zh-Hant': '研究所' },
  'lab.tabUnits':    { en: 'Units', ko: '유닛 강화', ja: 'ユニット強化', 'zh-Hant': '單位強化' },
  'lab.tabQuest':    { en: 'Quests', ko: '퀘스트', ja: 'クエスト', 'zh-Hant': '任務' },
  'lab.hint':        { en: 'Spend collected units to star them up for a permanent in-battle boost.', ko: '뽑은 유닛을 소모해 스타업하면 해당 유닛이 게임 내에서 영구 강화됩니다.', ja: '入手したユニットを消費してスターアップすると、そのユニットがゲーム内で永久強化されます。', 'zh-Hant': '消耗已獲得的單位進行升星，該單位在遊戲中將永久強化。' },
  'lab.atkBonus':    { en: 'ATK +{n}%', ko: '공격 +{n}%', ja: '攻撃 +{n}%', 'zh-Hant': '攻擊 +{n}%' },
  'lab.owned':       { en: 'Owned {have} / {need}', ko: '보유 {have} / {need}', ja: '所持 {have} / {need}', 'zh-Hant': '持有 {have} / {need}' },
  'lab.ownedMax':    { en: 'Owned {have}', ko: '보유 {have}', ja: '所持 {have}', 'zh-Hant': '持有 {have}' },
  'lab.starUp':      { en: 'Star Up', ko: '스타업', ja: 'スターアップ', 'zh-Hant': '升星' },

  // 퀘스트
  'quest.daily':     { en: 'Daily Quests', ko: '일일 퀘스트', ja: 'デイリークエスト', 'zh-Hant': '每日任務' },
  'quest.achievements': { en: 'Achievements', ko: '업적', ja: '実績', 'zh-Hant': '成就' },
  'quest.done':      { en: 'Done', ko: '완료', ja: '完了', 'zh-Hant': '完成' },
  'quest.inProgress':{ en: 'In progress', ko: '진행중', ja: '進行中', 'zh-Hant': '進行中' },
  'quest.rewardPre': { en: 'Reward', ko: '보상', ja: '報酬', 'zh-Hant': '獎勵' },
  'quest.unlocked':  { en: 'Done ✓', ko: '달성 ✓', ja: '達成 ✓', 'zh-Hant': '達成 ✓' },
  'quest.locked':    { en: 'Locked', ko: '미달성', ja: '未達成', 'zh-Hant': '未達成' },

  // 퀘스트/업적 이름 (config 의 key 로 조회)
  'q.summon30':      { en: 'Summon 30 units', ko: '유닛 30회 소환', ja: 'ユニットを30回召喚', 'zh-Hant': '召喚單位 30 次' },
  'q.kill200':       { en: 'Kill 200 monsters', ko: '몬스터 200마리 처치', ja: 'モンスターを200体撃破', 'zh-Hant': '擊敗 200 隻怪物' },
  'q.wave20':        { en: 'Reach wave 20', ko: '20웨이브 도달', ja: 'ウェーブ20に到達', 'zh-Hant': '抵達第 20 波' },
  'q.sell20':        { en: 'Sell 20 units', ko: '유닛 20회 판매', ja: 'ユニットを20回売却', 'zh-Hant': '出售單位 20 次' },
  'a.firstLegendary':{ en: 'Get your first Legendary', ko: '전설 유닛 최초 획득', ja: 'レジェンドを初めて獲得', 'zh-Hant': '首次獲得傳說單位' },
  'a.firstMythic':   { en: 'Get your first Mythic', ko: '신화 유닛 최초 획득', ja: '神話を初めて獲得', 'zh-Hant': '首次獲得神話單位' },
  'a.firstEternal':  { en: 'Get your first Eternal', ko: '태초 유닛 최초 획득', ja: '太初を初めて獲得', 'zh-Hant': '首次獲得太初單位' },
  'a.clear10':       { en: 'Clear wave 10', ko: '10웨이브 클리어', ja: 'ウェーブ10クリア', 'zh-Hant': '通關第 10 波' },
  'a.clear20':       { en: 'Clear wave 20', ko: '20웨이브 클리어', ja: 'ウェーブ20クリア', 'zh-Hant': '通關第 20 波' },
  'a.clear30':       { en: 'Clear wave 30', ko: '30웨이브 클리어', ja: 'ウェーブ30クリア', 'zh-Hant': '通關第 30 波' },
  'a.clear40':       { en: 'Clear wave 40', ko: '40웨이브 클리어', ja: 'ウェーブ40クリア', 'zh-Hant': '通關第 40 波' },
  'a.clear50':       { en: 'Clear wave 50', ko: '50웨이브 클리어', ja: 'ウェーブ50クリア', 'zh-Hant': '通關第 50 波' },

  // 상점
  'shop.title':      { en: 'Shop', ko: '상점', ja: 'ショップ', 'zh-Hant': '商店' },
  'shop.gachaTitle': { en: 'Unit Gacha', ko: '유닛 가챠', ja: 'ユニットガチャ', 'zh-Hant': '單位轉蛋' },
  'shop.gachaDesc':  { en: 'Get random job × grade units!<br>Star them up in the Lab for permanent power.', ko: '랜덤 직업×등급 유닛 획득!<br>연구소에서 스타업 → 영구 강화', ja: 'ランダムな職業×等級のユニットを獲得！<br>研究所でスターアップ → 永久強化', 'zh-Hant': '獲得隨機職業 × 等級的單位！<br>在研究所升星 → 永久強化' },
  'shop.pityHint':   { en: '{rem} more pull(s) → guaranteed Mythic+ (Mythic 80% / Eternal 20%)', ko: '{rem}번 더 뽑으면 신화 이상 확정 (신화 80% / 태초 20%)', ja: 'あと{rem}回で神話以上が確定（神話80% / 太初20%）', 'zh-Hant': '再抽 {rem} 次必得神話以上（神話 80% / 太初 20%）' },
  'shop.pityReady':  { en: 'Next pull is a guaranteed Mythic+! (Mythic 80% / Eternal 20%)', ko: '다음 뽑기는 신화 이상 확정! (신화 80% / 태초 20%)', ja: '次の抽選は神話以上が確定！（神話80% / 太初20%）', 'zh-Hant': '下次抽取必得神話以上！（神話 80% / 太初 20%）' },
  'shop.pull1':      { en: '1 Pull', ko: '1회 뽑기', ja: '1回引く', 'zh-Hant': '單抽' },
  'shop.pull10':     { en: '10 Pull', ko: '10연 뽑기', ja: '10連引く', 'zh-Hant': '十連抽' },
  'shop.buyGems':    { en: 'Buy Gems', ko: '보석 구매', ja: 'ジェム購入', 'zh-Hant': '購買寶石' },
  'shop.gemPack':    { en: '{n} Gems', ko: '보석 {n}개', ja: 'ジェム {n}個', 'zh-Hant': '寶石 {n} 顆' },
  'shop.packages':   { en: 'Packages', ko: '패키지', ja: 'パッケージ', 'zh-Hant': '禮包' },
  'shop.adTitle':    { en: 'Ad Removal Pack', ko: '광고 제거 패키지', ja: '広告除去パック', 'zh-Hant': '移除廣告禮包' },
  'shop.adDesc':     { en: 'Remove ads + unlock 3x speed · VX {n}', ko: '광고 제거 + 3배속 해금 · VX {n}', ja: '広告除去 + 3倍速解放 · VX {n}', 'zh-Hant': '移除廣告 + 解鎖 3 倍速 · VX {n}' },
  'shop.owned':      { en: 'Owned ✓', ko: '보유 중 ✓', ja: '所持中 ✓', 'zh-Hant': '已持有 ✓' },
  'shop.vxNote':     { en: '* Tapping a VX price opens Verse8’s secure payment window. If you don’t have enough VX, you can top up there.', ko: '* VX 가격 버튼을 누르면 Verse8 결제창이 열립니다. VX가 부족하면 결제창에서 바로 충전할 수 있어요.', ja: '* VX 価格ボタンを押すと Verse8 の決済ウィンドウが開きます。VX が足りない場合はその場でチャージできます。', 'zh-Hant': '* 點擊 VX 價格按鈕會開啟 Verse8 付款視窗。VX 不足時可直接於該視窗儲值。' },

  'shop.purchaseSuccess': { en: 'Purchase Successful!', ko: '구매 성공!', ja: '購入完了！', 'zh-Hant': '購買成功！' },

  // 가챠 결과
  'gacha.got':       { en: 'Units acquired!', ko: '유닛 획득!', ja: 'ユニット獲得！', 'zh-Hant': '獲得單位！' },

  // 확률 정보
  'prob.titleGacha': { en: 'Odds (Unit Gacha)', ko: '확률 정보 (유닛 가챠)', ja: '確率情報（ユニットガチャ）', 'zh-Hant': '機率資訊（單位轉蛋）' },
  'prob.titleSummon':{ en: 'Odds (In-Game Summon)', ko: '확률 정보 (게임 내 소환)', ja: '確率情報（ゲーム内召喚）', 'zh-Hant': '機率資訊（遊戲內召喚）' },
  'prob.introGacha': { en: 'On a unit gacha pull, grade and job are each rolled independently at the rates below. Multiply a grade odds by a job odds for the chance of one specific unit (e.g. Archer + Legendary).', ko: '유닛 가챠 시 아래 확률로 등급과 직업이 각각 독립적으로 결정됩니다. 등급과 직업 확률을 곱하면 특정 유닛(예: 궁수+전설) 1종이 나올 확률입니다.', ja: 'ユニットガチャでは、以下の確率で等級と職業がそれぞれ独立に決まります。等級の確率と職業の確率を掛けると、特定のユニット（例: 弓兵+レジェンド）1種が出る確率になります。', 'zh-Hant': '單位轉蛋時，等級與職業會各自依下列機率獨立決定。將等級機率乘以職業機率，即為特定單位（例：弓箭手 + 傳說）的出現機率。' },
  'prob.introSummon':{ en: 'On summon, grade and job are each rolled independently at the rates below. Multiply a grade odds by a job odds for the chance of one specific unit.', ko: '유닛 소환 시 아래 확률로 등급과 직업이 각각 독립적으로 결정됩니다. 등급과 직업 확률을 곱하면 특정 유닛이 나올 확률입니다.', ja: '召喚時は、以下の確率で等級と職業がそれぞれ独立に決まります。等級の確率と職業の確率を掛けると、特定のユニットが出る確率になります。', 'zh-Hant': '召喚時，等級與職業會各自依下列機率獨立決定。將等級機率乘以職業機率，即為特定單位的出現機率。' },
  'prob.gradeHeader':{ en: 'Grade odds', ko: '등급 확률', ja: '等級確率', 'zh-Hant': '等級機率' },
  'prob.jobHeader':  { en: 'Job odds (equal)', ko: '직업 확률 (균등)', ja: '職業確率（均等）', 'zh-Hant': '職業機率（均等）' },
  'prob.footerGacha':{ en: '* If no Mythic+ appears for {pity} pulls, the next pull is a guaranteed Mythic+ ({cur}/{pity} now, {rem} left).<br>* A guaranteed Mythic+ splits Mythic : Eternal = 4 : 1 (Mythic 80% / Eternal 20%).<br>* Real payment (VX) is used only to buy gems and does not directly affect pull odds.', ko: '* 신화 이상이 {pity}회 연속 나오지 않으면 다음 뽑기에서 신화 이상이 확정됩니다. (현재 {cur}/{pity}회, {rem}회 남음)<br>* 신화 이상 확정 시 신화 : 태초 = 4 : 1 (신화 80% / 태초 20%)로 결정됩니다.<br>* 실제 결제(VX)는 보석 구매에만 사용되며 뽑기 확률에 직접 영향을 주지 않습니다.', ja: '* 神話以上が{pity}回連続で出ない場合、次の抽選で神話以上が確定します。（現在 {cur}/{pity}回、残り {rem}回）<br>* 神話以上が確定した際は 神話 : 太初 = 4 : 1（神話80% / 太初20%）で決まります。<br>* 実際の決済（VX）はジェムの購入にのみ使用され、抽選確率に直接影響しません。', 'zh-Hant': '* 若連續 {pity} 次未出現神話以上，下一次抽取必得神話以上。（目前 {cur}/{pity} 次，尚餘 {rem} 次）<br>* 必得神話以上時，神話 : 太初 = 4 : 1（神話 80% / 太初 20%）。<br>* 實際付款（VX）僅用於購買寶石，不會直接影響抽取機率。' },
  'prob.footerSummon':{ en: '* In-game 20-gold summon rolls grade at the rates above with no pity/guarantee.', ko: '* 게임 내 20골드 소환은 위 확률로 등급이 결정되며, 별도의 보장(천장)은 없습니다.', ja: '* ゲーム内の20ゴールド召喚は上記の確率で等級が決まり、天井などの保証はありません。', 'zh-Hant': '* 遊戲內 20 金幣召喚依上述機率決定等級，沒有保底機制。' },

  // 설정
  'set.title':       { en: 'Settings', ko: '설정', ja: '設定', 'zh-Hant': '設定' },
  'set.language':    { en: 'Language', ko: '언어', ja: '言語', 'zh-Hant': '語言' },
  'set.muteAll':     { en: 'Mute all', ko: '전체 음소거', ja: '全体ミュート', 'zh-Hant': '全部靜音' },
  'set.muteOn':      { en: '🔇 On', ko: '🔇 켜짐', ja: '🔇 オン', 'zh-Hant': '🔇 開' },
  'set.muteOff':     { en: '🔊 Off', ko: '🔊 꺼짐', ja: '🔊 オフ', 'zh-Hant': '🔊 關' },
  'set.bgm':         { en: 'Music', ko: '배경음악', ja: 'BGM', 'zh-Hant': '背景音樂' },
  'set.sfx':         { en: '🔊 SFX', ko: '🔊 효과음', ja: '🔊 効果音', 'zh-Hant': '🔊 音效' },
  'set.dataSection': { en: 'Data', ko: '데이터', ja: 'データ', 'zh-Hant': '資料' },
  'set.reset':       { en: 'Reset progress', ko: '진행 데이터 초기화', ja: '進行データ初期化', 'zh-Hant': '重置進度資料' },
  'set.resetDesc':   { en: 'Delete gems, collection, achievements, records', ko: '보석·컬렉션·업적·기록 삭제', ja: 'ジェム・コレクション・実績・記録を削除', 'zh-Hant': '刪除寶石、收藏、成就與紀錄' },
  'set.resetBtn':    { en: 'Reset', ko: '초기화', ja: '初期化', 'zh-Hant': '重置' },
  'set.resetTitle':  { en: 'Really reset?', ko: '정말 초기화할까요?', ja: '本当に初期化しますか？', 'zh-Hant': '確定要重置嗎？' },
  'set.resetBody':   { en: 'All progress (gems, collection, achievements, best record) will be permanently deleted and cannot be undone.', ko: '보석·컬렉션·업적·최고 기록 등 모든 진행 데이터가 영구히 삭제되며 되돌릴 수 없습니다.', ja: 'ジェム・コレクション・実績・最高記録など、すべての進行データが永久に削除され、元に戻せません。', 'zh-Hant': '寶石、收藏、成就與最高紀錄等所有進度資料將被永久刪除，且無法復原。' },
  'set.tutorial':    { en: 'Replay tutorial', ko: '튜토리얼 다시보기', ja: 'チュートリアルを再表示', 'zh-Hant': '重看教學' },
  'set.tutorialDesc':{ en: 'Show the beginner guide on your next game', ko: '다음 게임 시작 시 초보 가이드 표시', ja: '次のゲーム開始時に初心者ガイドを表示', 'zh-Hant': '下次開始遊戲時顯示新手指南' },
  'set.tutorialBtn': { en: 'Replay', ko: '다시보기', ja: '再表示', 'zh-Hant': '重看' },
  'set.tutorialDone':{ en: 'On next game ✓', ko: '다음 게임에 표시 ✓', ja: '次のゲームで表示 ✓', 'zh-Hant': '下次遊戲顯示 ✓' },

  // 튜토리얼 / 온보딩
  'tut.skip':        { en: 'Skip', ko: '건너뛰기', ja: 'スキップ', 'zh-Hant': '略過' },
  'tut.next':        { en: 'Next', ko: '다음', ja: '次へ', 'zh-Hant': '下一步' },
  'tut.start':       { en: "Let's go!", ko: '시작하기!', ja: 'はじめる！', 'zh-Hant': '開始吧！' },
  'tut.summonTitle': { en: 'Recruit units', ko: '유닛 소환', ja: 'ユニット召喚', 'zh-Hant': '召喚單位' },
  'tut.summon':      { en: 'Hold the Summon button to recruit random units. Each summon costs {cost} gold. Try it now! 👇', ko: '소환 버튼을 길게 눌러 랜덤 유닛을 뽑으세요. 한 번에 {cost} 골드가 듭니다. 지금 눌러보세요! 👇', ja: '召喚ボタンを長押ししてランダムなユニットを引きましょう。1回につき {cost} ゴールドかかります。押してみてください！ 👇', 'zh-Hant': '長按召喚按鈕來抽取隨機單位。每次召喚需要 {cost} 金幣。現在就試試吧！ 👇' },
  'tut.stacksTitle': { en: 'Job & matchup', ko: '직업과 상성', ja: '職業と相性', 'zh-Hant': '職業與相剋' },
  'tut.stacks':      { en: 'Units are grouped by job (Mage/Archer/Warrior). The % is their damage vs THIS wave\'s enemy — 🟢 green is strong, 🔴 red is weak. Stack up your strong jobs!', ko: '유닛은 직업(마법사/궁수/전사)별로 묶입니다. %는 이번 웨이브 적에 대한 피해량이에요 — 🟢 초록은 강함, 🔴 빨강은 약함. 강한 직업을 많이 모으세요!', ja: 'ユニットは職業（魔法使い/弓兵/戦士）ごとにまとまります。%は今回のウェーブの敵へのダメージ量です — 🟢 緑は強い、🔴 赤は弱い。強い職業を多く集めましょう！', 'zh-Hant': '單位會依職業（法師／弓箭手／戰士）分組。% 代表對本波敵人的傷害量 — 🟢 綠色為強、🔴 紅色為弱。多累積克制的職業吧！' },
  'tut.raceTitle':   { en: 'Watch the enemy', ko: '적 종족 확인', ja: '敵の種族を確認', 'zh-Hant': '確認敵人種族' },
  'tut.race':        { en: 'The enemy race changes each wave (Troll/Orc/Undead). Check here and rely on the job that counters it.', ko: '적 종족은 웨이브마다 바뀝니다(트롤/오크/언데드). 여기서 확인하고 상성이 좋은 직업을 활용하세요.', ja: '敵の種族はウェーブごとに変わります（トロール/オーク/アンデッド）。ここで確認して、相性の良い職業を活用しましょう。', 'zh-Hant': '敵人種族每波都會改變（巨魔／獸人／不死族）。在這裡確認後，善用相剋的職業。' },
  'tut.goldTitle':   { en: 'Earn gold', ko: '골드 획득', ja: 'ゴールド獲得', 'zh-Hant': '獲得金幣' },
  'tut.gold':        { en: 'Defeated enemies drop gold — spend it to summon, upgrade, or sell. Survive all 50 waves. Good luck! ⚔️', ko: '적을 처치하면 골드를 얻습니다 — 소환·강화·판매에 쓰세요. 50웨이브까지 살아남으세요. 행운을 빕니다! ⚔️', ja: '敵を倒すとゴールドが手に入ります — 召喚・強化・売却に使いましょう。50ウェーブまで生き残ってください。健闘を祈ります！ ⚔️', 'zh-Hant': '擊敗敵人可獲得金幣 — 用於召喚、強化或出售。撐過全 50 波吧，祝你好運！ ⚔️' },

  // 상점 보상형 광고
  'shop.adSection':  { en: 'Rewarded Ad', ko: '보상형 광고', ja: 'リワード広告', 'zh-Hant': '獎勵廣告' },
  'shop.adCooldownBtn': { en: 'Available again in {time}', ko: '{time} 후 다시 시청 가능', ja: '{time} 後に再視聴できます', 'zh-Hant': '{time} 後可再次觀看' },
  'shop.adFreeBtn':  { en: 'Claim free', ko: '광고 없이 받기', ja: '広告なしで受け取る', 'zh-Hant': '免廣告領取' },
  'shop.adWatchBtn': { en: '📺 Watch ad to claim', ko: '📺 광고 시청하고 받기', ja: '📺 広告を見て受け取る', 'zh-Hant': '📺 觀看廣告領取' },
  'shop.adRemovedInfo': { en: 'Ad-free: get free gems once every 30 minutes, no ad needed!', ko: '광고제거 상태: 30분마다 한 번, 광고 없이 무료 보석을 받으세요!', ja: '広告除去中: 30分に1回、広告なしで無料ジェムを受け取れます！', 'zh-Hant': '已移除廣告：每 30 分鐘一次，免廣告即可領取免費寶石！' },
  'shop.adInfo':     { en: 'Watch an ad once every 30 minutes for free gems.', ko: '30분마다 한 번, 광고를 보고 무료 보석을 받으세요!', ja: '30分に1回、広告を見て無料ジェムを受け取りましょう！', 'zh-Hant': '每 30 分鐘一次，觀看廣告即可領取免費寶石！' },
  'shop.adGranted':  { en: '✅ Reward claimed! (+{n} gems)', ko: '✅ 보상 지급 완료! (보석 +{n})', ja: '✅ 報酬を受け取りました！（ジェム +{n}）', 'zh-Hant': '✅ 已領取獎勵！（寶石 +{n}）' },
  'shop.adLoading':  { en: '⏳ Loading ad...', ko: '⏳ 광고 불러오는 중...', ja: '⏳ 広告を読み込み中...', 'zh-Hant': '⏳ 廣告載入中...' },
  'shop.adDismissed':{ en: '⚠️ Watch the full ad to get the reward.', ko: '⚠️ 광고를 끝까지 봐야 보상이 지급됩니다.', ja: '⚠️ 広告を最後まで見ないと報酬は受け取れません。', 'zh-Hant': '⚠️ 需看完整支廣告才能獲得獎勵。' },
  'shop.adNoFill':   { en: '⚠️ No ad available right now. Please try again later.', ko: '⚠️ 지금은 볼 수 있는 광고가 없어요. 잠시 후 다시 시도해 주세요.', ja: '⚠️ 現在視聴できる広告がありません。しばらくしてからもう一度お試しください。', 'zh-Hant': '⚠️ 目前沒有可觀看的廣告，請稍後再試。' },
  'shop.adUnsupported': { en: 'ℹ️ Ads are not available in this environment.', ko: 'ℹ️ 이 환경에서는 광고를 볼 수 없습니다.', ja: 'ℹ️ この環境では広告を視聴できません。', 'zh-Hant': 'ℹ️ 此環境無法觀看廣告。' },
  'shop.minSec':     { en: '{m}m {s}s', ko: '{m}분 {s}초', ja: '{m}分 {s}秒', 'zh-Hant': '{m} 分 {s} 秒' },

  // 게임오버 - 2배 보상 광고
  'over.doubleAdTitle': { en: '📺 Watch ad for 2x reward', ko: '📺 광고 시청하고 2배 보상', ja: '📺 広告を見て報酬2倍', 'zh-Hant': '📺 觀看廣告獲得 2 倍獎勵' },
  'over.doubleAdDesc':  { en: 'Watch an ad to get 2x gems ({n})!', ko: '광고를 보면 보석을 2배 ({n}개) 받을 수 있어요!', ja: '広告を見るとジェムが2倍（{n}個）になります！', 'zh-Hant': '觀看廣告即可獲得 2 倍寶石（{n} 顆）！' },
  'over.doubleBtn':     { en: '📺 Get 2x', ko: '📺 2배 받기', ja: '📺 2倍で受け取る', 'zh-Hant': '📺 領取 2 倍' },
  'over.adRemovedAutoDouble': { en: '✅ Ad-free bonus: 2x gems granted automatically!', ko: '✅ 광고제거 혜택: 2배 보석 자동 지급!', ja: '✅ 広告除去特典: ジェム2倍を自動付与！', 'zh-Hant': '✅ 移除廣告特典：自動發放 2 倍寶石！' },
  'over.adLoading':     { en: 'Loading ad...', ko: '광고 로딩 중...', ja: '広告を読み込み中...', 'zh-Hant': '廣告載入中...' },
  'over.doubleGranted': { en: '✅ 2x reward granted! (+{n} gems)', ko: '✅ 2배 보상 지급 완료! (+{n} 보석)', ja: '✅ 2倍報酬を付与しました！（ジェム +{n}）', 'zh-Hant': '✅ 已發放 2 倍獎勵！（寶石 +{n}）' },
  'over.adIncomplete':  { en: '⚠️ Watch the full ad to get the 2x reward.', ko: '⚠️ 광고를 끝까지 시청해야 2배 보상이 지급됩니다.', ja: '⚠️ 広告を最後まで見ないと2倍報酬は付与されません。', 'zh-Hant': '⚠️ 需看完整支廣告才能獲得 2 倍獎勵。' },
  'over.adLoadFailed':  { en: '⚠️ Failed to load ad. Please try again.', ko: '⚠️ 광고 로딩 실패. 다시 시도해 주세요.', ja: '⚠️ 広告の読み込みに失敗しました。もう一度お試しください。', 'zh-Hant': '⚠️ 廣告載入失敗，請再試一次。' },
  'over.baseAutoGranted': { en: '✅ +{n} gems already added. Watch an ad to double it!', ko: '✅ 보석 +{n} 지급 완료. 광고를 보면 2배!', ja: '✅ ジェム +{n} 付与済み。広告を見れば2倍！', 'zh-Hant': '✅ 已發放寶石 +{n}。觀看廣告可翻倍！' },

  // 게임오버 - 랭킹 등록
  'over.rankTitle':     { en: 'Live Rankings', ko: '실시간 랭킹 등록', ja: 'リアルタイムランキング登録', 'zh-Hant': '即時排行榜登錄' },
  'over.rankDesc':      { en: "Submit this run's record (Wave {n}) to the leaderboard!", ko: '이번 판 기록({n}웨이브)을 랭킹에 올리세요!', ja: '今回の記録（ウェーブ {n}）をランキングに登録しましょう！', 'zh-Hant': '將本局紀錄（第 {n} 波）登錄到排行榜吧！' },
  'over.rankSubmitBtn': { en: 'Submit', ko: '기록 등록', ja: '登録', 'zh-Hant': '登錄' },
  'over.rankRegistering': { en: 'Submitting to server...', ko: '서버에 등록하는 중...', ja: 'サーバーに登録中...', 'zh-Hant': '正在登錄至伺服器...' },
  'over.rankSubmitFailed': { en: '❌ Submit failed: {msg}', ko: '❌ 등록 실패: {msg}', ja: '❌ 登録に失敗: {msg}', 'zh-Hant': '❌ 登錄失敗: {msg}' },
  'over.networkError':   { en: 'Network error', ko: '네트워크 오류', ja: 'ネットワークエラー', 'zh-Hant': '網路錯誤' },
  // 랭킹 등록 결과 (서버는 구조값만 반환, 문구는 여기서 조립)
  'rank.resFirst':       { en: '✅ First record registered! (Wave {n})', ko: '✅ 첫 기록 등록 완료! ({n}웨이브)', ja: '✅ 初回記録を登録しました！（ウェーブ {n}）', 'zh-Hant': '✅ 已登錄首次紀錄！（第 {n} 波）' },
  'rank.resNewBest':     { en: '✅ New best record! (previous: Wave {prev})', ko: '✅ 새로운 최고 기록 달성! (이전 기록: {prev}웨이브)', ja: '✅ 最高記録を更新！（前回: ウェーブ {prev}）', 'zh-Hant': '✅ 刷新最高紀錄！（前次：第 {prev} 波）' },
  'rank.resNotBeaten':   { en: 'ℹ️ You already have a higher record. (Wave {n})', ko: 'ℹ️ 이미 더 높은 최고 기록이 있습니다. ({n}웨이브)', ja: 'ℹ️ すでにより高い記録があります。（ウェーブ {n}）', 'zh-Hant': 'ℹ️ 你已有更高的紀錄。（第 {n} 波）' },

  // 랭킹 패널
  'rank.title':         { en: 'Live Rankings', ko: '실시간 랭킹', ja: 'リアルタイムランキング', 'zh-Hant': '即時排行榜' },
  'rank.loading':        { en: 'Loading rankings...', ko: '랭킹 데이터를 불러오는 중...', ja: 'ランキングを読み込み中...', 'zh-Hant': '排行榜載入中...' },
  'rank.connectError':   { en: '❌ Failed to connect to the server.', ko: '❌ 서버 연결에 실패했습니다.', ja: '❌ サーバーへの接続に失敗しました。', 'zh-Hant': '❌ 無法連線到伺服器。' },
  'rank.checkNetwork':   { en: 'Please check your network connection.', ko: '네트워크 상태를 확인해 주세요.', ja: 'ネットワーク状態をご確認ください。', 'zh-Hant': '請確認網路連線狀態。' },
  'rank.noRecords':      { en: 'No rankings registered yet.', ko: '등록된 랭킹 기록이 없습니다.', ja: '登録されたランキング記録がありません。', 'zh-Hant': '尚無已登錄的排行紀錄。' },
  'rank.myBest':         { en: 'My Best', ko: '내 최고 기록 (My Best)', ja: '自己ベスト', 'zh-Hant': '我的最佳' },
  'rank.notRegistered':  { en: 'Not on the leaderboard yet.<br/>Register your best record (<b>Wave {n}</b>) below!', ko: '아직 랭킹에 등록되지 않았습니다.<br/>최고 기록(<b>{n}웨이브</b>)을 아래에서 등록해보세요!', ja: 'まだランキングに登録されていません。<br/>最高記録（<b>ウェーブ {n}</b>）を下から登録しましょう！', 'zh-Hant': '尚未登錄到排行榜。<br/>在下方登錄你的最高紀錄（<b>第 {n} 波</b>）吧！' },
  'rank.waveSuf':        { en: 'Wave {n}', ko: '{n}웨이브', ja: 'ウェーブ {n}', 'zh-Hant': '第 {n} 波' },
  'rank.nicknameManage': { en: 'Nickname', ko: '닉네임 관리 (Set Nickname)', ja: 'ニックネーム', 'zh-Hant': '暱稱' },
  'rank.maxChars':       { en: 'Max 15 chars', ko: '최대 15자', ja: '最大15文字', 'zh-Hant': '最多 15 字' },
  'rank.changeNickname': { en: 'Change', ko: '닉네임 변경', ja: '変更', 'zh-Hant': '變更' },
  'rank.nicknameEmpty':  { en: '⚠️ Please enter a nickname.', ko: '⚠️ 닉네임을 입력해 주세요.', ja: '⚠️ ニックネームを入力してください。', 'zh-Hant': '⚠️ 請輸入暱稱。' },
  'rank.nicknameTooLong':{ en: '⚠️ Nickname must be 15 characters or fewer.', ko: '⚠️ 닉네임은 최대 15자까지 가능합니다.', ja: '⚠️ ニックネームは15文字以内で入力してください。', 'zh-Hant': '⚠️ 暱稱最多 15 個字。' },
  'rank.saving':         { en: 'Saving...', ko: '변경 완료 처리 중...', ja: '保存中...', 'zh-Hant': '儲存中...' },
  'rank.nicknameChangedRegistered': { en: '✅ Nickname changed and best record ({n} waves) registered!', ko: '✅ 닉네임이 변경되고 최고 기록({n}웨이브)이 랭킹에 등록되었습니다!', ja: '✅ ニックネームを変更し、最高記録（ウェーブ {n}）を登録しました！', 'zh-Hant': '✅ 已變更暱稱並登錄最高紀錄（第 {n} 波）！' },
  'rank.deviceNicknameSet': { en: '✅ Device nickname set successfully!', ko: '✅ 기기 닉네임이 성공적으로 설정되었습니다!', ja: '✅ 端末のニックネームを設定しました！', 'zh-Hant': '✅ 已成功設定裝置暱稱！' },
  'rank.serverTimeout':  { en: 'Server connection timed out', ko: '서버 연결 시간 초과', ja: 'サーバー接続がタイムアウトしました', 'zh-Hant': '伺服器連線逾時' },
  'rank.serverUnavailable': { en: 'Could not connect to the server', ko: '서버에 연결할 수 없습니다', ja: 'サーバーに接続できません', 'zh-Hant': '無法連線到伺服器' },
  'rank.registerFailed': { en: '❌ Registration failed: {msg}', ko: '❌ 서버 등록 실패: {msg}', ja: '❌ サーバー登録に失敗: {msg}', 'zh-Hant': '❌ 伺服器登錄失敗: {msg}' },
  'rank.unknownError':   { en: 'Unknown error', ko: '알 수 없는 오류', ja: '不明なエラー', 'zh-Hant': '不明錯誤' },
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
