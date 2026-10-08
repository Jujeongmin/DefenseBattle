import { defineConfig } from 'vite';

// Verse8(Agent8) 프로젝트 구조: index.html 이 game/ 폴더 안에 위치한다.
// 따라서 Vite 의 root 를 game/ 으로 지정하고, 빌드 산출물은 상위 dist/ 로 내보낸다.
export default defineConfig({
  root: 'game',
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
