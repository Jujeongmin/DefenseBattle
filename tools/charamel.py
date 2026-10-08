"""CharaMEL(ぴぽや 32x32 男女) 파츠를 합성해 RPG Maker 형식(96x128) 캐릭터 시트를 만든다.

CharaMEL 앱의 레이어 규칙(character.json 의 SubCategory Order)과 프리셋 형식
(parts: 부위 이름 → 파일명, color: 부위 → 곱할 색)을 그대로 따른다.
파츠 폴더(CharaMEL 설치 폴더의 characters/pipoya32x32_男女)는 재배포 금지라 저장소에 넣지 않는다.
Asset/charamel/ 에 복사해 두거나 CHARAMEL 환경변수로 경로를 지정한다.
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(os.environ.get(
    'CHARAMEL',
    Path(__file__).resolve().parent.parent / 'Asset/charamel/pipoya32x32_男女'))
PARTS = ROOT / 'Parts'
SIZE = (96, 128)


def _layers() -> list[tuple[str, str, int]]:
    """(부위 이름, 폴더, 순서) - 순서가 낮을수록 아래에 깔린다"""
    s = (ROOT / 'character.json').read_text(encoding='utf-8')
    out = []
    for m in re.finditer(r'"(\d+)":\s*\{(.*?)\}', s, re.S):
        body = m.group(2)
        get = lambda k: re.search(r'"%s":\s*"([^"]*)"' % k, body).group(1)
        out.append((get('Name'), get('Dir'), int(get('Order'))))
    return sorted(out, key=lambda x: x[2])


LAYERS = _layers()


def _color(v: str | None) -> tuple[float, float, float, float] | None:
    if not v:
        return None
    nums = [float(x) for x in re.findall(r'[-\d.]+', v)]
    return tuple(nums[:4])  # type: ignore[return-value]


def _modulate(im: Image.Image, c: tuple[float, float, float, float]) -> Image.Image:
    """Godot modulate: 채널별 곱 (1 초과 허용, 255 에서 자름)"""
    r, g, b, a = im.split()
    r = r.point(lambda v: min(255, int(v * c[0])))
    g = g.point(lambda v: min(255, int(v * c[1])))
    b = b.point(lambda v: min(255, int(v * c[2])))
    a = a.point(lambda v: min(255, int(v * c[3])))
    return Image.merge('RGBA', (r, g, b, a))


def _tint(im: Image.Image, c: tuple[float, float, float, float]) -> Image.Image:
    """흑백(명도)으로 만든 뒤 색을 곱한다 - 원래 색과 상관없이 원하는 색 계열로 (CharaMEL 에는 없는 확장)"""
    alpha = im.getchannel('A')
    lum = im.convert('L')
    chans = [lum.point(lambda v, k=k: min(255, int(v * k))) for k in c[:3]]
    return Image.merge('RGBA', (*chans, alpha))


def compose(parts: dict[str, str], colors: dict[str, str] | None = None) -> Image.Image:
    """parts: {'スキン': '男_ベース001-01', '衣装1': '男_服010_騎士', ...}"""
    colors = colors or {}
    out = Image.new('RGBA', SIZE)
    for name, folder, _order in LAYERS:
        file = parts.get(name)
        if not file:
            continue
        p = PARTS / folder / f'{file}.png'
        if not p.exists():
            continue
        im = Image.open(p).convert('RGBA')
        if im.size != SIZE:
            im = im.crop((0, 0, *SIZE))
        spec = colors.get(name)
        c = _color(spec)
        if c and spec.startswith('Tint'):
            im = _tint(im, c)
        elif c:
            im = _modulate(im, c)
        out = Image.alpha_composite(out, im)
    return out


def presets() -> dict[str, dict]:
    s = (ROOT / 'Preset_files/preset.json').read_text(encoding='utf-8')
    d = json.loads(s)
    return {f'{cat}/{name}': v for cat, items in d.items() for name, v in items.items()}


def part_names(folder: str) -> list[str]:
    return sorted(p.stem for p in (PARTS / folder).glob('*.png'))
