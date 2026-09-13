"""Compile registered whole-scene source art; never generate or paste independent props.
Usage: python scripts/prepare-scene-hunt.py art-source/charging-bedroom-v1/production.json
Output paths are manifest-controlled, scoped to this repo, and must not already exist.
"""
from pathlib import Path
import sys, json, hashlib
import numpy as np
import cv2
from PIL import Image, ImageFilter
from scipy.ndimage import binary_erosion, binary_dilation, binary_fill_holes, distance_transform_edt

ROOT = Path(__file__).resolve().parents[1]
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def scoped(value):
    p=(ROOT/value).resolve()
    if not p.is_relative_to(ROOT) or p==ROOT: raise ValueError('Path outside project')
    return p
spec_path=scoped(sys.argv[1]); spec=json.loads(spec_path.read_text(encoding='utf-8'))
src=spec_path.parent; out=scoped(spec['output']); skin_path=scoped(spec['skin'])
assert out.is_relative_to(ROOT/'public/levels') and skin_path.is_relative_to(ROOT/'content/scenes')
assert not out.exists(), 'Use a new versioned output directory, never overwrite approved art'
assert not skin_path.exists(), 'Review existing skin before replacement'
assert len(spec['targets']) in range(3,7)
assert spec['sourceSha256']==sha(src/'scene-original.png'), 'Mother image changed; derived assets invalid'
W,H=spec.get('world',[720,1280]); size=(W,H)
original=Image.open(src/'scene-original.png').convert('RGB')
raw=Image.open(src/'mask-candidate.png').convert('RGB')
plate=Image.open(src/'clean-candidate.png').convert('RGB')
ending=Image.open(src/'ending.png').convert('RGB')
assert original.size==raw.size==plate.size==ending.size, 'Unregistered image sizes'
scene=original.resize(size,Image.Resampling.LANCZOS)
rgb=np.asarray(scene); raw=np.asarray(raw.resize(size,Image.Resampling.NEAREST))
mask=np.zeros((H,W,3),dtype=np.uint8); regions={}; targets={}
out.mkdir(parents=True); (src/'proof').mkdir(exist_ok=True)
prefix='/'+out.relative_to(ROOT/'public').as_posix()
proof=scene.convert('RGBA')
for target in spec['targets']:
    name=target['id']; color=target['color']
    assert len(color)==3 and color not in [[0,0,0],[255,255,255]]
    region=np.max(np.abs(raw.astype(np.int16)-np.array(color)),axis=2)<75
    # Human-reviewed semantic correction to the generated mask, never to scene pixels.
    # A white supply lead is NOT part of the damaged black cable assembly.
    corrections=spec.get('maskCorrections',{})
    if name in corrections:
        c=corrections[name]; yy,xx=np.mgrid[:H,:W]
        region &= (xx>=W*c['minX']) & (yy>=H*c['minY'])
        cable=c['darkCable']; dark_zone=(xx<W*cable['maxX']) & (yy<H*cable['maxY'])
        luma=rgb[:,:,0]*.299+rgb[:,:,1]*.587+rgb[:,:,2]*.114
        region &= ~dark_zone | (luma<cable['maxLuma'])
    if name in corrections.get('fillEnclosedHoles',[]):
        # Screen / casing seam are solid parts, not physical holes in these two objects.
        region=binary_fill_holes(region)
    assert region.sum()>500, f'Missing/tiny mask: {name}'
    assert not np.any(region & (mask.sum(axis=2)>0)), 'Overlapping IDs'
    mask[region]=color; regions[name]=region
    ys,xs=np.where(region); box=[int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)]
    alpha=Image.fromarray((region*255).astype('uint8'))
    # The silhouette is mechanically extracted from ORIGINAL object pixels. No hole filling.
    icon=scene.convert('RGBA');icon.putalpha(alpha);icon=icon.crop(box)
    icon.thumbnail((160,160),Image.Resampling.LANCZOS)
    icon.save(out/f'{name}.png')
    overlay=Image.new('RGBA',size,tuple(color)+(0,));overlay.putalpha(alpha.point(lambda p:p//2))
    Image.alpha_composite(scene.convert('RGBA'),overlay).save(src/'proof'/f'{name}-overlay.png')
    proof=Image.alpha_composite(proof,overlay)
    x,y,x1,y1=box
    targets[name]={'color':color,'bounds':{'x':x,'y':y,'w':x1-x,'h':y1-y},'icon':f'{prefix}/{name}.png'}
Image.fromarray(mask).save(out/'object-mask.png')
Image.fromarray(mask).save(out/'id-mask.png')
samples={}
for name,region in regions.items():
    y,x=np.unravel_index(np.argmax(distance_transform_edt(region)),region.shape)
    samples[name]=[int(x),int(y)]
# A blank, unobstructed floor point; confirm it cannot register as a target.
background=[400,1150]
assert not mask[background[1],background[0]].any()
(src/'hit-samples.json').write_text(json.dumps({'targets':samples,'background':background},indent=2)+'\n',encoding='utf-8')
proof.save(src/'proof'/'mask-overlay.png')
# Same-source people: refine semantic proposal without any newly generated facial pixels.
white=np.min(raw,axis=2)>180
assert white.sum()>5000, 'Missing character mask'
seed=np.full((H,W),cv2.GC_BGD,dtype=np.uint8)
loose=binary_dilation(white,iterations=8)
seed[loose]=cv2.GC_PR_BGD;seed[white]=cv2.GC_PR_FGD
seed[binary_erosion(white,iterations=4)]=cv2.GC_FGD
protected=binary_dilation(mask.sum(axis=2)>0,iterations=3)
seed[protected]=cv2.GC_BGD
cv2.grabCut(cv2.cvtColor(rgb,cv2.COLOR_RGB2BGR),seed,None,np.zeros((1,65)),np.zeros((1,65)),5,cv2.GC_INIT_WITH_MASK)
people=((seed==cv2.GC_FGD)|(seed==cv2.GC_PR_FGD)) & ~protected
assert people.sum()>5000
ys,xs=np.where(people);box=[max(0,int(xs.min())-3),max(0,int(ys.min())-3),min(W,int(xs.max())+4),min(H,int(ys.max())+4)]
alpha=Image.fromarray((people*255).astype('uint8')).filter(ImageFilter.GaussianBlur(.25))
family=scene.convert('RGBA');family.putalpha(alpha);family.crop(box).save(out/'family.png')
# Only silhouette + a small edge can use generated inpainting. Never use a rectangle as repair.
allowed=binary_dilation(people|white,iterations=10) & ~protected
feather=Image.fromarray((binary_dilation(people|white,iterations=5)*255).astype('uint8')).filter(ImageFilter.GaussianBlur(2))
repair=np.array(feather);repair[~allowed]=0
repair_img=Image.fromarray(repair);repair_img.save(src/'proof'/'repair-mask.png')
clean=Image.composite(plate.resize(size,Image.Resampling.LANCZOS),scene,repair_img)
assert np.array_equal(np.asarray(clean)[~allowed],rgb[~allowed])
assert np.array_equal(np.asarray(clean)[protected],rgb[protected])
scene.save(out/'scene.webp',lossless=True,method=6)
clean.save(out/'clean.webp',lossless=True,method=6)
ending.resize(size,Image.Resampling.LANCZOS).save(out/'ending.webp',lossless=True,method=6)
reconstructed=clean.convert('RGBA');reconstructed.alpha_composite(family);reconstructed.save(src/'proof'/'reconstructed.png')
x,y,x1,y1=box
skin={'version':1,'width':W,'height':H,'scene':f'{prefix}/scene.webp','clean':f'{prefix}/clean.webp','safe':f'{prefix}/ending.webp','mask':f'{prefix}/id-mask.png','family':f'{prefix}/family.png','familyBox':{'x':x,'y':y,'w':x1-x,'h':y1-y},'targets':targets}
skin_path.parent.mkdir(parents=True,exist_ok=True);skin_path.write_text(json.dumps(skin,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
report={'sourceSize':original.size,'world':size,'sourceSha256':sha(src/'scene-original.png'),'targetPixels':{k:int(v.sum()) for k,v in regions.items()},'targets':targets,'familyBounds':box,'repair':'silhouette + at most 10px, minus protected targets','unchangedOutsideAllowedRepair':True,'hazardPixelsUnchanged':True,'objectAndHitMasksIdentical':True,'files':[{'name':p.name,'sha256':sha(p)} for p in sorted(out.iterdir())]}
(src/'processing.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
