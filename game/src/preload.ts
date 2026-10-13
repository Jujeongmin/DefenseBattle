// ============================================================
//  로딩 화면에서 모든 에셋을 미리 받는다 (그림·효과음·배경음악·글꼴)
//   그림은 assets.ts 캐시에 같은 Image 로 올려 두고, 소리는 브라우저 캐시에 받아 둔다.
//   한 파일이 실패해도 멈추지 않는다 (그 파일은 나중에 처음 쓸 때 다시 받는다).
// ============================================================
import all from 'virtual:public-assets';
import { lang } from './i18n';
import { warmImage } from './assets';

/** 지금 언어에 필요 없는 글꼴(일본어·중국어 픽셀 글꼴)은 빼고 받는다 */
const FONT_FOR: Record<string, string> = { ja: 'FusionPixel-ja', 'zh-Hans': 'FusionPixel-zh-hans', 'zh-Hant': 'FusionPixel-zh-hant' };
const files = all.filter((f) => !f.includes('FusionPixel-') || f.includes(`${FONT_FOR[lang] ?? '-none-'}.`));

/** 동시에 받는 개수 */
const PARALLEL = 8;

export async function preloadEverything(onProgress: (done: number, total: number) => void): Promise<void> {
  const total = files.length;
  let done = 0;
  let next = 0;
  const one = async (f: string): Promise<void> => {
    try {
      if (f.endsWith('.png')) await warmImage(f);
      else if (f.endsWith('.woff2')) {
        // 글꼴 파일 → CSS 의 글꼴 이름 (style.css @font-face 와 같게)
        const family = f.includes('FusionPixel-ja') ? 'FusionPixel-ja' : f.includes('zh-hans') ? 'FusionPixel-hans' : f.includes('zh-hant') ? 'FusionPixel-hant' : 'Galmuri11';
        await document.fonts?.load(`${f.includes('Bold') ? 700 : 400} 16px '${family}'`, family === 'Galmuri11' ? '가A' : '漢字');
      }
      else await fetch(f).then((r) => r.arrayBuffer());
    } catch { /* 실패해도 계속 */ }
    done += 1;
    onProgress(done, total);
  };
  await Promise.all(Array.from({ length: PARALLEL }, async () => {
    while (next < total) await one(files[next++]);
  }));
}
