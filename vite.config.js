import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Verse8(Agent8) 프로젝트 구조: index.html 이 game/ 폴더 안에 위치한다.
// 따라서 Vite 의 root 를 game/ 으로 지정하고, 빌드 산출물은 상위 dist/ 로 내보낸다.
export default defineConfig(({ command }) => ({
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
  resolve: {
    // dev(serve)에서만 @agent8/gameserver 를 로컬 스텁으로 대체해 프리뷰를 띄운다.
    // 프로덕션 빌드(command==='build')에는 alias 를 걸지 않으므로 Verse8 의 실제 SDK 를 그대로 쓴다.
    alias: command === 'serve'
      ? {
          '@agent8/gameserver': fileURLToPath(new URL('./game/src/devGameServerStub.ts', import.meta.url)),
          '@verse8/ads': fileURLToPath(new URL('./game/src/devVerse8AdsStub.ts', import.meta.url)),
        }
      : {},
  },
}));
