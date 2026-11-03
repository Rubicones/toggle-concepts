# OpenRouter list prices, $ per 1M tokens (in, out, cacheRead), fetched 2026-11-03.
P={'flash25':(0.30,2.50,0.03),'haiku55':(0.10,0.50,0.01),'sonnet55':(2.00,10.00,0.10),'gem31pro':(2.00,12.00,0.20),'gem3flash':(0.50,3.00,0.05),'flashlite31':(0.25,1.50,0.025),'opus55':(4.0,20.0,0.4)}
IMG={'flash25img':0.039,'nb21':0.039,'g31img':0.077,'g3proimg':0.155}
def c(m,i,o,cached=0.0):
    pi,po,pc=P[m];return (i*(1-cached)*pi+i*cached*pc+o*po)/1e3
# Typical token use per step (assumption, thousands). (in, out, cached share)
plan={'research':(20,6),'strategy':(25,10),'variants':(15,4),'script':(35,14),'localization':(25,10),'visual-direction':(35,12)}
critic_gate=(8,2)   # one idea review
revision=(40,12)    # one revision of strategy/script/VD
brand_parts=20; brand_part=(4,1.5); brand_agent=(30,8)
vision_planning_extra=6 # k tokens: ~4-5 brand images at ~1.3k tokens each for strategy/script/VD
def run(cfg,directions=3,stills=4,fullDirections=None,vision=False,ideaRounds=1,divergence=False,heroCandidates=False):
    t={}
    t['brand reading']=brand_parts*c(cfg['reader'],*brand_part)+c(cfg['brandagent'],*brand_agent)
    p=0
    for r,(i,o) in plan.items():
        m=cfg['creative'] if r in ('strategy','script','visual-direction') else cfg['support']
        extra=vision_planning_extra if vision and r in ('strategy','script','visual-direction') else 0
        p+=c(m,i+extra,o)
    if divergence: p+=c(cfg['creative'],20,10)  # 12 raw thumbnails before the 3 territories
    t['planning']=p
    t['idea review']=3*ideaRounds*c(cfg['ideacritic'],*critic_gate)+c(cfg['creative'],*revision)
    n=fullDirections if fullDirections is not None else directions
    d=2*c(cfg['director'],30,10,0.5)
    d+=4*c(cfg['coder'],40,12,0.6)                                  # build turns
    d+=4*c(cfg['coder'],45,4,0.4)                                   # gate+2 self-review+critic repair (vision)
    d+=2*c(cfg['livecritic'],60,8)
    img=stills*IMG[cfg['image']]+(2*IMG[cfg['image']] if heroCandidates else 0)
    t['draft directions']=n*(d+img)
    if fullDirections is not None and fullDirections<directions:
        # cheap preview of the others: director key frames only, no coder build
        t['previews']=(directions-n)*(c(cfg['director'],30,10,0.5)+1*IMG[cfg['image']])
    t['total']=sum(t.values());return t
base={'reader':'flash25','brandagent':'flash25','creative':'flash25','support':'flash25','ideacritic':'flash25','director':'flash25','coder':'flash25','livecritic':'flash25','image':'flash25img'}
rec={'reader':'haiku55','brandagent':'sonnet55','creative':'sonnet55','support':'haiku55','ideacritic':'gem31pro','director':'sonnet55','coder':'sonnet55','livecritic':'gem31pro','image':'nb21'}
def show(name,t):print(f"{name:58s} "+'  '.join(f"{k}={v:.2f}" for k,v in t.items()))
show('A now: all Gemini 2.5 Flash',run(base))
show('B quality: strong creative/director/coder, 3 full directions',run(rec,vision=True,divergence=True))
show('C balanced: B, full build for 2 chosen, 1 preview',run(rec,vision=True,divergence=True,fullDirections=2))
show('D lean: B, full build for 1 chosen, 2 previews',run(rec,vision=True,divergence=True,fullDirections=1))
show('B + hero candidates',run(rec,vision=True,divergence=True,heroCandidates=True))
print('per-direction draft A',run(base)['draft directions']/3,'B',run(rec,vision=True)['draft directions']/3)
# sensitivity: coder on gpt-5.1-codex-mini style cheap coder
P['codexmini']=(0.25,2.0,0.03)
alt=dict(rec,coder='codexmini');show('B with cheap coder',run(alt,vision=True,divergence=True))
alt2=dict(rec,director='gem31pro',coder='sonnet55');show('B director gemini 3.1 pro',run(alt2,vision=True,divergence=True))
print('\nLADDER')
P['gem37flash']=(0.75,3.75,0.075)
steps=[
 ('0 now (all 2.5 Flash, flash image)',base,{}),
 ('1 same-price swaps: support roles+reader Haiku 5.5, image nano-banana-2.1',dict(base,reader='haiku55',support='haiku55',image='nb21'),{}),
 ('2 + ideas: creative planning Sonnet 5.5, idea critic Gemini 3.1 Pro, planners see images, 12 raw ideas',dict(base,reader='haiku55',support='haiku55',image='nb21',creative='sonnet55',brandagent='sonnet55',ideacritic='gem31pro'),dict(vision=True,divergence=True)),
 ('3 + director Sonnet 5.5',dict(base,reader='haiku55',support='haiku55',image='nb21',creative='sonnet55',brandagent='sonnet55',ideacritic='gem31pro',director='sonnet55'),dict(vision=True,divergence=True)),
 ('4 + live critic Gemini 3.7 Flash (cross-family vision)',dict(base,reader='haiku55',support='haiku55',image='nb21',creative='sonnet55',brandagent='sonnet55',ideacritic='gem31pro',director='sonnet55',livecritic='gem37flash'),dict(vision=True,divergence=True)),
 ('5 + coder Sonnet 5.5',dict(base,reader='haiku55',support='haiku55',image='nb21',creative='sonnet55',brandagent='sonnet55',ideacritic='gem31pro',director='sonnet55',livecritic='gem37flash',coder='sonnet55'),dict(vision=True,divergence=True)),
 ('6 = 5 but full build for 2 AD-chosen directions, 1 key-frame preview',dict(base,reader='haiku55',support='haiku55',image='nb21',creative='sonnet55',brandagent='sonnet55',ideacritic='gem31pro',director='sonnet55',livecritic='gem37flash',coder='sonnet55'),dict(vision=True,divergence=True,fullDirections=2)),
 ('7 = 5 but full build for 1 chosen, 2 previews',dict(base,reader='haiku55',support='haiku55',image='nb21',creative='sonnet55',brandagent='sonnet55',ideacritic='gem31pro',director='sonnet55',livecritic='gem37flash',coder='sonnet55'),dict(vision=True,divergence=True,fullDirections=1)),
]
for name,cfg,kw in steps:
    t=run(cfg,**kw);print(f"{name:95s} total ${t['total']:.2f}  (planning {t['planning']+t['idea review']+t['brand reading']:.2f}, drafts {t['draft directions']+t.get('previews',0):.2f})")
