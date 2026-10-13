// ============================================================
//  다국어 - 한국어 원문을 키로 쓰는 번역 표 (i18n/*.ts)
//   tl('보석 {0}개', n) → 지금 언어의 번역 (없으면 한국어 원문). {0},{1}… 은 순서대로 인자로 바뀐다.
//   언어는 이 모듈을 처음 불러올 때 한 번 정한다 (저장값 > 기기 언어 > 영어). 바꾸면 새로고침해 전체에 반영.
//   서버 번들(게임 규칙 공유)에서는 브라우저가 없으므로 한국어.
// ============================================================
import en from './i18n/en';
import ja from './i18n/ja';
import zhHans from './i18n/zh-hans';
import zhHant from './i18n/zh-hant';

export type Lang = 'ko' | 'en' | 'ja' | 'zh-Hans' | 'zh-Hant';
/** 설정 화면에 보일 언어 이름 (각 언어로) */
export const LANGS: { id: Lang; name: string }[] = [
  { id: 'ko', name: '한국어' },
  { id: 'en', name: 'English' },
  { id: 'ja', name: '日本語' },
  { id: 'zh-Hans', name: '简体中文' },
  { id: 'zh-Hant', name: '繁體中文' },
];
const LANG_KEY = 'randomdefense.lang.v1';
/** 서버 번들(브라우저 없음)에서도 타입 검사가 되도록 브라우저 객체는 globalThis 에서 꺼낸다 */
const g = globalThis as unknown as {
  window?: unknown;
  navigator?: { language?: string; languages?: readonly string[] };
  localStorage?: { getItem(k: string): string | null; setItem(k: string, v: string): void };
  location?: { reload(): void };
};
const DICTS: Partial<Record<Lang, Record<string, string>>> = { en, ja, 'zh-Hans': zhHans, 'zh-Hant': zhHant };

/** 기기 언어 → 게임 언어 (없는 언어면 영어) */
function fromDevice(): Lang {
  const nav = g.navigator;
  const list = nav ? (nav.languages?.length ? nav.languages : [nav.language]) : [];
  for (const raw of list) {
    const l = String(raw || '').toLowerCase();
    if (l.startsWith('ko')) return 'ko';
    if (l.startsWith('ja')) return 'ja';
    if (l.startsWith('zh')) return /hant|tw|hk|mo/.test(l) ? 'zh-Hant' : 'zh-Hans';
    if (l.startsWith('en')) return 'en';
  }
  return 'en';
}

function pick(): Lang {
  if (!g.window) return 'ko'; // 서버 번들
  try {
    const saved = (g.localStorage?.getItem(LANG_KEY) ?? null) as Lang | null;
    if (saved && LANGS.some((l) => l.id === saved)) return saved;
  } catch { /* 저장소 막힘 */ }
  return fromDevice();
}

export const lang: Lang = pick();
const dict = DICTS[lang];

/**
 * 번역 (없으면 한국어 원문). {0},{1}… 자리에 인자를 넣는다.
 * 같은 한국어가 뜻이 다를 때는 키 뒤에 '@@문맥'을 붙인다 (예: '골드@@tier' = 아레나 등급). 한국어로는 문맥 표시를 떼고 보인다.
 */
export function tl(ko: string, ...args: unknown[]): string {
  const s = (dict && dict[ko]) || ko.split('@@')[0];
  return args.length ? s.replace(/\{(\d+)\}/g, (m, i) => (Number(i) < args.length ? String(args[Number(i)]) : m)) : s;
}

/** 언어 바꾸기 - 저장하고 새로고침 (모든 화면·데이터 이름을 다시 만들기 위해) */
export function setLang(l: Lang): void {
  try { g.localStorage?.setItem(LANG_KEY, l); } catch { /* 무시 */ }
  g.location?.reload();
}
