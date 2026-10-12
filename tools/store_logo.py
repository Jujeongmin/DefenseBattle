"""스토어 로고 시안 - 손으로 찍은 듯한 픽셀 글자.

부드러운 외곽선 글자(벡터 폰트를 크게 그린 것)는 'AI 같다'는 평을 받아서,
작은 크기(원래 픽셀 그리드)로 글자를 찍고 → 1px 테두리·윗면 밝은 띠·아래 그림자를 픽셀 단위로 넣고 →
정수 배로 키운다 (게임 스프라이트와 같은 방식).
  A: 픽셀 글자만     B: 게임 리본(UI 그대로) 위 한글 이름     C: 나무 간판 + 고블린이 매달림
실행: python tools/store_logo.py <폰트 ttf> [A|B|C]  → 시안 비교 이미지 또는 thumbnail 저장
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
STORE = ROOT / 'launch/store'
FONT = sys.argv[1]
INK = (52, 28, 14, 255)


def pixel_word(text: str, px: int, scale: int, top=(255, 236, 120), mid=(255, 196, 40), low=(232, 120, 24)) -> Image.Image:
    """px 크기(폰트 원래 그리드)로 찍고 테두리·띠를 넣은 뒤 scale 배 확대"""
    f = ImageFont.truetype(FONT, px)
    l, t, r, b = f.getbbox(text)
    w, h = r - l + 6, b - t + 7
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).text((3 - l, 3 - t), text, font=f, fill=255)
    mask = mask.point(lambda v: 255 if v > 110 else 0)  # 안티에일리어싱 제거 → 딱 떨어지는 픽셀
    # 1px 테두리 (상하좌우 + 대각)
    outline = Image.new('L', (w, h), 0)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            outline = ImageChops.lighter(outline, ImageChops.offset(mask, dx, dy))
    # 아래로 2px 두꺼운 그림자 (입체감)
    shadow = ImageChops.lighter(ImageChops.offset(outline, 0, 1), ImageChops.offset(outline, 0, 2))
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    img.paste((30, 14, 6, 255), (0, 0), shadow)
    img.paste(INK, (0, 0), outline)
    # 글자 면: 위 1/3 밝게, 가운데, 아래 1/3 진하게 (픽셀 줄 단위)
    gy0, gy1 = 3, h - 4
    for y in range(h):
        k = (y - gy0) / max(1, gy1 - gy0)
        col = top if k < 0.34 else mid if k < 0.67 else low
        row = Image.new('RGBA', (w, 1), (*col, 255))
        img.paste(row, (0, y), mask.crop((0, y, w, y + 1)))
    # 글자 위 반짝임 1px
    hi = ImageChops.subtract(mask, ImageChops.offset(mask, 0, 1))
    img.paste((255, 255, 230, 255), (0, 0), hi)
    return img.resize((w * scale, h * scale), Image.NEAREST)


def nine(src: str, w: int, h: int, edge: int) -> Image.Image:
    """9-slice 프레임 늘리기"""
    im = Image.open(ROOT / f'game/public/ui/frame/{src}.png').convert('RGBA')
    W, H = im.size
    out = Image.new('RGBA', (w, h))
    xs = [(0, edge, 0, edge), (edge, W - edge, edge, w - edge), (W - edge, W, w - edge, w)]
    ys = [(0, edge, 0, edge), (edge, H - edge, edge, h - edge), (H - edge, H, h - edge, h)]
    for sx0, sx1, dx0, dx1 in xs:
        for sy0, sy1, dy0, dy1 in ys:
            if dx1 > dx0 and dy1 > dy0:
                out.paste(im.crop((sx0, sy0, sx1, sy1)).resize((dx1 - dx0, dy1 - dy0), Image.NEAREST), (dx0, dy0))
    return out


def variant(base: Image.Image, kind: str) -> Image.Image:
    img = base.convert('RGBA').copy()
    W, H = img.size
    word = pixel_word('MOB TOSS', 22, 6)
    kr = pixel_word('몹 토스', 22, 3, top=(255, 255, 255), mid=(255, 248, 230), low=(225, 208, 182))
    bottom = H - kr.height - 30  # 한글 이름은 아래 (위쪽은 날아가는 고블린 자리)
    if kind == 'A':
        img.alpha_composite(word, ((W - word.width) // 2, 40))
        plate = Image.new('RGBA', (kr.width + 60, kr.height + 26), (0, 0, 0, 0))
        ImageDraw.Draw(plate).rectangle((0, 0, plate.width - 1, plate.height - 1), fill=(42, 26, 16, 235), outline=(255, 196, 40, 255), width=6)
        img.alpha_composite(plate, ((W - plate.width) // 2, bottom - 13))
        img.alpha_composite(kr, ((W - kr.width) // 2, bottom))
    elif kind == 'B':
        img.alpha_composite(word, ((W - word.width) // 2, 40))
        rib = nine('ribbon_red', kr.width + 220, 132, 48)
        ry = H - rib.height - 18
        img.alpha_composite(rib, ((W - rib.width) // 2, ry))
        img.alpha_composite(kr, ((W - kr.width) // 2, ry + (rib.height - kr.height) // 2 - 10))
    else:  # C: 나무 간판 + 고블린이 간판에 매달림
        sign = nine('wood', word.width + 120, word.height + 96, 64)
        x0, y0 = (W - sign.width) // 2, 22
        img.alpha_composite(sign, (x0, y0))
        img.alpha_composite(word, (x0 + 60, y0 + 40))
        gob = Image.open(ROOT / 'game/public/sprites/Mob_Orc_0.png').convert('RGBA').crop((32, 0, 64, 32)).resize((160, 160), Image.NEAREST)
        img.alpha_composite(gob, (x0 - 40, y0 + sign.height - 70))
        plate = Image.new('RGBA', (kr.width + 60, kr.height + 26), (0, 0, 0, 0))
        ImageDraw.Draw(plate).rectangle((0, 0, plate.width - 1, plate.height - 1), fill=(42, 26, 16, 235), outline=(255, 196, 40, 255), width=6)
        img.alpha_composite(plate, ((W - plate.width) // 2, bottom - 13))
        img.alpha_composite(kr, ((W - kr.width) // 2, bottom))
    return img.convert('RGB')


if __name__ == '__main__':
    base = Image.open(STORE / 'thumb_raw.png').convert('RGB').resize((1024, 1024), Image.LANCZOS)
    pick = sys.argv[2] if len(sys.argv) > 2 else None
    if pick:
        out = variant(base, pick)
        p = STORE / 'thumbnail.jpg'
        out.save(p, quality=92, optimize=True)
        print(p, p.stat().st_size)
        # 그래픽(1024x578)도 같은 픽셀 글자로: 위 가운데 영문, 아래 가운데 한글 판
        g = Image.open(STORE / 'graphic_raw.png').convert('RGB')
        h = round(g.width * 578 / 1024)
        g = g.crop((0, 20, g.width, 20 + h)).resize((1024, 578), Image.LANCZOS).convert('RGBA')
        word = pixel_word('MOB TOSS', 22, 4)
        g.alpha_composite(word, ((1024 - word.width) // 2, 18))
        kr = pixel_word('몹 토스', 22, 2, top=(255, 255, 255), mid=(255, 248, 230), low=(225, 208, 182))
        by = 578 - kr.height - 22
        plate = Image.new('RGBA', (kr.width + 40, kr.height + 18), (0, 0, 0, 0))
        ImageDraw.Draw(plate).rectangle((0, 0, plate.width - 1, plate.height - 1), fill=(42, 26, 16, 235), outline=(255, 196, 40, 255), width=4)
        g.alpha_composite(plate, ((1024 - plate.width) // 2, by - 9))
        g.alpha_composite(kr, ((1024 - kr.width) // 2, by))
        gp = STORE / 'graphic_1024x578.png'
        g.convert('RGB').save(gp, optimize=True)
        print(gp, gp.stat().st_size)
    else:
        vs = [variant(base, k) for k in 'ABC']
        sheet = Image.new('RGB', (3 * 520 + 40, 560), (30, 22, 16))
        d = ImageDraw.Draw(sheet)
        f = ImageFont.truetype(FONT, 28)
        for i, (k, v) in enumerate(zip('ABC', vs)):
            sheet.paste(v.resize((512, 512), Image.LANCZOS), (10 + i * 530, 40))
            d.text((10 + i * 530, 6), k, font=f, fill=(255, 214, 64))
        sheet.save(Path(sys.argv[1]).parent / 'logo_options.png')
        print('ok')
