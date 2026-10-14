// ============================================================
//  닉네임 비속어 거르기 - 클라이언트(저장 전 안내)와 서버(cleanNick, 최종 판정)가 같이 쓴다.
//  띄어쓰기·기호·숫자 끼워 넣기(시1발, f.u.c.k), 전각 문자, 같은 글자 반복(fuuuck), 숫자 치환(5h1t),
//  가타카나/히라가나 차이를 정규화한 뒤 금칙어가 들어 있는지 본다.
// ============================================================

const BANNED: string[] = [
  // 한국어
  '시발', '씨발', '씨바', '씨빨', '시빨', '씨팔', '시팔', '쓰바', '씹', '썅', '쌍년', '쌍놈', '병신', '븅신', '빙신', '등신',
  '좆', '좃', '좇', '존나', '졸라', '지랄', '개새', '개색', '개세끼', '개쉐', '새끼', '쉐끼', '섹스', '보지', '자지',
  '니미', '느금', '니애미', '니엄', '니어미', '느개비', '니기미', '엠창', '앰창', '창녀', '미친', '미췬', '또라이', '닥쳐',
  '염병', '후장', '딸딸이', '자위', '강간', '성폭', '야동', '한남충', '김치녀', '메갈', '일베', '틀딱', '찐따', '꼴통',
  'ㅅㅂ', 'ㅆㅂ', 'ㅂㅅ', 'ㅄ', 'ㅈㄹ', 'ㅈㄴ', 'ㅁㅊ', 'ㅅㄲ', 'ㅗ', 'ㅈ같',
  // English
  'fuck', 'fck', 'shit', 'bitch', 'asshole', 'bastard', 'cunt', 'dick', 'pussy', 'porn', 'sex', 'nigg',
  'faggot', 'retard', 'whore', 'slut', 'nazi', 'hitler', 'penis', 'vagina', 'dildo', 'boob', 'tits',
  'wtf', 'stfu', 'cocksuck', 'jerkoff',
  // 日本語 (히라가나로 정규화해서 비교)
  'ちんこ', 'ちんぽ', 'まんこ', 'せっくす', 'しね', '死ね', 'ころす', '殺す', 'きちがい', '基地外', '気違い', 'くそ',
  'ふぁっく', 'れいぷ', '売春', 'やりまん',
  // 中文 (简体·繁體)
  '操你', '肏', '妈的', '媽的', '傻逼', '傻b', '煞笔', '草泥马', '草泥馬', '你妈', '你媽', '婊子', '贱人', '賤人',
  '鸡巴', '雞巴', '屌', '狗日', '王八蛋', '去死', '他妈', '他媽', '日你', '尼玛', '尼瑪', '强奸', '強姦',
];

/** 숫자·기호로 글자를 흉내 낸 것 (5h1t, @ss) */
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', '@': 'a', '$': 's', '!': 'i', '+': 't' };

/** 전각→반각, 소문자, 가타카나→히라가나 (NFKC 는 한글 자모 ㅅㅂ 도 다른 코드로 바꾸므로 금칙어도 같은 방식으로 맞춘다) */
function norm(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}
const BANNED_N = BANNED.map(norm);

function variants(name: string): string[] {
  const base = norm(name);
  const lettersOnly = (s: string) => s.replace(/[^\p{L}]/gu, '');
  const plain = lettersOnly(base);                                              // 시1발 → 시발, f.u.c.k → fuck
  const leet = lettersOnly(base.replace(/[0-9@$!+]/g, (c) => LEET[c] ?? c));    // 5h1t → shit
  const squeeze = (s: string) => s.replace(/(.)\1+/gu, '$1');                    // fuuuck → fuck
  return [plain, leet, squeeze(plain), squeeze(leet)];
}

/** 쓰면 안 되는 닉네임인가 */
export function isBadNick(name: string): boolean {
  const vs = variants(name);
  return BANNED_N.some((w) => vs.some((v) => v.includes(w)));
}
