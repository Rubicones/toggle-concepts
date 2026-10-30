import {Suspense} from 'react';
import {CreativeFixturePlayer} from '@/components/studio/creative-fixture-player';
import {sonicdeskFixture} from '@/fixtures/creative/sonicdesk';
import {computeCopyBudget} from '@/packages/creative/copy-budget';
import {compileVariant} from '@/packages/creative/compile-v2';
async function Fixture(){const f=await sonicdeskFixture(),budget=computeCopyBudget(f.brand,f.scope),programs=f.directions.flatMap(d=>f.variants.map(v=>compileVariant(d,f.brand,budget,f.scope.placements.find(p=>p.id===v.placementId)!,v,f.engine,f.resources)));return <CreativeFixturePlayer programs={programs} assetUrls={f.assetUrls}/>;}
export default function CreativeLab(){return <main style={{padding:32}}><h1>M07b creative engine fixture</h1><p>Four ordered formats share one timeline. This hand-authored fixture uses the supplied Sonicdesk wordmark, palette and Archivo file for both type roles. It is a development fixture, not an accepted campaign batch. The live kit still needs its JetBrains Mono file.</p><Suspense fallback={<p>Compiling real-font fixture…</p>}><Fixture/></Suspense></main>;}
