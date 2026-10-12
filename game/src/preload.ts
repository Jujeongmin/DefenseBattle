// ============================================================
//  로딩 화면에서 모든 에셋을 미리 받는다 (그림·효과음·배경음악·글꼴)
//   그림은 assets.ts 캐시에 같은 Image 로 올려 두고, 소리는 브라우저 캐시에 받아 둔다.
//   한 파일이 실패해도 멈추지 않는다 (그 파일은 나중에 처음 쓸 때 다시 받는다).
// ============================================================
import files from 'virtual:public-assets';
import { warmImage } from './assets';

/** 동시에 받는 개수 */
const PARALLEL = 8;

export async function preloadEverything(onProgress: (done: number, total: number) => void): Promise<void> {
  const total = files.length;
  let done = 0;
  let next = 0;
  const one = async (f: string): Promise<void> => {
    try {
      if (f.endsWith('.png')) await warmImage(f);
      else if (f.endsWith('.woff2')) await document.fonts?.load(`${f.includes('Bold') ? 700 : 400} 16px Galmuri11`);
      else await fetch(f).then((r) => r.arrayBuffer());
    } catch { /* 실패해도 계속 */ }
    done += 1;
    onProgress(done, total);
  };
  await Promise.all(Array.from({ length: PARALLEL }, async () => {
    while (next < total) await one(files[next++]);
  }));
}
