"""Archive the approved v2 WAVs and embed their original PCM16 bytes unchanged."""
import base64, hashlib, json, pathlib, shutil, wave

ROOT = pathlib.Path(__file__).resolve().parents[2]
ARCHIVE = pathlib.Path(__file__).resolve().parent
DEMOS = ROOT / 'outputs/audio-demos/settlement-v2'

def copy(source, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)
    assert source.read_bytes() == destination.read_bytes()
    return {'path': str(destination.relative_to(ROOT)), 'bytes': destination.stat().st_size,
            'sha256': hashlib.sha256(destination.read_bytes()).hexdigest()}

def read_json(path):
    return json.loads(path.read_text())

music = read_json(DEMOS/'music/music-verification.json')
buttons = read_json(DEMOS/'buttons/buttons-measurement.json')
button_sources = read_json(DEMOS/'buttons/asset-manifest.json')
music_download = read_json(DEMOS/'music/source/downloads.json')[0]
packages = {
  'music-jingles': {
    'author': 'Kenney', 'title': 'Music Jingles', 'sourcePage': music['sourcePage'],
    'license': 'CC0 1.0', 'licenseUrl': 'https://creativecommons.org/publicdomain/zero/1.0/',
    'downloadUrl': music_download['url'],
    'archive': copy(DEMOS/'music/source/kenney_music-jingles.zip', ARCHIVE/'sources/music-jingles/kenney_music-jingles.zip'),
    'licenseFile': copy(DEMOS/'music/source/License.txt', ARCHIVE/'sources/music-jingles/License.txt'),
  },
  'interface-sounds': {
    'author': 'Kenney', 'title': 'Interface Sounds 1.0',
    'sourcePage': button_sources['officialSourcePage'], 'license': 'CC0 1.0',
    'licenseUrl': button_sources['licenseUrl'], 'downloadUrl': button_sources['officialZipUrl'],
    'archive': copy(DEMOS/'buttons/kenney_interface-sounds.zip', ARCHIVE/'sources/interface-sounds/kenney_interface-sounds.zip'),
    'licenseFile': copy(DEMOS/'buttons/official-pack/License.txt', ARCHIVE/'sources/interface-sounds/License.txt'),
  }
}
assert packages['music-jingles']['archive']['sha256'] == music_download['sha256']
assert packages['interface-sounds']['archive']['sha256'] == button_sources['officialZipSha256']
items = []
embedded = {}
for kind, demo_path, source, package, processing in [
  ('victory', DEMOS/'music/01-victory-short.wav', DEMOS/'music/source/jingles_SAX02.ogg', 'music-jingles', music['tracks'][0]),
  ('failure', DEMOS/'music/02-failure-short.wav', DEMOS/'music/source/jingles_SAX07.ogg', 'music-jingles', music['tracks'][1]),
  ('button', DEMOS/'buttons/03-button-a-warm.wav', DEMOS/'buttons/official-pack/Audio/click_001.ogg', 'interface-sounds', buttons['items'][0]),
]:
    approved = copy(demo_path, ARCHIVE/'approved'/demo_path.name)
    original = copy(source, ARCHIVE/'sources'/package/source.name)
    with wave.open(str(demo_path), 'rb') as wav:
        assert wav.getnchannels() == 1 and wav.getsampwidth() == 2 and wav.getcomptype() == 'NONE'
        sample_rate, frames = wav.getframerate(), wav.getnframes()
        pcm = wav.readframes(frames)
        assert len(pcm) == frames * 2
    payload = {
      'encoding': 'pcm_s16le', 'channels': 1, 'sampleRate': sample_rate, 'frames': frames,
      'durationSeconds': frames / sample_rate, 'pcmSha256': hashlib.sha256(pcm).hexdigest(),
      'approvedWavSha256': approved['sha256'], 'pcmBase64': base64.b64encode(pcm).decode('ascii')
    }
    embedded[kind] = payload
    items.append({
      'kind': kind, 'approvedFrom': str(demo_path.relative_to(ROOT)), 'approved': approved,
      'package': package, 'original': original, 'encoding': payload['encoding'],
      'channels': 1, 'sampleRate': sample_rate, 'frames': frames, 'durationSeconds': frames/sample_rate,
      'pcmSha256': payload['pcmSha256'],
      'auditionProcessing': {'filters': processing['filters'], 'gainDb': processing['gainDb']},
      'integrationProcessing': 'None: the approved WAV is copied byte-for-byte and its PCM16 data is embedded unchanged.'
    })

out = ROOT/'content/audio/approved-results.json'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps({'version': 1, 'selection': 'settlement-v2: victory, failure, button A', 'sounds': embedded}, ensure_ascii=False, indent=2)+'\n')
manifest = {
  'version': 1, 'status': 'user-approved', 'selection': 'settlement-v2 first three: victory, failure, button A',
  'packages': packages, 'sounds': items, 'embedded': {
    'path': str(out.relative_to(ROOT)), 'bytes': out.stat().st_size,
    'sha256': hashlib.sha256(out.read_bytes()).hexdigest()
  },
  'sourceNote': 'Actual sources are the public official Kenney Music Jingles and Interface Sounds ZIPs. Initial OriginGame fetch plans returned 401 and were not downloaded. Failed Retro Sounds mirror files were never used. Catalog hashes are not substituted for these actual source hashes.',
  'automatedChecks': 'Approved WAV copies are byte-identical; PCM16 payload byte counts and hashes verified.',
  'agentHumanListening': 'not_run', 'physicalDeviceListening': 'not_run'
}
(ARCHIVE/'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
print(json.dumps({'embeddedBytes': out.stat().st_size, 'sounds': [{k:s[k] for k in ['kind','sampleRate','frames','durationSeconds']} for s in items]}))
