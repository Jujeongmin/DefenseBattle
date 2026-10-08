"""Mixkit 원본(Asset/mixkit)을 체감 음량 기준으로 맞춰 game/public/{sfx,bgm} 에 저장한다.

- 효과음: 짧은 소리는 '가장 큰 순간'이 튀어 들리므로 최대 순간 음량(100ms 창, LUFS)을 SFX_TARGET 에 맞춘다.
  (400ms 창은 0.1~0.3초짜리 타격음에 무음이 섞여 실제보다 작게 재므로 과하게 키우게 된다)
- BGM: 곡 전체 통합 음량(LUFS)을 BGM_TARGET 에 맞춘다.
- 둘 다 앞 무음 제거, 순간 피크는 리미터로 -2.5 dBFS 아래로 누른다 (MP3 인코딩 오버슈트 여유).
코드(audio.ts)의 볼륨은 효과음끼리 모두 같게 두고, BGM 만 한 단계 낮춘다.

실행: python tools/normalize_audio.py  (pyloudnorm, numpy, imageio-ffmpeg 필요)
"""
from __future__ import annotations

import subprocess
from pathlib import Path

import imageio_ffmpeg
import numpy as np
import pyloudnorm as pyln

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'Asset/mixkit'
OUT = ROOT / 'game/public'
FF = imageio_ffmpeg.get_ffmpeg_exe()
SR = 48000
SFX_TARGET = -14.0  # LUFS (100ms 창 최대 음량)
BGM_TARGET = -16.0  # LUFS (통합 음량) - 재생 볼륨은 audio.ts 에서 낮춘다
TRIM = 'silenceremove=start_periods=1:start_threshold=-55dB'


def decode(path: Path, filt: str = TRIM) -> np.ndarray:
    raw = subprocess.run([FF, '-loglevel', 'error', '-i', str(path), '-af', filt, '-ac', '1', '-ar', str(SR),
                          '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


METER = pyln.Meter(SR)
SHORT = pyln.Meter(SR, block_size=0.1)


def max_momentary(x: np.ndarray) -> float:
    win, hop = int(0.1 * SR), int(0.025 * SR)
    if len(x) < win:
        x = np.concatenate([x, np.zeros(win - len(x), dtype=np.float32)])
    best = -70.0
    for i in range(0, len(x) - win + 1, hop):
        seg = x[i:i + win]
        if np.max(np.abs(seg)) < 1e-4:
            continue
        best = max(best, SHORT.integrated_loudness(seg))
    return best


def integrated(x: np.ndarray) -> float:
    return METER.integrated_loudness(x)


def encode(src: Path, dst: Path, gain_db: float, bitrate: str) -> None:
    af = f'{TRIM},volume={gain_db:.2f}dB,alimiter=limit=0.75:attack=2:release=60:level=disabled'
    subprocess.run([FF, '-loglevel', 'error', '-y', '-i', str(src), '-af', af, '-ac', '1', '-b:a', bitrate, str(dst)],
                   check=True)


def main() -> None:
    print(f'{"file":22} {"before":>8} {"gain":>7} {"after":>8}')
    for kind, target, measure, rate in (('sfx', SFX_TARGET, max_momentary, '96k'), ('bgm', BGM_TARGET, integrated, '64k')):
        for src in sorted((SRC / kind).glob('*.mp3')):
            before = measure(decode(src))
            gain = target - before
            dst = OUT / kind / src.name
            # 타격음처럼 순간 피크가 큰 소리는 리미터에 눌려 목표보다 작아지므로 몇 번 더 올려 맞춘다
            for _ in range(4):
                encode(src, dst, gain, rate)
                after = measure(decode(dst, 'anull'))
                if abs(after - target) < 0.5:
                    break
                gain += target - after
            print(f'{kind}/{src.name:18} {before:8.1f} {gain:+7.1f} {after:8.1f}')


if __name__ == '__main__':
    main()
