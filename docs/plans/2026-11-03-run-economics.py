# OpenRouter list prices, $ per 1M tokens (input, output, cached input), fetched 2026-11-03.
P={'flash25':(0.30,2.50,0.03),'haiku55':(0.10,0.50,0.01),'sonnet55':(2.00,10.00,0.10),'gem31pro':(2.00,12.00,0.20),
   'gem37flash':(0.75,3.75,0.075),'codexmini':(0.25,2.00,0.03)}
IMG=0.039   # 1K image, Gemini 2.5 Flash Image or Nano Banana 2.1
def c(m,i,o,cached=0.0):
    pi,po,pc=P[m];return (i*(1-cached)*pi+i*cached*pc+o*po)/1e3   # i,o in thousands of tokens
plan={'research':(20,6),'strategy':(25,10),'variants':(15,4),'script':(35,14),'localization':(25,10),'visual-direction':(35,12)}
CREATIVE=('strategy','script','visual-direction')
def run(cfg,o):
    t={}
    t['brand']=20*c(cfg['reader'],4,1.5)+c(cfg['brandagent'],30,8)+(c(cfg['dna'],40,6) if o.get('dna') else 0)
    p=0
    for r,(i,out) in plan.items():
        m=cfg['creative'] if r in CREATIVE else cfg['support']
        p+=c(m,i+(6 if o.get('vision') and r in CREATIVE else 0)+(2 if o.get('dna') else 0),out)
    if o.get('divergence'):p+=c(cfg['creative'],20,10)
    t['planning']=p
    gates=3*o.get('reviews',1)*c(cfg['ideacritic'],8,2)
    t['idea checks']=gates+o.get('revisions',1)*c(cfg['creative'],40,12)
    # three drafts for the AD
    d=2*c(cfg['director'],30+(o.get('dirExtra',0)),10,0.5)
    d+=o.get('buildTurns',4)*c(cfg['coder'],40,12,0.6)
    d+=o.get('draftRepairs',4)*c(cfg['repairer'],45,4,0.4)
    d+=o.get('criticRounds',2)*c(cfg['livecritic'],60,8)
    d+=4*IMG
    t['3 drafts']=3*d
    if o.get('ranking'):t['3 drafts']+=c(cfg['livecritic'],70,4)            # one side-by-side ranking of the three drafts
    if o.get('finish'):t['finish chosen']=2*c('sonnet55',45,6,0.4)+c(cfg['livecritic'],60,8)   # automatic polish of the pick
    t['total']=sum(t.values());return t
now=dict(reader='flash25',brandagent='flash25',dna='flash25',creative='flash25',support='flash25',ideacritic='flash25',director='flash25',coder='flash25',repairer='flash25',livecritic='flash25')
def show(n,t):print(f"{n:78s} ${t['total']:.2f}  "+'  '.join(f"{k} {v:.2f}" for k,v in t.items() if k!='total'))
show('0 now',run(now,{}))
base=dict(now,reader='haiku55',support='haiku55')
show('1 same-price swaps (Haiku support/reader, Nano Banana 2.1)',run(base,{}))
ideas=dict(base,creative='sonnet55',brandagent='sonnet55',dna='sonnet55',ideacritic='gem31pro')
o2=dict(vision=True,divergence=True,dna=True,reviews=1,revisions=1)
show('2 + brand DNA, ideas on Sonnet with pictures, 12 raw ideas, Gemini 3.1 Pro critic',run(ideas,o2))
d3=dict(ideas,director='sonnet55')
show('3 + director Sonnet for all three drafts',run(d3,dict(o2,dirExtra=8)))
d4=dict(d3,livecritic='gem37flash')
show('4 + live critic Gemini 3.7 Flash, ranking of the three drafts',run(d4,dict(o2,dirExtra=8,ranking=True)))
for coder in ['flash25','codexmini','gem37flash','sonnet55']:
    d5=dict(d4,coder=coder,repairer=coder)
    show(f'5 coder {coder} for the three drafts + Sonnet finish of the pick',run(d5,dict(o2,dirExtra=8,ranking=True,finish=True)))
d6=dict(d4,coder='codexmini',repairer='sonnet55')
show('6 coder codex-mini builds, Sonnet does the 2 self-review looks, + finish of pick',run(d6,dict(o2,dirExtra=8,ranking=True,finish=True,draftRepairs=2,criticRounds=1)))
