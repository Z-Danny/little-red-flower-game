"""QA contact sheet from actual browser screenshots, never a game asset."""
from pathlib import Path
import json
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parents[1]
docs=root/'docs/hazard-batch-v2'
plan=json.loads((docs/'production-plan.json').read_text(encoding='utf-8'))
report=json.loads((docs/'verification/hazard-browser-report.json').read_text(encoding='utf-8'))
folder=root/report['artifacts']
sheet=Image.new('RGB',(195*7,440*2),'#efe6d1');draw=ImageDraw.Draw(sheet)
for col,card in enumerate(plan['levels']):
    for row,state in enumerate(['initial','ending']):
        im=Image.open(folder/f"{card['authorId']}-http-390-{state}.png").convert('RGB')
        im.thumbnail((195,422));sheet.paste(im,(col*195,row*440+18))
        draw.text((col*195+6,row*440+3),f"{card['authorId']} - {state}",fill='#233b36')
sheet.save(docs/'verification/seven-levels-browser-contact-sheet.jpg',quality=94)
print('Contact sheet saved from '+report['artifacts'])
