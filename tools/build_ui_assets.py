"""UI 에셋 가공 스크립트.

원본 팩(Asset/, gitignore)에서 게임이 쓰는 조각만 뽑아 game/public/ui 에 저장한다.
  - Tiny Swords (Free Pack, Pixel Frog): 버튼 / 종이 / 나무 / 리본 / 바 9-slice
  - Kenney 1-Bit Pack (CC0): 16px 아이콘 (색 입히고 외곽선 추가)
  - 팩에 없는 아이콘(별, TV, 티켓 등)은 아래 GRIDS 에 같은 16px 스타일로 직접 그린다.

실행: python tools/build_ui_assets.py  (Pillow 필요)
"""
from __future__ import annotations

import colorsys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
TS = ROOT / 'Asset/ts_free/Tiny Swords (Free Pack)/UI Elements/UI Elements'
KENNEY = ROOT / 'Asset/kenney_1bit/Tilesheet/monochrome-transparent_packed.png'
KENNEY_COLOR = ROOT / 'Asset/kenney_1bit/Tilesheet/colored-transparent_packed.png'
OUT = ROOT / 'game/public/ui'
OUTLINE = (42, 29, 22, 255)


# ---------------------------------------------------------------- 9-slice
def compact(src: Path, cells: list[tuple[int, int]], rows: list[tuple[int, int]] | None = None) -> Image.Image:
    """원본 시트는 조각 사이에 빈 칸이 있다. 조각만 이어 붙여 border-image 로 쓸 수 있게 만든다."""
    im = Image.open(src).convert('RGBA')
    rows = rows or cells
    w = sum(b - a for a, b in cells)
    h = sum(b - a for a, b in rows)
    out = Image.new('RGBA', (w, h))
    y = 0
    for ya, yb in rows:
        x = 0
        for xa, xb in cells:
            out.paste(im.crop((xa, ya, xb, yb)), (x, y))
            x += xb - xa
        y += yb - ya
    return out


def shift_hue(im: Image.Image, fn) -> Image.Image:
    """픽셀별 HSV 변환. fn(h, s, v) -> (h, s, v)"""
    px = im.load()
    out = im.copy()
    opx = out.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            h, s, v = fn(h, s, v)
            r2, g2, b2 = colorsys.hsv_to_rgb(h % 1, max(0, min(1, s)), max(0, min(1, v)))
            opx[x, y] = (round(r2 * 255), round(g2 * 255), round(b2 * 255), a)
    return out


def is_body(h: float, s: float) -> bool:
    """버튼 몸통색(빨강/파랑)만 바꾸고 노란 테두리·외곽선은 둔다"""
    return s > 0.25 and not (0.08 < h < 0.2)


def recolor_body(target_h: float, sat: float = 1.0, val: float = 1.0):
    def fn(h, s, v):
        if is_body(h, s):
            return target_h, s * sat, v * val
        return h, s, v
    return fn


def build_frames() -> None:
    (OUT / 'frame').mkdir(parents=True, exist_ok=True)
    c3 = [(0, 64), (128, 192), (256, 320)]
    btn = {}
    for color in ('Red', 'Blue'):
        for state, suffix in (('Regular', ''), ('Pressed', '_down')):
            btn[color.lower() + suffix] = compact(TS / f'Buttons/Big{color}Button_{state}.png', c3)
    # 파랑 → 초록·회색(비활성)·보라 / 빨강 → 금색
    for suffix in ('', '_down'):
        btn['green' + suffix] = shift_hue(btn['blue' + suffix], recolor_body(0.33, 0.95, 0.95))
        btn['gold' + suffix] = shift_hue(btn['red' + suffix], recolor_body(0.11, 1.0, 1.05))
        btn['gray' + suffix] = shift_hue(btn['blue' + suffix], recolor_body(0.6, 0.15, 0.85))
        btn['purple' + suffix] = shift_hue(btn['blue' + suffix], recolor_body(0.76, 0.9, 1.0))
    for name, im in btn.items():
        im.save(OUT / f'frame/btn_{name}.png')

    compact(TS / 'Papers/RegularPaper.png', c3).save(OUT / 'frame/paper.png')
    compact(TS / 'Papers/SpecialPaper.png', c3).save(OUT / 'frame/paper_dark.png')
    c4 = [(0, 128), (192, 256), (320, 448)]
    compact(TS / 'Wood Table/WoodTable.png', c4).save(OUT / 'frame/wood.png')

    # 리본: 5색(파랑, 빨강, 노랑, 보라, 회색) x 가로 3조각
    ribbons = Image.open(TS / 'Ribbons/BigRibbons.png').convert('RGBA')
    for i, name in enumerate(('blue', 'red', 'yellow', 'purple', 'gray')):
        row = ribbons.crop((0, i * 128, 448, i * 128 + 128))
        tmp = OUT / 'frame/_tmp.png'
        row.save(tmp)
        compact(tmp, c4, [(0, 128)]).save(OUT / f'frame/ribbon_{name}.png')
        tmp.unlink()

    bar = compact(TS / 'Bars/BigBar_Base.png', c3, [(0, 64)])
    bar.save(OUT / 'frame/bar.png')

    for name, file in (('round_red', 'SmallRedRoundButton'), ('round_blue', 'SmallBlueRoundButton'),
                       ('square_red', 'SmallRedSquareButton'), ('square_blue', 'SmallBlueSquareButton')):
        Image.open(TS / f'Buttons/{file}_Regular.png').save(OUT / f'frame/{name}.png')
        Image.open(TS / f'Buttons/{file}_Pressed.png').save(OUT / f'frame/{name}_down.png')


# ---------------------------------------------------------------- 아이콘
def outlined(mask: Image.Image) -> Image.Image:
    """불투명 픽셀 둘레에 1px 외곽선을 둘러 18x18 로 만든다"""
    w, h = mask.size
    out = Image.new('RGBA', (w + 2, h + 2))
    out.paste(mask, (1, 1))
    src = out.copy().load()
    px = out.load()
    for y in range(h + 2):
        for x in range(w + 2):
            if src[x, y][3]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w + 2 and 0 <= ny < h + 2 and src[nx, ny][3]:
                    px[x, y] = OUTLINE
                    break
    return out


def shade(im: Image.Image) -> Image.Image:
    """아래가 비어 있는 픽셀을 살짝 어둡게 - 납작한 실루엣에 두께감"""
    px = im.load()
    src = im.copy().load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = src[x, y]
            if not a or (r, g, b, a) == OUTLINE:
                continue
            below = src[x, y + 1] if y + 1 < im.height else (0, 0, 0, 0)
            if below[3] == 0 or below == OUTLINE:
                px[x, y] = (int(r * 0.72), int(g * 0.72), int(b * 0.72), a)
    return im


def hex_rgba(c: str) -> tuple[int, int, int, int]:
    c = c.lstrip('#')
    return int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), 255


def kenney(col: int, row: int, color: str | None) -> Image.Image:
    """Kenney 16px 타일. color 가 None 이면 컬러 시트 색을 그대로 쓴다."""
    if color is None:
        tile = Image.open(KENNEY_COLOR).convert('RGBA').crop((col * 16, row * 16, col * 16 + 16, row * 16 + 16))
    else:
        mono = Image.open(KENNEY).convert('RGBA').crop((col * 16, row * 16, col * 16 + 16, row * 16 + 16))
        tile = Image.new('RGBA', mono.size)
        fill = hex_rgba(color)
        for y in range(16):
            for x in range(16):
                if mono.getpixel((x, y))[3] > 0:
                    tile.putpixel((x, y), fill)
    return shade(outlined(trim_to(tile, 16)))


def trim_to(im: Image.Image, size: int) -> Image.Image:
    """내용을 size x size 가운데로 모은다 (Kenney 타일은 위치가 제각각)"""
    bbox = im.getbbox()
    if not bbox:
        return im
    part = im.crop(bbox)
    out = Image.new('RGBA', (size, size))
    out.paste(part, ((size - part.width) // 2, (size - part.height) // 2))
    return out


def grid(rows: list[str], palette: dict[str, str]) -> Image.Image:
    h = len(rows)
    w = max(len(r) for r in rows)
    im = Image.new('RGBA', (w, h))
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch in palette:
                im.putpixel((x, y), hex_rgba(palette[ch]))
    return outlined(trim_to(im, 16))


GRIDS: dict[str, tuple[list[str], dict[str, str]]] = {
    'star': ([
        '.......#.......',
        '......###......',
        '......#h#......',
        '.....##h##.....',
        '######hh#######',
        '.#####hh######.',
        '..###########..',
        '...#########...',
        '....#######....',
        '....###.###....',
        '...###...###...',
        '...##.....##...',
        '..##.......##..',
    ], {'#': '#ffc928', 'h': '#fff2a8'}),
    'star_off': ([
        '.......#.......',
        '......###......',
        '......###......',
        '.....#####.....',
        '###############',
        '.#############.',
        '..###########..',
        '...#########...',
        '....#######....',
        '....###.###....',
        '...###...###...',
        '...##.....##...',
        '..##.......##..',
    ], {'#': '#8c8279'}),
    'tv': ([
        '...#.....#...',
        '....#...#....',
        '.....#.#.....',
        '#############',
        '#sssssssss#k#',
        '#shsssssss#k#',
        '#sssssssss###',
        '#sssssssss#k#',
        '#sssssssss###',
        '#############',
        '.##.......##.',
    ], {'#': '#5a6578', 's': '#4fc3f7', 'h': '#e1f5fe', 'k': '#2d3440'}),
    'ticket': ([
        '##############',
        '#####d########',
        '.####d#######.',
        '..###d######..',
        '.####d#######.',
        '#####d########',
        '##############',
    ], {'#': '#ff8a3d', 'd': '#ffe0b2'}),
    'bolt': ([
        '.....####',
        '....####.',
        '...####..',
        '..####...',
        '.########',
        '########.',
        '....###..',
        '...###...',
        '..###....',
        '.##......',
        '#........',
    ], {'#': '#ffd43b'}),
    'calendar': ([
        '..#....#..',
        'rrrrrrrrrr',
        'rrrrrrrrrr',
        'wwwwwwwwww',
        'wkwwkwwkww',
        'wwwwwwwwww',
        'wkwwkwwkww',
        'wwwwwwwwww',
        'wkwwkwwwww',
        'wwwwwwwwww',
    ], {'#': '#5a6578', 'r': '#e5484d', 'w': '#f4ecdc', 'k': '#5a6578'}),
    'infinity': ([
        '.####...####.',
        '##..##.##..##',
        '#....###....#',
        '#....###....#',
        '##..##.##..##',
        '.####...####.',
    ], {'#': '#c9a7ff'}),
    'check': ([
        '.........##',
        '........###',
        '.......###.',
        '##....###..',
        '###..###...',
        '.#####.....',
        '..###......',
    ], {'#': '#5fd068'}),
    'map': ([
        '###...###...',
        '#######.####',
        '##########.#',
        '####r#r#####',
        '#####r######',
        '####r#r#####',
        '############',
        '#.##########',
        '####.#######',
        '...###...###',
    ], {'#': '#e8d4a2', 'r': '#e5484d', '.': None}),
    'robot': ([
        '.....#.....',
        '.....#.....',
        '..#######..',
        '.#########.',
        '##eee#eee##',
        '##eee#eee##',
        '.#########.',
        '.##kkkkk##.',
        '..#######..',
    ], {'#': '#aab4c3', 'e': '#4fc3f7', 'k': '#5a6578'}),
    'plus': ([
        '...###...',
        '...###...',
        '#########',
        '#########',
        '#########',
        '...###...',
        '...###...',
    ], {'#': '#ffffff'}),
    'close': ([
        '##.....##',
        '###...###',
        '.###.###.',
        '..#####..',
        '...###...',
        '..#####..',
        '.###.###.',
        '###...###',
        '##.....##',
    ], {'#': '#ffffff'}),
    'mute': ([
        '...##.........',
        '..###.........',
        '#####..#...#..',
        '#####...#.#...',
        '#####....#....',
        '#####...#.#...',
        '..###..#...#..',
        '...##.........',
    ], {'#': '#ffffff'}),
    'pointer': ([
        '...#####...',
        '...#hh##...',
        '...#h###...',
        '...#####...',
        '...#####...',
        '###########',
        '.#########.',
        '..#######..',
        '...#####...',
        '....###....',
        '.....#.....',
    ], {'#': '#ffc928', 'h': '#fff2a8'}),
    'up': ([
        '....#....',
        '...###...',
        '..#####..',
        '.#######.',
        '#########',
        '..#####..',
        '..#####..',
        '..#####..',
    ], {'#': '#5fd068'}),
    'down': ([
        '..#####..',
        '..#####..',
        '..#####..',
        '#########',
        '.#######.',
        '..#####..',
        '...###...',
        '....#....',
    ], {'#': '#ff6b5b'}),
}
# map 그리드의 '.' 는 투명이어야 하므로 팔레트에서 뺀다
GRIDS['map'][1].pop('.', None)

KENNEY_ICONS: dict[str, tuple[int, int, str | None]] = {
    'trophy': (40, 16, '#ffc928'),
    'crown': (43, 2, None),
    'skull': (34, 12, '#ece4d4'),
    'scroll': (34, 15, None),
    'lock': (0, 10, '#d9b45a'),
    'flask': (41, 11, None),
    'helmet': (35, 0, '#cfd6e0'),
    'sword': (34, 7, '#dfe6ee'),
    'sound': (38, 16, '#ffffff'),
    'warning': (35, 21, None),
    'hammer': (37, 7, '#d0a46a'),
    'bag': (45, 4, None),
    'medal': (41, 3, None),
    'flag': (17, 8, None),
    'heart': (39, 10, None),
}


def build_icons() -> None:
    out = OUT / 'icons'
    out.mkdir(parents=True, exist_ok=True)
    for name, (c, r, color) in KENNEY_ICONS.items():
        kenney(c, r, color).save(out / f'{name}.png')
    for name, (rows, pal) in GRIDS.items():
        im = grid(rows, pal)
        if name not in ('plus', 'close', 'mute'):
            im = shade(im)
        im.save(out / f'{name}.png')
    # 메달 3색 (랭킹 1~3위)
    medal = Image.open(out / 'medal.png').convert('RGBA')
    for name, fn in (('medal_silver', lambda h, s, v: (h, s * 0.08, v * 1.05)),
                     ('medal_bronze', lambda h, s, v: (0.06, s, v * 0.85))):
        shift_hue(medal, fn).save(out / f'{name}.png')


if __name__ == '__main__':
    build_frames()
    build_icons()
    print('ok')
