import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { studioCampaignRecord } from '../packages/contracts/campaign-record';

declare global {
  interface Window {
    studioLiveTest: {
      emit: (revisions: Record<string,string>) => void;
      visibility: (state: string) => void;
      connections: () => number;
    };
  }
}

async function main() {
  const base = process.env.STUDIO_URL ?? 'http://127.0.0.1:3100';
  assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    const counts = new Map<string,number>(), errors:string[] = [];
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript({content:`(() => {
      let visibility = 'visible', revisions = {work:'initial',workspace:'initial',agents:'initial'};
      const sources = [];
      class FakeSource {
        constructor() { this.closed=false;this.onmessage=null;sources.push(this);setTimeout(()=>this.emit(),0); }
        close(){this.closed=true;}
        emit(){if(!this.closed&&this.onmessage)this.onmessage({data:JSON.stringify(revisions)});}
      }
      Object.defineProperty(window,'EventSource',{value:FakeSource});
      Object.defineProperty(document,'visibilityState',{get:()=>visibility});
      window.studioLiveTest = {
        emit(next){revisions={...revisions,...next};sources.forEach(source=>source.emit());},
        visibility(next){visibility=next;document.dispatchEvent(new Event('visibilitychange'));},
        connections(){return sources.filter(source=>!source.closed).length;},
      };
    })();`});
    const campaignId='10000000-0000-4000-8000-000000000002',runId='10000000-0000-4000-8000-000000000003',stepId='10000000-0000-4000-8000-000000000004';
    let goal='Initial saved goal';
    const campaign=()=>({id:campaignId,name:'Egress verification',brand:'Local fixture',goal,document:{},version:1,created_at:'2026-10-26T10:00:00Z'});
    const step={id:stepId,campaign_id:campaignId,run_id:runId,role:'strategy',model_id:'test/model',status:'succeeded',cost_micro_usd:100,reserve_micro_usd:0,error_code:null,created_at:'2026-10-26T10:00:00Z'};
    const detail=`/api/studio/campaigns/${campaignId}`,resultPath=`/api/studio/runs/${runId}/steps?step=${stepId}`;
    await page.route('**/api/**',async route=>{
      const url=new URL(route.request().url()),path=url.pathname+url.search;
      counts.set(path,(counts.get(path)??0)+1);
      let value:unknown;
      if(path==='/api/studio/state')value={schemaVersion:'1.0',workspaceName:'Toggle Studio',interfaceLocale:'en',reducedMotion:false,campaigns:[studioCampaignRecord(campaign())]};
      else if(path==='/api/local-worker')value={online:false,status:null,reason:'not-started'};
      else if(path===detail)value={campaign:campaign(),runs:[],steps:[step],events:[],next:null};
      else if(path===detail+'/run')value={schemaReady:true,workerOnline:false,brief:null,book:null,run:null,control:null,round:null,jobs:[],changes:[],steps:[]};
      else if(path.startsWith('/api/studio/media'))value={assets:[],uploads:[]};
      else if(path===resultPath)value={...step,prompt:'Original saved request',output:'Saved agent result',usage:null};
      else throw new Error(`Unexpected API request: ${path}`);
      await route.fulfill({json:value});
    });
    await page.goto(`${base}/campaigns/${campaignId}`);
    await expect(page.getByRole('heading',{name:'Egress verification'})).toBeVisible();
    await expect(page.getByText('Initial saved goal',{exact:true})).toBeVisible();
    await page.waitForTimeout(700);
    assert.equal(await page.evaluate(()=>window.studioLiveTest.connections()),1);
    assert.equal([...counts.keys()].some(path=>path.startsWith('/api/studio/media')),false,'Closed advanced tools must not fetch media');
    const baseline=new Map(counts);
    await page.waitForTimeout(6500);
    for(const [path,count]of counts)if(path!=='/api/local-worker')assert.equal(count,baseline.get(path),`Idle request: ${path}`);
    goal='Agent progress saved';
    await page.evaluate(()=>window.studioLiveTest.emit({work:'saved-result'}));
    await expect(page.getByText(goal,{exact:true})).toBeVisible();
    assert.equal(counts.get('/api/studio/state'),baseline.get('/api/studio/state'),'Agent progress must not reload the workspace list');
    await page.getByText('Advanced tools · manual runs & media',{exact:true}).click();
    await expect(page.getByText('View request & saved result',{exact:true})).toBeVisible();
    assert.equal(counts.get(resultPath),undefined,'An unopened result must not be fetched');
    await page.getByText('View request & saved result',{exact:true}).click();
    await expect(page.getByText('Saved agent result',{exact:true})).toBeVisible();
    assert.equal(counts.get(resultPath),1);
    await page.evaluate(()=>window.studioLiveTest.visibility('hidden'));
    assert.equal(await page.evaluate(()=>window.studioLiveTest.connections()),0);
    const hiddenCount=counts.get(detail);
    goal='Result saved while hidden';
    await page.evaluate(()=>window.studioLiveTest.emit({work:'hidden-result'}));
    await page.waitForTimeout(800);
    assert.equal(counts.get(detail),hiddenCount);
    await page.evaluate(()=>window.studioLiveTest.visibility('visible'));
    await expect(page.getByText(goal,{exact:true})).toBeVisible();
    assert.equal(counts.get(resultPath),1,'A completed result stays immutable across progress notifications');
    assert.deepEqual(errors,[]);
    console.log('PASS: idle screens make no recurring database requests; one shared push connection updates results; hidden tabs catch up; advanced tools and saved outputs load on demand.');
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
