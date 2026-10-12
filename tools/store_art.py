"""스토어 썸네일(1:1)과 그래픽(1024x578) - Codex 가 그린 그림(launch/store/*_raw.png) 위에 로고 글자를 올린다.
글자는 그림 생성기가 깨뜨리기 쉬워 게임 픽셀 폰트(Galmuri11 Bold)로 직접 쓴다.
실행: python tools/store_art.py <폰트 ttf>  → launch/store/thumbnail.png, graphic_1024x578.png (1MB 넘으면 .jpg)
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent / 'launch/store'
FONT = sys.argv[1]


def logo(img: Image.Image, cx: int, top: int, size: int) -> None:
    d = ImageDraw.Draw(img)
    big = ImageFont.truetype(FONT, size)
    small = ImageFont.truetype(FONT, size * 38 // 100)
    # 그림자 → 테두리 → 글자 (게임 타이틀과 같은 노랑)
    d.text((cx + size // 14, top + size // 14), 'MOB TOSS', font=big, fill=(40, 20, 10), anchor='mt',
           stroke_width=size // 9, stroke_fill=(40, 20, 10))
    d.text((cx, top), 'MOB TOSS', font=big, fill=(255, 214, 64), anchor='mt',
           stroke_width=size // 10, stroke_fill=(52, 28, 14))
    # 한글 이름: 아래 가운데 어두운 판 위 (위쪽은 날아가는 몹과 겹친다)
    x0, y0, x1, y1 = d.textbbox((cx, img.height - size // 2), '몹 토스', font=small, anchor='mb')
    pad = size // 6
    d.rounded_rectangle((x0 - pad * 2, y0 - pad, x1 + pad * 2, y1 + pad), radius=pad, fill=(42, 26, 16), outline=(255, 214, 64), width=max(2, size // 30))
    d.text((cx, img.height - size // 2), '몹 토스', font=small, fill=(255, 250, 235), anchor='mb')


def save(img: Image.Image, name: str) -> Path:
    p = ROOT / f'{name}.png'
    img.save(p, optimize=True)
    if p.stat().st_size > 1_000_000:
        p.unlink()
        p = ROOT / f'{name}.jpg'
        img.save(p, quality=92, optimize=True)
    return p


if __name__ == '__main__':
    thumb = Image.open(ROOT / 'thumb_raw.png').convert('RGB').resize((1024, 1024), Image.LANCZOS)
    logo(thumb, 512, 46, 132)
    print(save(thumb, 'thumbnail'))

    g = Image.open(ROOT / 'graphic_raw.png').convert('RGB')
    w = g.width
    h = round(w * 578 / 1024)
    g = g.crop((0, 20, w, 20 + h)).resize((1024, 578), Image.LANCZOS)
    logo(g, 512, 26, 84)
    print(save(g, 'graphic_1024x578'))
