// ============================================================
//  스프라이트 외곽선 - 같은 그림의 몹이라도 누가 보낸 몹인지 한눈에 (나 = 파랑, 상대 = 빨강)
//  시트 전체에 한 번 외곽선을 입혀 캐시한다 (ctx.filter 는 사파리 미지원).
// ============================================================

export const SIDE_COLOR = { me: '#3fa9ff', opp: '#ff3b3b' } as const;

const cache = new Map<string, HTMLCanvasElement>();

/** img 시트에 color 외곽선(2px)을 두른 캔버스. 아직 로드 전이면 null */
export function outlined(img: CanvasImageSource, key: string, color: string): HTMLCanvasElement | null {
  const k = `${key}|${color}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const el = img as HTMLImageElement;
  const w = el.naturalWidth || (img as HTMLCanvasElement).width, h = el.naturalHeight || (img as HTMLCanvasElement).height;
  if (!w || !h) return null;
  // 1) 그림 모양 그대로 단색 마스크
  const mask = document.createElement('canvas');
  mask.width = w; mask.height = h;
  const m = mask.getContext('2d')!;
  m.drawImage(img, 0, 0);
  m.globalCompositeOperation = 'source-in';
  m.fillStyle = color;
  m.fillRect(0, 0, w, h);
  // 2) 마스크를 사방으로 1px 밀어 찍고 그 위에 원래 그림
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const o = out.getContext('2d')!;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) o.drawImage(mask, dx, dy);
  o.drawImage(img, 0, 0);
  cache.set(k, out);
  return out;
}
