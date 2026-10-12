"""PNG 용량 줄이기 (배포 전 1회, 새 그림을 넣은 뒤 다시 실행).

- 스프라이트·UI 중 256색 이하인 그림: 무손실 팔레트 PNG (색·투명도 그대로, 픽셀 비교로 확인)
- 상점 상품 그림(ui/shop, AI 그림이라 색이 많음): 256색으로 줄인다 (작게 보여서 차이가 거의 없다)
줄어들 때만 덮어쓴다.
실행: python tools/optimize_png.py
"""
from __future__ import annotations

import io
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / 'game/public'


def palette_png(im: Image.Image) -> Image.Image | None:
    """256색 이하면 색·알파를 그대로 담은 팔레트 이미지, 아니면 None"""
    rgba = im.convert('RGBA')
    colors = rgba.getcolors(256)
    if colors is None:
        return None
    # 완전 투명은 한 색으로 모은다
    norm = [(c if c[3] else (0, 0, 0, 0)) for _, c in colors]
    uniq = list(dict.fromkeys(norm))
    index = {c: i for i, c in enumerate(uniq)}
    p = Image.new('P', rgba.size)
    p.putpalette([v for c in uniq for v in c[:3]] + [0] * (3 * (256 - len(uniq))))
    p.putdata([index[c if c[3] else (0, 0, 0, 0)] for c in rgba.getdata()])
    p.info['transparency'] = bytes(c[3] for c in uniq)
    return p


def same(a: Image.Image, b: Image.Image) -> bool:
    x, y = a.convert('RGBA'), b.convert('RGBA')
    return all((p == q) or (p[3] == 0 and q[3] == 0) for p, q in zip(x.getdata(), y.getdata()))


def encoded(im: Image.Image) -> bytes:
    buf = io.BytesIO()
    im.save(buf, 'PNG', optimize=True, transparency=im.info.get('transparency')) if im.mode == 'P' else im.save(buf, 'PNG', optimize=True)
    return buf.getvalue()


def main() -> None:
    before = after = 0
    for f in sorted(ROOT.rglob('*.png')):
        src = f.read_bytes()
        im = Image.open(io.BytesIO(src))
        im.load()
        before += len(src)
        out = None
        p = palette_png(im)
        if p is not None:
            data = encoded(p)
            if same(im, Image.open(io.BytesIO(data))):
                out = data
        elif f.parent.name == 'shop':
            q = im.convert('RGBA').quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG)
            out = encoded(q)
        if out and len(out) < len(src):
            f.write_bytes(out)
            after += len(out)
        else:
            after += len(src)
    print(f'PNG {before // 1024} KB -> {after // 1024} KB')


if __name__ == '__main__':
    main()
