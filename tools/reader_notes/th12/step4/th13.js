const {chromium}=require('/opt/npm-tools/node_modules/playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const srv=http.createServer((q,res)=>{let f=path.join('/home/claude',decodeURIComponent(q.url.split('?')[0]));fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);res.end();return;}const ct=f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.json')?'application/json':'text/html; charset=utf-8';res.writeHead(200,{'Content-Type':ct});res.end(d);});}).listen(8871);
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:1400,height:900}}); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto('http://localhost:8871/UD-Total-Station/boq/index.html?pricing=/udmaterial-price/lib/pricing-v1.js');
 await p.waitForFunction(()=>S.db&&S.db.wages.length>1000,null,{timeout:120000});
 await p.evaluate(async()=>{const j=await (await fetch('/th12_test.bm.json')).text(); loadModel(j,'th12_test.bm.json');});
 await p.waitForTimeout(1500);
 await p.evaluate(()=>{const x=$$('#tabs .nav-tab').find(x=>x.dataset.tab==='model'); if(x) x.click();}); await p.waitForTimeout(2500);
 const cam=(t,e)=>`(()=>{const v=S.viewer; v.controls.target.set(${t[0]},${t[2]},${-t[1]}); v.camera.position.set(${e[0]},${e[2]},${-e[1]}); v.controls.update();})()`;
 await p.evaluate(()=>{tlDone&&tlDone(); applyPreset('all'); S.viewer.setMarkers([]); S.viewer.setSection(null); S.viewer.scene.fog=null; $('#stage').classList.add('collapsed'); $('#hud').style.display='none'; const tl=document.querySelector('#tl-panel,.tl-panel,#timeline'); if(tl) tl.style.display='none'; const ps=document.querySelector('.side,#side,#panel'); });
 console.log(JSON.stringify(await p.evaluate(()=>{const c=(S.clashes||S.clash||[]); return Array.isArray(c)?c.slice(0,20):Object.keys(c);})));
 const out=process.argv[2]||'.';
 const V=[['n_rear',[3.0,5.9,1.8],[3.0,9.5,2.6]],['n_tops',[2.0,4.5,2.6],[3.0,0.5,5.0]]];
 const shot=async(tag)=>{for(const [n,t,e] of V){await p.evaluate(cam(t,e)); await p.waitForTimeout(800); await p.screenshot({path:`${out}/${n}_${tag}.png`});}};
 await p.evaluate(()=>{S.viewer.edgeOn=true; S.viewer.setSolid(true); S.viewer.setVisible('หลังคา',false); S.viewer.setVisible('ฝ้า',false); S.viewer.setVisible('เหล็กรูปพรรณ',false);}); await shot('solid_edge');

 console.log(errs); await b.close(); srv.close();})();
