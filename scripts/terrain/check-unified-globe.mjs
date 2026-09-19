/* Optional browser QA: PLAYWRIGHT_MODULE=/path/to/playwright node scripts/terrain/check-unified-globe.mjs */
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const loadModule=createRequire(import.meta.url);
const {chromium}=loadModule(process.env.PLAYWRIGHT_MODULE||'playwright');
const url=new URL(process.env.GLOBE_URL||'http://localhost:3000/ru/pravoslavna-istoriya?mode=globe&date=2026-01-21');
if(!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Local QA only');
async function main(){
  const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(url.href,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelector('canvas[data-layer-handlers="5"]'),{},{timeout:120000});
    const read=()=>page.locator('canvas[data-instance-id]').evaluate(canvas=>({...canvas.dataset}));
    const baseline=await read();
    for(let i=0;i<50;i++){
      const mode=['calendar','saints','churches','history','globe','map'][i%6];
      await page.locator(`[data-mode-button="${mode}"]`).click();
      await page.waitForFunction(mode=>{
        const canvas=document.querySelector('canvas[data-layers]');
        const layers=JSON.parse(canvas.dataset.layers);
        return ['calendar','saints','churches','events'].every(id=>layers.find(layer=>layer.id===id)?.visible===(id===(mode==='history'?'events':mode)));
      },mode);
      const state=await read();
      for(const key of ['instanceId','liveInstances','cameraPosition','primitives','layerHandlers','preRenderListeners'])assert.equal(state[key],baseline[key],`${key} after mode ${mode}`);
      const sources=JSON.parse(state.sources);
      assert.equal(sources.length,4);
      assert(sources.some(source=>source.name==='CapitalCities'&&source.show&&source.count===215));
    }
    assert.equal(await page.locator('.cesium-widget canvas').count(),1);
    assert.deepEqual(errors,[]);
    const result={switches:50,baseline,after:await read()};
    fs.writeFileSync('/tmp/unified-globe-audit.json',JSON.stringify(result,null,2));
    console.log(JSON.stringify(result,null,2));
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
