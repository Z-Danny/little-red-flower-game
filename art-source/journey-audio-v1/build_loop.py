#!/usr/bin/env python3
"""Rebuild the selected rescue-comedy loop. Requires ffmpeg, ffprobe and numpy.
No playback is performed. Numerical continuity is not a listening test.
"""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import tempfile
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(__file__).with_name('source.mp3')
DEST = ROOT / 'public/audio/journey-v1/busy-rescue-loop.mp3'
REPORT = Path(__file__).with_name('verification.json')
SR = 48000
BPM = 138.0
BEATS = 64  # 16 bars at the independently measured ~138 BPM pulse.
START_SECONDS = 0.024  # Skip the source MP3's short initial low-energy padding.
CROSSFADE_SECONDS = 0.040
TARGET_LUFS = -18.0


def run(args):
    return subprocess.run(args, check=True, capture_output=True)


def decode(path):
    return np.frombuffer(run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', str(path),
        '-f', 'f32le', '-acodec', 'pcm_f32le', '-ar', str(SR), '-ac', '2', '-']).stdout,
        dtype='<f4').reshape(-1, 2).copy()


def measure(path):
    p = run(['ffmpeg', '-hide_banner', '-i', str(path), '-af',
        'loudnorm=I=-18:TP=-2:LRA=11:print_format=json', '-f', 'null', '-'])
    data = json.loads(re.findall(r'\{\s*"input_i".*?\}', p.stderr.decode(), re.S)[-1])
    return {'integratedLufs': float(data['input_i']), 'truePeakDbtp': float(data['input_tp']),
            'loudnessRangeLu': float(data['input_lra'])}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


x = decode(SOURCE)
# Actual audio spectral-flux autocorrelation, independent of the generation prompt.
mono = x.mean(axis=1)
hop, size = 240, 2048
window = np.hanning(size)
spectrum = np.array([np.abs(np.fft.rfft(mono[i:i+size] * window))
    for i in range(0, len(mono)-size, hop)])
flux = np.maximum(np.diff(np.log1p(spectrum), axis=0), 0)[:, 3:300].sum(axis=1)
flux = np.maximum(flux - np.convolve(flux, np.ones(101)/101, 'same'), 0)[300:-300]
scores = [(lag, float(np.corrcoef(flux[:-lag], flux[lag:])[0, 1])) for lag in range(66, 121)]
peaks = [(lag, score) for i, (lag, score) in enumerate(scores)
    if 0 < i < len(scores)-1 and score > scores[i-1][1] and score > scores[i+1][1]]
peaks.sort(key=lambda p: p[1], reverse=True)

start = round(START_SECONDS * SR)
length = round(BEATS * 60 / BPM * SR)
end = start + length
fade = round(CROSSFADE_SECONDS * SR)
y = x[start:end].copy()
# Circular overlap: the first 40 ms begin with the continuation immediately after
# the cut, and blend into the original opening at matching beat phase. The last
# frame -> first frame therefore remains consecutive source PCM before encoding.
# Raised-cosine equal-gain weights sum to one and have smooth endpoint slopes.
# Period stays 64 beats; there is no whole-track fade or inserted silence.
w = ((1-np.cos(np.linspace(0, np.pi, fade))) / 2).astype(np.float32)[:, None]
y[:fade] = x[end:end+fade] * (1-w) + y[:fade] * w

DEST.parent.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix='journey-audio-') as tmp:
    tmp = Path(tmp)
    raw = tmp / 'loop.f32'
    wav = tmp / 'loop.wav'
    y.astype('<f4').tofile(raw)
    run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-f', 'f32le', '-ar', str(SR),
        '-ac', '2', '-i', str(raw), '-c:a', 'pcm_f32le', str(wav)])
    edited_measurement = measure(wav)
    gain_db = TARGET_LUFS - edited_measurement['integratedLufs']
    # Fixed gain preserves dynamics; remeasure the lossy output and correct gain.
    for _ in range(3):
        run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', str(wav),
            '-af', f'volume={gain_db:.5f}dB', '-c:a', 'libmp3lame', '-b:a', '192k',
            '-ar', str(SR), '-write_xing', '1', '-map_metadata', '-1', str(DEST)])
        final_measurement = measure(DEST)
        error = TARGET_LUFS - final_measurement['integratedLufs']
        if abs(error) <= 0.05:
            break
        gain_db += error

z = decode(DEST)
assert len(z) == length, 'Gapless MP3 decoding did not preserve the loop sample count'
assert np.isfinite(z).all(), 'Audio contains NaN or infinity'
assert abs(final_measurement['integratedLufs'] - TARGET_LUFS) <= 0.1
assert final_measurement['truePeakDbtp'] <= -2.0
# Compare the wrap edge with ordinary per-sample steps around that edge.
edge = np.concatenate([z[-round(.05*SR):], z[:round(.05*SR)]])
steps = np.abs(np.diff(edge, axis=0))
jump = np.abs(z[0] - z[-1])
report = {
    'version': 1, 'id': 'busy-rescue-v1', 'date': '2026-09-15',
    'source': {'path': 'art-source/journey-audio-v1/source.mp3', 'sha256': sha(SOURCE),
               'bytes': SOURCE.stat().st_size, 'decodedFrames': len(x),
               'decodedDurationSeconds': len(x)/SR, **measure(SOURCE)},
    'tempoAnalysis': {'method': 'Positive log-spectral flux; 2048-sample Hann window; 240-sample hop; local baseline removal; normalized autocorrelation over 3–27 seconds',
        'strongestCandidates': [{'bpm': 60/(lag*hop/SR), 'lagFrames': lag, 'correlation': score} for lag, score in peaks[:3]],
        'selectedBpm': BPM,
        'limitation': 'Pulse-period evidence only; bar alignment and harmonic seam are not human-verified.'},
    'edit': {'sourceStartSeconds': start/SR, 'sourceEndSeconds': end/SR,
        'loopBeats': BEATS, 'assumedBeatsPerBar': 4, 'loopDurationSeconds': length/SR,
        'retainedTimelineFraction': length/len(x),
        'circularCrossfadeSeconds': fade/SR, 'crossfadeShape': 'raised-cosine equal-gain',
        'crossfadeMethod': 'First 40 ms blend source continuation at cut end into opening at matching pulse phase; period unchanged.',
        'reason': 'Remove the generated closing decay and near-silent tail; keep 16 bars of the selected music without a repeated whole-track fade.',
        'editedPcmMeasurement': edited_measurement, 'fixedGainDb': round(gain_db, 5)},
    'output': {'path': 'public/audio/journey-v1/busy-rescue-loop.mp3', 'sha256': sha(DEST),
        'bytes': DEST.stat().st_size, 'codec': 'mp3', 'encoder': 'libmp3lame', 'bitrate': 192000,
        'sampleRate': SR, 'channels': 2, 'decodedFrames': len(z), 'decodedDurationSeconds': len(z)/SR,
        'gaplessMetadata': 'Xing/LAME metadata; ffmpeg decoded frame count equals edited PCM frame count. Browser decoding is checked separately.',
        **final_measurement},
    'numericalSeam': {'decodedWrapStepAbsPerChannel': jump.tolist(),
        'nearSeam99thPercentileStepPerChannel': np.percentile(steps, 99, axis=0).tolist(),
        'decodedPeakAbs': float(np.abs(z).max()),
        'note': 'Numerical values do not prove a perceptually seamless musical loop.'},
    'checks': {'decode': 'passed', 'finiteSamples': 'passed', 'integratedLoudness': 'passed',
        'truePeakHeadroom': 'passed', 'gaplessDecodedFrameCount': 'passed',
        'humanListening': 'not_run', 'perceptualLoopSeam': 'not_run',
        'browserPlayback': 'not_run', 'realDevice': 'not_run', 'gameMix': 'not_run'},
    'tools': {'ffmpeg': run(['ffmpeg', '-version']).stdout.decode().splitlines()[0],
        'numpy': np.__version__}
}
REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
config = {'version': 1, 'id': 'busy-rescue-v1', 'src': '/audio/journey-v1/busy-rescue-loop.mp3',
          'gain': 0.65, 'fadeSeconds': 0.25, 'loopStart': 0, 'loopEnd': len(z)/SR}
(ROOT / 'content/journey-audio.json').write_text(json.dumps(config, indent=2)+'\n')
print(json.dumps({'config': config, 'output': report['output'], 'numericalSeam': report['numericalSeam']}, indent=2))
