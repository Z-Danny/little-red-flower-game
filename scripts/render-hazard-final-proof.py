from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw
ROOT=Path(__file__).resolve().parents[1]
base=ROOT/'art-source/hazard-batch-v2'
original=Image.open(ROOT/'public/levels/hazard-batch-v2/clear-corridor-check-v2/scene.webp').convert('RGB')
rebuilt=Image.open(base/'H06/proof/reconstructed.png').convert('RGB')
canvas=Image.new('RGB',(600,540),'#fff9e9')
for i,im in enumerate([original,rebuilt]):canvas.paste(im.crop((158,328,288,555)).resize((300,524)),(i*300,16))
draw=ImageDraw.Draw(canvas);draw.text((4,2),'Original',fill='black');draw.text((304,2),'Reconstructed',fill='black')
canvas.save(base/'H06/proof/final-guard-comparison.png')
street=ROOT/'public/levels/hazard-batch-v2/storm-street-check-v2'
scene=Image.open(street/'scene.webp').convert('RGBA')
for name,color in [('weather',(0,170,255)),('water',(25,45,255))]:
    mask=Image.open(street/(name+'-mask.png')).convert('L').point(lambda v:95 if v else 0)
    overlay=Image.new('RGBA',scene.size,color+(0,));overlay.putalpha(mask);scene=Image.alpha_composite(scene,overlay)
scene.save(base/'H09/proof/final-permission-overlay.png')
report={'guardSourceReconstructionSamples':[],'streetForbiddenPoints':[]}
for point in [(243,359),(235,402),(276,465)]:
    a,b=original.getpixel(point),rebuilt.getpixel(point)
    report['guardSourceReconstructionSamples'].append({'point':point,'source':a,'reconstructed':b,'maxDifference':max(abs(x-y) for x,y in zip(a,b))})
    assert max(abs(x-y) for x,y in zip(a,b))<=3,('Guard crack persists',point,a,b)
for name,point in [('weather',(82,812)),('weather',(312,894)),('water',(522,735)),('water',(97,509)),('water',(479,730))]:
    value=Image.open(street/(name+'-mask.png')).getpixel(point)
    report['streetForbiddenPoints'].append({'mask':name,'point':point,'value':value});assert value==0
(ROOT/'docs/hazard-batch-v2/verification/final-boundary-check.json').write_text(json.dumps(report,indent=2))
print('Guard edge and five forbidden weather/water points PASS; inspect accompanying proof images.')
