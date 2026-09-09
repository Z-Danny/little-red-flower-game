"""Read-only pixel-level check; never regenerates or edits release art."""
from pathlib import Path
import json
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[1]
skin = json.loads((root / 'content/scenes/typhoon-home/skin.json').read_text(encoding='utf-8'))
def image(key):
    return Image.open(root / 'public' / skin[key].lstrip('/')).convert('RGBA')
scene, clean, safe, mask, family = [image(k) for k in ['scene', 'clean', 'safe', 'mask', 'family']]
size = (skin['width'], skin['height'])
assert all(im.size == size for im in [scene, clean, safe, mask]), 'Unregistered full scene or mask'
assert family.size == (skin['familyBox']['w'], skin['familyBox']['h'])
pixels = np.asarray(mask)
colors = np.unique(pixels[:,:,:3].reshape(-1,3),axis=0).tolist()
allowed = [[0,0,0]] + [t['color'] for t in skin['targets'].values()]
assert all(c in allowed for c in colors), 'Unexpected mask ID colors'
src, bg = np.asarray(scene), np.asarray(clean)
report = {}
for name, target in skin['targets'].items():
    region = np.all(pixels[:,:,:3] == target['color'],axis=2)
    assert region.sum() > 500, f'Tiny/missing target {name}'
    assert np.array_equal(src[region], bg[region]), f'Original hazard pixels changed: {name}'
    icon = Image.open(root / 'public' / target['icon'].lstrip('/')).convert('RGBA')
    alpha = np.asarray(icon)[:,:,3]
    assert alpha.max()==255 and alpha.min()==0, f'Icon transparency missing: {name}'
    report[name] = int(region.sum())
alpha = np.asarray(family)[:,:,3]
assert alpha.min()==0 and alpha.max()==255, 'Family must have real transparency'
assert not np.array_equal(src,np.asarray(safe)), 'Safe image must be distinct'
print(json.dumps({'world':size,'hazardPixelsUnchanged':True,'maskPixelCounts':report,'familyAlpha':True},ensure_ascii=False))
