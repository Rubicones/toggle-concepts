# Prints the open picture requests of a bench run as batch items (for generating them by hand).
import json,glob,sys,os
items=[]
for f in sorted(glob.glob(os.path.join(sys.argv[1],'pictures','*.request.json'))):
    r=json.load(open(f));done=any(os.path.exists(f.replace('.request.json',e)) for e in ('.jpg','.png'))
    if done: continue
    n=int(r['id'].split('-')[1])+int(sys.argv[2])
    items.append({'index':n,'params':{'model':'nano_banana_2_1','aspect_ratio':r['aspect'],'resolution':'2k','use_unlim':False,'prompt':r['prompt']+(' Must not contain: '+', '.join(r['mustNotContain'])+'.' if r['mustNotContain'] else '')}})
    print('#',r['id'],r['aspect'],'cutout' if r['cutout'] else '','proxy' if r.get('proxyFor') else '',file=sys.stderr)
print(json.dumps(items))
