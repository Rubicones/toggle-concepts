# Open picture requests of the latest bench run of each brand, as batch items (pictures are made by hand).
# requests.py list            -> prints batch items; remembers index -> folder/id in artifacts/pics/map.json
# requests.py place <index> <picture url> [cutout url]  -> downloads and puts the files where the run waits
import json,glob,sys,os,subprocess
from PIL import Image
MAP='artifacts/pics/map.json';os.makedirs('artifacts/pics',exist_ok=True)
m=json.load(open(MAP)) if os.path.exists(MAP) else {}
if sys.argv[1]=='list':
    items=[];latest={}
    for d in sorted(glob.glob('artifacts/bench/*-pipeline-*')):latest[os.path.basename(d).split('-')[0]]=d
    for d in latest.values():
        for f in sorted(glob.glob(os.path.join(d,'pictures','*.request.json'))):
            r=json.load(open(f));key=f'{d}/pictures|{r["id"]}'
            if any(os.path.exists(f.replace('.request.json',e)) for e in ('.jpg','.png')) or key in m.values():continue
            i=max([int(k) for k in m]+[100])+1;m[str(i)]=key
            items.append({'index':i,'params':{'model':'nano_banana_2_1','aspect_ratio':r['aspect'],'resolution':'2k','use_unlim':False,'prompt':r['prompt']+(' Must not contain: '+', '.join(r['mustNotContain'])+'.' if r['mustNotContain'] else '')}})
            print('#',i,os.path.basename(d).split('-')[0],r['id'],r['aspect'],'CUTOUT' if r['cutout'] else '',file=sys.stderr)
    json.dump(m,open(MAP,'w'));print(json.dumps(items))
else:
    i,url=sys.argv[2],sys.argv[3];dest,pid=m[i].split('|');tmp=f'artifacts/pics/{i}'
    subprocess.run(['curl','-sS','-o',tmp+'.png',url],check=True)
    if len(sys.argv)>4:
        subprocess.run(['curl','-sS','-o',tmp+'c.png',sys.argv[4]],check=True)
        c=Image.open(tmp+'c.png').convert('RGBA');c.crop(c.getchannel('A').point(lambda a:255 if a>8 else 0).getbbox()).save(f'{dest}/{pid}.cutout.png')
    Image.open(tmp+'.png').convert('RGB').save(f'{dest}/{pid}.jpg',quality=90);print('placed',dest,pid)
