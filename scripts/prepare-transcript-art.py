"""Approved mechanical atlas slicing / alpha cleanup; no artistic repainting.

Built-in imagegen originals remain intact. Reuses the existing project's matte
cleanup, checks all sprite edges, and records reproducible crop bounds.
"""
from pathlib import Path
import importlib.util
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'art-source/transcript-v1'
OUT = ROOT / 'public/levels/transcript-v1'
spec = importlib.util.spec_from_file_location('paperbook_matte', ROOT / 'scripts/prepare-paperbook-art.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

atlases = {
 'kit-sprites': (3,2,['water','food','torch','radio','whistle','bag']),
 'corridor-sprites': (2,2,['box','chair','case','scooter']),
 'citizen-sprites': (4,1,['citizen-worried','citizen-focused','citizen-panicked','citizen-relieved']),
 'control-sprites': (2,1,['intercom','phone']),
}
report=[]
OUT.mkdir(parents=True,exist_ok=True)
for key in ['kit-room','corridor-room','lift-room','well-room']:
 im=Image.open(SRC/f'{key}.png').convert('RGB')
 im=im.resize((720,1280),Image.Resampling.LANCZOS)
 im.save(OUT/f'{key}.webp',quality=90,method=6)
 report.append({'id':key,'mode':'background-resize-webp','size':im.size})
for key,(cols,rows,names) in atlases.items():
 im=Image.open(SRC/f'{key}.png')
 clean,mode=module.matte(im,key)
 for i,name in enumerate(names):
  x,y=i%cols,i//cols
  # One object exceeds the nominal grid by 25px, so explicit non-overlapping
  # authoring rectangles below override the nominal evenly-spaced grid.
  rect=(round(x*im.width/cols),round(y*im.height/rows),round((x+1)*im.width/cols),round((y+1)*im.height/rows))
  if key=='kit-sprites' and name in ['torch','bag']:
   rect=(1024,0,1536,470) if name=='torch' else (1024,470,1536,1024)
  if key=='corridor-sprites':
   rect={'box':(0,0,650,560),'chair':(650,0,im.width,585),'case':(0,560,650,im.height),'scooter':(650,585,im.width,im.height)}[name]
  cell=clean.crop(rect)
  if name=='intercom':
   # Metal is almost as neutral as the baked checker. Keep its complete rigid
   # silhouette instead of color-keying holes through the silver front panel.
   cell=im.convert('RGBA').crop(rect)
   mask=Image.new('L',cell.size)
   ImageDraw.Draw(mask).polygon([(319,49),(587,40),(626,65),(627,800),(590,826),(319,810),(314,800),(314,59)],fill=255)
   mask=mask.filter(ImageFilter.GaussianBlur(.5)); cell.putalpha(mask)
  # Preserve common character canvas/baseline to prevent face-state jumps.
  bounds=cell.getchannel('A').getbbox()
  if not bounds: raise ValueError(f'Empty sprite {name}')
  if not name.startswith('citizen-'):
   cell=cell.crop(bounds)
  # Do not stretch: shrink to max 640px edge, then add transparent margin.
  cell.thumbnail((640,640),Image.Resampling.LANCZOS)
  final=Image.new('RGBA',(cell.width+8,cell.height+8))
  final.paste(cell,(4,4))
  final.save(OUT/f'{name}.png',optimize=True)
  a=np.array(final.getchannel('A'))
  assert not a[0].any() and not a[-1].any() and not a[:,0].any() and not a[:,-1].any()
  assert (a==0).mean()>.04
  report.append({'id':name,'mode':mode,'atlas':key,'sourceRect':rect,'tightBounds':bounds,'size':final.size,'alphaZeroRatio':float((a==0).mean())})
# Hotspots are exact copies of background content: no duplicate patch or invented
# invisible click target. Rendering reuses the same world box at rest.
for key,name,box in [('lift-room','lift-door',(163,226,558,879)),('well-room','well-opening',(70,518,391,650))]:
 im=Image.open(OUT/f'{key}.webp').convert('RGBA').crop(box)
 if name=='well-opening':
  mask=Image.new('L',im.size); ImageDraw.Draw(mask).ellipse((4,4,im.width-5,im.height-5),fill=255); im.putalpha(mask)
 im.save(OUT/f'{name}.png',optimize=True)
 report.append({'id':name,'mode':'exact-background-hotspot','sourceRect':box,'size':im.size})
# Diegetic touchscreen buttons are ordinary UI, not generated artwork. The
# backing tile is sampled from its own cream screen to keep paper grain.
im=Image.open(OUT/'phone.png')
im.crop((im.width//2-10,im.height//3,im.width//2+10,im.height//3+20)).save(OUT/'screen-tile.png')
Image.open(OUT/'intercom.png').crop((41,444,180,590)).save(OUT/'bell.png')
contact=Image.new('RGB',(1200,900),'#5e7973')
d=ImageDraw.Draw(contact)
names=sum([v[2] for v in atlases.values()],[])
for i,name in enumerate(names):
 img=Image.open(OUT/f'{name}.png'); img.thumbnail((260,185),Image.Resampling.LANCZOS)
 x=(i%4)*300+(300-img.width)//2; y=(i//4)*225+10
 contact.paste(img,(x,y),img); d.text(((i%4)*300+10,(i//4)*225+205),name,fill='white')
contact.save(SRC/'alpha-contact.png')
(SRC/'processing-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(report,ensure_ascii=False))
