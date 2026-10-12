/// <reference types="vite/client" />

declare module 'virtual:public-assets' {
  /** game/public 안의 png·mp3·woff2 경로 (base 기준 상대 경로) */
  const files: string[];
  export default files;
}
