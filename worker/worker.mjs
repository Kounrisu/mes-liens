import { chromium } from 'playwright';
import { randomUUID } from 'node:crypto';
import { destination, safeFetch } from './safe-fetch.mjs';
import { pathToFileURL } from 'node:url';

const base=process.env.API_URL ?? 'http://mesliens-api:8080';
const token=process.env.MESLIENS_TOKEN;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function api(path,method='POST',body,contentType='application/json') {
  const r=await fetch(base+path,{method,headers:{'X-Api-Token':token,'X-Forwarded-Proto':'https','Content-Type':contentType},body:body===undefined?undefined:contentType==='application/json'?JSON.stringify(body):body,signal:AbortSignal.timeout(20000)});
  if(!r.ok) throw new Error('API '+r.status);
  return r;
}
export function health(status) { return status===401?'login':status===403?'blocked':status===404||status===410?'missing':status>=200&&status<300?'working':'unavailable'; }
export async function inspect(job, send=api) {
  const result={claimId:job.claimId,url:job.url,status:'unavailable',httpStatus:null,title:'',description:'',finalUrl:'',screenshotId:null};
  try { await destination(job.url); } catch(e) { result.status=e.message==='unsafe'?'unsafe':'unavailable';return result; }
  let browser;
  try {
    browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--disable-quic','--force-webrtc-ip-handling-policy=disable_non_proxied_udp']});
    const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block',acceptDownloads:false});
    await context.routeWebSocket('**/*',ws=>ws.close());
    let requests=0,bytes=0;
    await context.route('**/*',async route=>{
      const req=route.request();
      if(req.method()!=='GET'||++requests>70||bytes>15_000_000) return route.abort();
      try { const response=await safeFetch(req.url());bytes+=response.body.length;
        if(req.isNavigationRequest()&&req.frame()===page.mainFrame()) { result.httpStatus=response.status; result.finalUrl=req.url().slice(0,4096); result.status=health(response.status); }
        await route.fulfill(response);
      } catch(e) { if(req.isNavigationRequest() && e.message==='unsafe') result.status='unsafe'; await route.abort().catch(()=>{}); }
    });
    const page=await context.newPage();page.setDefaultTimeout(12000);
    page.on('dialog',d=>void d.dismiss());
    const cutoff=setTimeout(()=>void browser.close(),45000);
    try {
      await page.goto(job.url,{waitUntil:'domcontentloaded',timeout:30000});
      await page.waitForTimeout(600);
      result.title=(await page.title()).slice(0,1000);
      result.description=await page.evaluate(()=> (document.querySelector('meta[name="description"],meta[property="og:description"]')?.getAttribute('content') ?? '').slice(0,5000));
      if(result.status==='working') {
        if(await page.locator('input[type="password"]').count()) result.status='login';
        else if(/just a moment|access denied|verify you are human|security check/i.test(result.title)) result.status='blocked';
        else if(page.url()!==job.url) result.status='redirected';
      }
      if(['working','redirected'].includes(result.status) && !job.screenshotId) {
        const bytes=await page.screenshot({type:'jpeg',quality:70,fullPage:false,timeout:10000});
        const id=randomUUID();await send('/api/screenshots/'+id,'PUT',bytes,'image/jpeg');result.screenshotId=id;
      }
    } finally {clearTimeout(cutoff);}
  } catch { /* preserve HTTP result when a page cannot render; retry temporary failures */ }
  finally {if(browser)await browser.close().catch(()=>{});}
  return result;
}
async function main() {
if(!token) throw new Error('MESLIENS_TOKEN required');
while(true) {
  try { const jobs=await (await api('/api/insights/claim')).json(); if(jobs.length) { const j=jobs[0];await api('/api/insights/'+j.linkId,'PUT',await inspect(j)); console.log('Page check completed'); } }
  catch { console.error('Page check deferred; retrying later'); }
  await pause(Number(process.env.CHECK_INTERVAL_MS ?? 45000));
}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) await main();
