"""로비 상자 칸·상자 공개 화면에 쓸 등급별 닫힌 상자 그림 5종을 만든다.

game/public/ui/chest.png(16x16 픽셀을 8배 확대한 나무 상자)의 나무 부분과 장식 부분을 나눠
상자마다 다른 색 단계로 바꾸고, 등급이 오를수록 보석·반짝임·빛 번짐·빛줄기를 더한다.
  나무: 나무 + 철 장식 (수수함)
  은:   강철 몸체 + 은 장식 + 리벳
  금:   나무 + 금 장식 + 붉은 보석 + 반짝임
  마법: 보라 몸체 + 금 장식 + 하늘색 보석 + 보라 빛 번짐
  전설: 금 몸체 + 흰 금 장식 + 붉은 보석 + 금빛 번짐 + 빛줄기
실행: python tools/build_chest_icons.py  → game/public/ui/chests/{wood,silver,gold,magic,legend}.png (160x160)
"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'game/public/ui/chest.png'
OUT = ROOT / 'game/public/ui/chests'
PX = 8          # 원본 한 칸 = 8px
PAD = 16        # 빛 번짐이 들어갈 바깥 여백 (원본 128 → 160)

Ramp = list[tuple[int, int, int]]

WOOD_BODY = None  # 원래 색 그대로
GOLD_TRIM = None
RAMPS: dict[str, dict] = {
    'wood': {'body': WOOD_BODY, 'trim': [(55, 55, 62), (92, 92, 104), (140, 140, 150), (190, 190, 200)]},
    'silver': {'body': [(62, 72, 88), (98, 112, 130), (138, 152, 170), (182, 196, 212)],
               'trim': [(120, 130, 142), (184, 192, 202), (226, 232, 240), (255, 255, 255)], 'rivets': True},
    'gold': {'body': WOOD_BODY, 'trim': GOLD_TRIM, 'gem': (230, 40, 40), 'sparkle': 2},
    'magic': {'body': [(52, 24, 92), (88, 44, 146), (124, 76, 198), (168, 122, 236)], 'trim': GOLD_TRIM,
              'gem': (110, 230, 255), 'sparkle': 3, 'glow': (176, 107, 255)},
    'legend': {'body': [(168, 92, 0), (218, 146, 8), (248, 196, 40), (255, 232, 120)],
               'trim': [(255, 214, 110), (255, 236, 180), (255, 250, 222), (255, 255, 255)],
               'gem': (255, 50, 60), 'sparkle': 4, 'glow': (255, 190, 60), 'rays': True},
}


def is_trim(c: tuple[int, int, int]) -> bool:
    """금색 장식 (채도 높은 노랑·주황). 나머지 갈색은 나무"""
    r, g, b = c
    return r > 150 and b < 120 and (r - b) > 120 and not (110 < r < 215 and 60 < g < 165 and b > 40)


def lum(c: tuple[int, int, int]) -> float:
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def ramp_at(ramp: Ramp, t: float) -> tuple[int, int, int]:
    i = max(0, min(len(ramp) - 1, round(t * (len(ramp) - 1))))
    return ramp[i]


def recolor(grid: Image.Image, spec: dict) -> Image.Image:
    px = grid.load()
    w, h = grid.size
    groups: dict[str, list[float]] = {'trim': [], 'body': []}
    cells = []
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0 or max(r, g, b) < 20:
                continue  # 투명·외곽선
            kind = 'trim' if is_trim((r, g, b)) else 'body'
            groups[kind].append(lum((r, g, b)))
            cells.append((x, y, kind, lum((r, g, b))))
    lo = {k: min(v) if v else 0 for k, v in groups.items()}
    hi = {k: max(v) if v else 1 for k, v in groups.items()}
    out = grid.copy()
    op = out.load()
    for x, y, kind, l in cells:
        ramp = spec.get(kind)
        if ramp is None:
            continue
        t = (l - lo[kind]) / max(1e-6, hi[kind] - lo[kind])
        op[x, y] = (*ramp_at(ramp, t), 255)
    return out


def build(kind: str, spec: dict) -> Image.Image:
    src = Image.open(SRC).convert('RGBA')
    grid = src.resize((src.width // PX, src.height // PX), Image.NEAREST)
    grid = recolor(grid, spec)
    g = grid.load()
    w, h = grid.size
    # 은: 몸체 모서리 리벳
    if spec.get('rivets'):
        for (x, y) in [(2, 7), (w - 3, 7), (2, h - 3), (w - 3, h - 3)]:
            if g[x, y][3]:
                g[x, y] = (240, 244, 250, 255)
    # 보석: 자물쇠 가운데 열쇠 구멍(원본 16x16 의 (7,9)~(8,9)) 자리에, 왼쪽 칸은 밝게 (빛 반사)
    if spec.get('gem'):
        gem = spec['gem']
        light = tuple(min(255, int(c * 0.5 + 255 * 0.5)) for c in gem)
        g[7, 9] = (*light, 255)
        g[8, 9] = (*gem, 255)
    big = grid.resize((w * PX, h * PX), Image.NEAREST)
    canvas = Image.new('RGBA', (big.width + PAD * 2, big.height + PAD * 2), (0, 0, 0, 0))
    # 빛줄기 (전설)
    if spec.get('rays'):
        rays = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(rays)
        cx, cy = canvas.width / 2, canvas.height / 2
        for i in range(12):
            a0 = i * math.tau / 12
            pts = [(cx, cy), (cx + math.cos(a0 - 0.09) * 90, cy + math.sin(a0 - 0.09) * 90), (cx + math.cos(a0 + 0.09) * 90, cy + math.sin(a0 + 0.09) * 90)]
            d.polygon(pts, fill=(255, 226, 120, 120))
        canvas.alpha_composite(rays.filter(ImageFilter.GaussianBlur(2)))
    # 빛 번짐 (마법·전설): 상자 모양을 흐리게 깔고 그 위에 상자
    if spec.get('glow'):
        sil = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
        mask = big.getchannel('A')
        tint = Image.new('RGBA', big.size, (*spec['glow'], 255))
        sil.paste(tint, (PAD, PAD), mask)
        glow = sil.filter(ImageFilter.GaussianBlur(8))
        for _ in range(3):
            canvas.alpha_composite(glow)
    canvas.alpha_composite(big, (PAD, PAD))
    # 반짝임: 4방향 별 (등급이 높을수록 많이)
    n = spec.get('sparkle', 0)
    if n:
        d = ImageDraw.Draw(canvas)
        spots = [(PAD + 18, PAD + 14), (canvas.width - PAD - 14, PAD + 30), (PAD + 10, canvas.height - PAD - 30), (canvas.width - PAD - 22, canvas.height - PAD - 12)]
        for (x, y) in spots[:n]:
            for r, col in ((7, (255, 255, 255, 255)), (3, (255, 255, 200, 255))):
                d.rectangle([x - 1, y - r, x + 1, y + r], fill=col)
                d.rectangle([x - r, y - 1, x + r, y + 1], fill=col)
    return canvas


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    for kind, spec in RAMPS.items():
        build(kind, spec).save(OUT / f'{kind}.png', optimize=True)
    print('ok', ', '.join(RAMPS))
