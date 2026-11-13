# Contact sheet of a bench sweep: rows = scenes, columns = formats, for one language and hook.
import sys,glob,os
from PIL import Image
d,loc,hook=sys.argv[1],sys.argv[2],sys.argv[3]
fmts=['square','portrait','vertical','wide'];H=420;rows=[]
for sc in ['scene-1','scene-2','scene-3']:
    ims=[]
    for f in fmts:
        p=os.path.join(d,'sweep',f'square.{loc}.{hook}_{f}_{sc}.jpg')
        if os.path.exists(p):
            im=Image.open(p);ims.append(im.resize((round(im.width*H/im.height),H)))
    rows.append(ims)
W=max(sum(i.width for i in r)+12*(len(r)+1) for r in rows)
sheet=Image.new('RGB',(W,(H+12)*len(rows)+12),'#777')
for y,r in enumerate(rows):
    x=12
    for im in r:sheet.paste(im,(x,12+y*(H+12)));x+=im.width+12
out=os.path.join(d,f'sheet-{loc}-{hook}.jpg');sheet.save(out,quality=85);print(out)
