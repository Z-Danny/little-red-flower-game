"""Mechanical mask normalization/cutout/export; images themselves come from imagegen.
Do not infer safety from a color mask. Inspect mask-proof.png before accepting it.
"""
from pathlib import Path
from PIL import Image, ImageFilter, ImageDraw
import numpy as np
import cv2
from scipy.ndimage import binary_fill_holes, binary_erosion
import json, hashlib
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'art-source/typhoon-immersion-v2'; OUT=ROOT/'public/levels/typhoon-scene-v3'
OUT.mkdir(parents=True,exist_ok=True)
W,H=720,1280
original=Image.open(SRC/'unsafe.png').convert('RGB')
raw_mask=Image.open(SRC/'mask-generated.png').convert('RGB')
safe=Image.open(SRC/'safe.png').convert('RGB')
plate=Image.open(SRC/'clean-generated.png').convert('RGB')
assert original.size==raw_mask.size==safe.size==plate.size, 'Generated views must share dimensions'
scene=original.resize((W,H),Image.Resampling.LANCZOS)
mask=np.asarray(raw_mask.resize((W,H),Image.Resampling.NEAREST))
colors={'plant':(255,0,0),'window':(0,255,0),'rail':(0,0,255),'powerstrip':(255,255,0),'cabinet':(255,0,255)}
normalized=np.zeros((H,W,3),dtype=np.uint8); targets={}; proof=scene.convert('RGBA')
for name,color in colors.items():
 region=np.max(np.abs(mask.astype(np.int16)-np.array(color)),axis=2)<85
 assert region.sum()>400, f'Empty mask {name}'
 ys,xs=np.where(region);bounds=[int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)]
 alpha=Image.fromarray((region*255).astype('uint8'))
 icon=scene.convert('RGBA');icon.putalpha(alpha);icon=icon.crop(bounds);icon.thumbnail((160,200),Image.Resampling.LANCZOS);icon.save(OUT/(name+'-icon.png'))
 # A window's glass is part of the selectable window, but keep the hollow frame silhouette.
 hit=binary_fill_holes(region) if name=='window' else region
 assert not np.any((normalized.sum(axis=2)>0)&hit), 'Target masks overlap'
 normalized[hit]=color
 x0,y0,x1,y1=bounds;targets[name]={'color':list(color),'bounds':{'x':x0,'y':y0,'w':x1-x0,'h':y1-y0},'icon':f'/levels/typhoon-scene-v3/{name}-icon.png'}
 overlay=Image.new('RGBA',(W,H),color+(0,));overlay.putalpha(Image.fromarray((hit*85).astype('uint8')));proof=Image.alpha_composite(proof,overlay)
Image.fromarray(normalized).save(OUT/'targets-mask.png')
# White region carries the family; copy the actual painted people, no independently styled sprite.
white=(mask.min(axis=2)>150)
# Generated masks are a proposal: refine their boundary against the same source pixels.
seed=np.full((H,W),cv2.GC_BGD,dtype=np.uint8)
loose=np.asarray(Image.fromarray((white*255).astype('uint8')).filter(ImageFilter.MaxFilter(21)))>0
seed[loose]=cv2.GC_PR_BGD;seed[white]=cv2.GC_PR_FGD;seed[binary_erosion(white,iterations=5)]=cv2.GC_FGD
cv2.grabCut(cv2.cvtColor(np.asarray(scene),cv2.COLOR_RGB2BGR),seed,None,np.zeros((1,65)),np.zeros((1,65)),4,cv2.GC_INIT_WITH_MASK)
white=(seed==cv2.GC_FGD)|(seed==cv2.GC_PR_FGD)
ys,xs=np.where(white);assert len(xs)>15000
family_bounds=[max(0,int(xs.min())-3),max(0,int(ys.min())-3),min(W,int(xs.max())+4),min(H,int(ys.max())+4)]
family_alpha=Image.fromarray((white*255).astype('uint8')).filter(ImageFilter.GaussianBlur(.35))
family=scene.convert('RGBA');family.putalpha(family_alpha);family.crop(family_bounds).save(OUT/'family.png')
# Replace only a narrow mask around the people. All hazard pixels remain from the full scene.
repair=Image.new('L',(W,H));rd=ImageDraw.Draw(repair);rd.rectangle([max(0,family_bounds[0]-6),max(0,family_bounds[1]-6),min(W,family_bounds[2]+6),min(H,family_bounds[3]+6)],fill=255)
repair=repair.filter(ImageFilter.GaussianBlur(4))
# No target is allowed to change during the clean-plate operation.
repair_array=np.array(repair);repair_array[normalized.sum(axis=2)>0]=0;repair=Image.fromarray(repair_array)
clean=Image.composite(plate.resize((W,H),Image.Resampling.LANCZOS),scene,repair)
scene.save(OUT/'scene.webp',lossless=True,method=6)
clean.save(OUT/'clean.webp',lossless=True,method=6)
safe.resize((W,H),Image.Resampling.LANCZOS).save(OUT/'safe.webp',lossless=True,method=6)
proof.save(SRC/'mask-proof.png')
reconstructed=clean.convert('RGBA');reconstructed.alpha_composite(family);reconstructed.save(SRC/'family-proof.png')
x0,y0,x1,y1=family_bounds
skin={'version':1,'width':W,'height':H,'scene':'/levels/typhoon-scene-v3/scene.webp','safe':'/levels/typhoon-scene-v3/safe.webp','clean':'/levels/typhoon-scene-v3/clean.webp','mask':'/levels/typhoon-scene-v3/targets-mask.png','family':'/levels/typhoon-scene-v3/family.png','familyBox':{'x':x0,'y':y0,'w':x1-x0,'h':y1-y0},'outside':{'x':225,'y':79,'w':323,'h':452},'entry':{'x':235,'y':511,'w':166,'h':109},'targets':targets}
(ROOT/'content/scenes/typhoon-home/skin.json').write_text(json.dumps(skin,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
outside=np.asarray(repair)==0
assert np.array_equal(np.asarray(clean)[outside],np.asarray(scene)[outside])
report={'sourceSize':original.size,'world':[W,H],'targets':targets,'familyBounds':family_bounds,'unchangedOutsideFamilyRepair':True,'runtimeBytes':sum(p.stat().st_size for p in OUT.iterdir()),'files':[{ 'name':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in OUT.iterdir()]}
(SRC/'processing.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(report,ensure_ascii=False))
