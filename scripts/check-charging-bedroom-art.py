"""Read-only pixel acceptance for H02. Visual meaning still requires inspecting the images."""
from pathlib import Path
import json
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parents[1]
skin=json.loads((root/'content/scenes/charging-bedroom/skin.json').read_text(encoding='utf-8'))
im=lambda key:Image.open(root/'public'/skin[key].lstrip('/')).convert('RGBA')
scene,base,end,mask,family=[im(k) for k in ['scene','clean','safe','mask','family']]
assert all(x.size==(720,1280) for x in [scene,base,end,mask])
assert family.size==(skin['familyBox']['w'],skin['familyBox']['h'])
m=np.array(mask); a=np.array(scene); b=np.array(base)
assert np.all(m[:,:,3]==255)
assert set(map(tuple,np.unique(m[:,:,:3].reshape(-1,3),axis=0)))=={(0,0,0),(255,0,0),(0,255,0),(0,0,255)}
assert len(skin['targets'])==3
for name,t in skin['targets'].items():
    region=np.all(m[:,:,:3]==t['color'],axis=2)
    assert region.sum()>500
    assert np.array_equal(a[region],b[region]),name+' changed during inpainting'
    alpha=np.array(Image.open(root/'public'/t['icon'].lstrip('/')).convert('RGBA'))[:,:,3]
    assert alpha.min()==0 and alpha.max()==255
    # Hollow regions remain non-target; no bounding rectangle as mask.
    box=t['bounds']; rect=region[box['y']:box['y']+box['h'],box['x']:box['x']+box['w']]
    assert not rect.all(),name+' is a rectangular hotspot'
repair=np.array(Image.open(root/'art-source/charging-bedroom-v1/proof/repair-mask.png'))
assert np.array_equal(a[repair==0],b[repair==0]),'Pixels changed outside repair mask'
assert np.array_equal(m,np.array(Image.open(root/'public/levels/charging-bedroom-v1/object-mask.png').convert('RGBA')))
alpha=np.array(family)[:,:,3];assert alpha.min()==0 and alpha.max()==255
assert not np.array_equal(a,np.array(end))
print(json.dumps({'level':'charging-bedroom','world':[720,1280],'targets':3,'exactIdColors':True,'originalHazardsPreserved':True,'outsideRepairUnchanged':True,'realAlpha':True,'objectEqualsIdMask':True}))
