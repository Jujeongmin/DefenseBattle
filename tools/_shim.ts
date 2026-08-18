// Node 에서 시뮬레이터를 돌리기 위한 최소 브라우저 셤.
// meta.ts -> @agent8/gameserver 가 모듈 로드 시점에 localStorage 를 건드려서,
// 이 파일을 다른 import 보다 먼저 import 해야 한다(ESM 은 import 순서대로 평가).
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
  key: () => null,
  length: 0,
};
(globalThis as any).addEventListener = () => {};
(globalThis as any).removeEventListener = () => {};
(globalThis as any).window = globalThis;
(globalThis as any).location = { search: '', href: 'http://localhost/', hostname: 'localhost', pathname: '/' };
(globalThis as any).document = { documentElement: {}, addEventListener: () => {}, createElement: () => ({ style: {}, setAttribute: () => {}, appendChild: () => {} }) };


export {};
