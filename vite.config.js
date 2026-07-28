import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Verse8(Agent8) 프로젝트 구조: index.html 이 game/ 폴더 안에 위치한다.
// 따라서 Vite 의 root 를 game/ 으로 지정하고, 빌드 산출물은 상위 dist/ 로 내보낸다.
export default defineConfig(({ command }) => ({
  root: 'game',
  base: './',
  publicDir: 'public',
  // root 가 game/ 이라 Vite 는 기본적으로 game/.env 를 찾지만, Verse8 이 관리하는
  // .env(VITE_AGENT8_VERSE 등)는 프로젝트 루트에 있다. 루트에서 .env 를 읽도록 지정하지
  // 않으면 VITE_AGENT8_VERSE 가 클라 번들에 안 박혀 서버 연결이 "default" verse 로
  // 폴백 → 연결 timeout 이 발생한다.
  envDir: fileURLToPath(new URL('.', import.meta.url)),
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      external: ['@verse8/platform/vanilla'],
    },
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
          '@verse8/platform/vanilla': fileURLToPath(new URL('./game/src/devVerse8PlatformStub.ts', import.meta.url)),
        }
      : {},
  },
}));
