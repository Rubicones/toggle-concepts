import {Suspense} from 'react';
import {DraftReview} from '@/components/studio/draft-review';
async function Review({params}:{params:Promise<{campaignId:string}>}){const {campaignId}=await params;return <DraftReview campaignId={campaignId} audience="client"/>;}
export default function Page({params}:{params:Promise<{campaignId:string}>}){return <Suspense fallback={<p>Loading your creative review…</p>}><Review params={params}/></Suspense>;}
