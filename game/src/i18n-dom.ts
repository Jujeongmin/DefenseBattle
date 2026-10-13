// index.html 의 고정 문구 번역 (브라우저 전용 - i18n.ts 는 서버 번들에서도 쓰이므로 분리)
import { tl, lang } from './i18n';

/** data-i18n 속성(원문 한국어)이 달린 요소를 지금 언어로 바꾸고 <html lang> 을 맞춘다 (글꼴 선택에 쓰임) */
export function translateStatic(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => { el.innerHTML = tl(el.dataset.i18n!); });
  document.documentElement.lang = lang;
}
