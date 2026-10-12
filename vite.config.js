import { defineConfig } from 'vite';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// 로딩 화면에서 미리 받을 파일 목록 (game/public 의 그림·소리·글꼴) - import list from 'virtual:public-assets'
function publicAssetList() {
  const id = 'virtual:public-assets';
  const resolved = '\0' + id;
  return {
    name: 'public-asset-list',
    resolveId: (i) => (i === id ? resolved : null),
    load(i) {
      if (i !== resolved) return null;
      const root = 'game/public';
      const out = [];
      const walk = (d) => {
        for (const f of readdirSync(d)) {
          const p = join(d, f);
          if (statSync(p).isDirectory()) walk(p);
          else if (/\.(png|mp3|woff2)$/i.test(f)) out.push(relative(root, p).split('\\').join('/'));
        }
      };
      walk(root);
      return `export default ${JSON.stringify(out.sort())};`;
    },
  };
}

// Verse8(Agent8) 프로젝트 구조: index.html 이 game/ 폴더 안에 위치한다.
// 따라서 Vite 의 root 를 game/ 으로 지정하고, 빌드 산출물은 상위 dist/ 로 내보낸다.
export default defineConfig({
  root: 'game',
  plugins: [publicAssetList()],
  base: './',
  publicDir: 'public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    host: true,
  },
});
