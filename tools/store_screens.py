"""스토어 스크린샷 (16:9, 1280x720, 1MB 이하) - 실제 게임 화면 캡처를 게임 풍 배경 위에 놓고 짧은 문구를 붙인다.

캡처(세로 폰 화면, 750x1624)는 직접 플레이하며 찍은 것. 실행:
  python tools/store_screens.py <캡처 폴더> <폰트 ttf>
출력: launch/store/screenshots/1.png ~ 4.png (1MB 넘으면 같은 이름 .jpg)
"""
from __future__ import annotations

import io
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'launch/store/screenshots'
W, H = 1280, 720
SHOTS = Path(sys.argv[1])
FONT = sys.argv[2]

# (출력 번호, [캡처들], 제목, 부제, 폰 위치 'left'|'right')
PAGES = [
    (1, ['field'], '소환하고, 합쳐서, 막아라', '같은 유닛 3개를 합치면 한 등급 위로\n일반부터 태초까지 6등급', 'left'),
    (2, ['throw'], '몹을 던져라!', '카드를 끌어 상대 전장에 몹을 떨어뜨리고\n상대의 빈 구멍을 노리세요', 'right'),
    (3, ['reveal', 'deck'], '유닛 32종 수집', '상자와 뽑기로 카드를 모으고\n중복 카드로 레벨업', 'left'),
    (4, ['lobby'], '아레나를 정복하라', '이기면 상자! 트로피를 올려\n6단계 아레나와 랭킹에 도전', 'right'),
]


def background() -> Image.Image:
    tile = Image.open(ROOT / 'game/public/tiles/grass_bg.png').convert('RGB')
    s = max(1, 96 // max(1, tile.width))
    tile = tile.resize((tile.width * s, tile.height * s), Image.NEAREST)
    bg = Image.new('RGB', (W, H))
    for y in range(0, H, tile.height):
        for x in range(0, W, tile.width):
            bg.paste(tile, (x, y))
    bg = bg.filter(ImageFilter.GaussianBlur(2))
    dark = Image.new('RGB', (W, H), (24, 16, 10))
    return Image.blend(bg, dark, 0.55)


def phone(name: str, h: int) -> Image.Image:
    im = Image.open(SHOTS / f'{name}.jpg').convert('RGB')
    w = round(im.width * h / im.height)
    im = im.resize((w, h), Image.LANCZOS)
    pad = 10
    frame = Image.new('RGBA', (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(frame)
    d.rounded_rectangle((0, 0, frame.width - 1, frame.height - 1), radius=22, fill=(42, 29, 22, 255), outline=(255, 207, 63, 255), width=3)
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h - 1), radius=14, fill=255)
    frame.paste(im, (pad, pad), mask)
    return frame


def text(d: ImageDraw.ImageDraw, xy: tuple[int, int], s: str, size: int, fill, anchor='mm', spacing=10) -> None:
    f = ImageFont.truetype(FONT, size)
    d.multiline_text(xy, s, font=f, fill=fill, anchor=anchor, align='center', spacing=spacing,
                     stroke_width=max(2, size // 12), stroke_fill=(30, 18, 10))


def save(img: Image.Image, n: int) -> Path:
    p = OUT / f'{n}.png'
    img.save(p, optimize=True)
    if p.stat().st_size > 1_000_000:
        p.unlink()
        p = OUT / f'{n}.jpg'
        img.save(p, quality=90, optimize=True)
    return p


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    for n, shots, title, sub, side in PAGES:
        img = background().convert('RGBA')
        phones = [phone(s, 670) for s in shots]
        total = sum(p.width for p in phones) + 30 * (len(phones) - 1)
        x0 = 90 if side == 'left' else W - 90 - total
        for p in phones:
            shadow = Image.new('RGBA', p.size, (0, 0, 0, 120))
            img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(8)), (x0 + 8, (H - p.height) // 2 + 10))
            img.alpha_composite(p, (x0, (H - p.height) // 2))
            x0 += p.width + 30
        # 문구: 폰 반대쪽 가운데
        cx = (90 + total + W) // 2 if side == 'left' else (W - 90 - total) // 2
        d = ImageDraw.Draw(img)
        text(d, (cx, H // 2 - 70), title, 58, (255, 214, 90))
        text(d, (cx, H // 2 + 40), sub, 28, (255, 244, 220))
        text(d, (cx, H - 60), '디펜스 배틀 · DEFENSE BATTLE', 22, (220, 200, 160))
        p = save(img.convert('RGB'), n)
        print(p.name, p.stat().st_size)
