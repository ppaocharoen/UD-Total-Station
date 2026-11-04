const {chromium}=require('/opt/npm-tools/node_modules/playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const srv=http.createServer((q,res)=>{let f=path.join('/home/claude',decodeURIComponent(q.url.split('?')[0]));fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);res.end();return;}const ct=f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.json')?'application/json':'text/html; charset=utf-8';res.writeHead(200,{'Content-Type':ct});res.end(d);});}).listen(8864);
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:1400,height:900}}); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto('http://localhost:8864/UD-Total-Station/boq/index.html?pricing=/udmaterial-price/lib/pricing-v1.js');
 await p.waitForFunction(()=>S.db&&S.db.wages.length>1000,null,{timeout:120000});
 await p.evaluate(async()=>{const j=await (await fetch('/th12_test.bm.json')).text(); loadModel(j,'th12_test.bm.json');});
 await p.waitForTimeout(1500);
 await p.evaluate(()=>{const x=$$('#tabs .nav-tab').find(x=>x.dataset.tab==='model'); if(x) x.click();}); await p.waitForTimeout(2500);
 const cam=(t,e)=>`(()=>{const v=S.viewer; v.controls.target.set(${t[0]},${t[2]},${-t[1]}); v.camera.position.set(${e[0]},${e[2]},${-e[1]}); v.controls.update();})()`;
 await p.evaluate(()=>{tlDone&&tlDone(); applyPreset('all'); S.viewer.scene.fog=null; $('#stage').classList.add('collapsed'); $('#hud').style.display='none';});
 const out=process.argv[2]||'.';
 const shots=[['rb_all',null,[5.4,2.9,0.5],[-6,-9,7]],['rb_F1','F1-1B',null,null],['rb_F2','F2-1A',null,null],['rb_GB','GB-01',null,null],['rb_C','C-1B',null,null],['rb_PD','PD-1B',null,null],['rb_ramp','S-RB',null,null],['rb_WK','S-WK-W',null,null]];
 for(const [n,id,t,e] of shots){
   if(!id){ await p.evaluate(()=>{const v=S.viewer; v.setVisible('หลังคา',false); v.setXray(true); v.groups['เหล็กเสริม']&&(v.groups['เหล็กเสริม'].visible=true); const m=S.model; const ids=[...(m.supports||[]).map(x=>x.id),...(m.members||[]).map(x=>x.id),...(m.slabs||[]).filter(s=>!/^S-(W|D|E)/.test(s.id)||/WK/.test(s.id)).map(x=>x.id)]; return v.setRebar(ids.filter(i=>v.hasRebar(i)));}); await p.evaluate(cam(t,e)); }
   else { await p.evaluate(id=>{rbOne(id);},id); }
   await p.waitForTimeout(1500); await p.screenshot({path:`${out}/${n}.png`});
 }
 const sum=await p.evaluate(()=>{const r=RebarTk.compute(S.model).filter(r=>/^(rebar_|wiremesh)/.test(r.key)).map(r=>[r.key,r.qty]);return r;});
 console.log(JSON.stringify(sum), errs); await b.close(); srv.close();})();
