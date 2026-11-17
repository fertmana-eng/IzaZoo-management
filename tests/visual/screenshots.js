// Take full-page screenshots of every screen and window, portrait and landscape.
// Usage (from the project folder):  node tests/visual/screenshots.js tests/visual/out/before
// Then change the code, run again into .../after, and compare with compare.js.
const {chromium}=require('playwright');const fs=require('fs'),http=require('http'),path=require('path');
const REPO=path.resolve(__dirname,'../..'),OUT=path.resolve(process.argv[2]||path.join(__dirname,'out/shots'));fs.mkdirSync(OUT,{recursive:true});
const STUB=fs.readFileSync(path.join(__dirname,'../fake-supabase.js'),'utf8');
const srv=http.createServer((req,res)=>{let f=req.url.split('?')[0];if(f==='/')f='/index.html';const p=path.join(REPO,f);if(!fs.existsSync(p)){res.writeHead(404);return res.end();}res.writeHead(200,{'content-type':f.endsWith('.html')?'text/html; charset=utf-8':f.endsWith('.svg')?'image/svg+xml':f.endsWith('.png')?'image/png':'text/javascript'});res.end(fs.readFileSync(p));});
// a small two-page PDF and two sample documents (business 1, two categories)
const SAMPLE_PDF=(()=>{const objs=['<</Type/Catalog/Pages 2 0 R>>','<</Type/Pages/Kids[3 0 R 5 0 R]/Count 2>>'];
  for(let i=0;i<2;i++){const c=`0 0 ${i?1:0.5} rg 30 30 240 340 re f`;objs.push(`<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 400]/Contents ${4+i*2} 0 R/Resources<<>>>>`);objs.push(`<</Length ${c.length}>>stream\n${c}\nendstream`);}
  let out='%PDF-1.4\n';const offs=[];objs.forEach((o,i)=>{offs.push(out.length);out+=`${i+1} 0 obj${o}endobj\n`;});const x=out.length;
  out+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`+offs.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+`trailer<</Root 1 0 R/Size ${objs.length+1}>>\nstartxref\n${x}\n%%EOF`;
  return Buffer.from(out,'latin1').toString('base64');})();
const seedDocs=p=>p.evaluate(async b64=>{const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
  switchBusiness('1');
  [{id:1,title:'נוהל פתיחת בוקר',category_id:1,is_pinned:true},{id:2,title:'ניקיון מטבח בסוף משמרת',category_id:2,is_pinned:false}].forEach(k=>{
    __db.knowledge_items.push({body:'',all_businesses:false,is_archived:false,updated_at:'2026-09-01T10:00:00Z',file_path:`f${k.id}.pdf`,file_name:`f${k.id}.pdf`,file_type:'application/pdf',file_size:184320,...k});
    __db.knowledge_businesses.push({knowledge_id:k.id,business_id:1});
    (window.__files||(window.__files={}))[`knowledge/f${k.id}.pdf`]=new Blob([bytes],{type:'application/pdf'});});
  await loadKnowledge();navigateModule('docs');},SAMPLE_PDF);
const STATES=[
 ['login',null,{noSession:true}],
 ['home',async p=>{}],
 ['home-scrolled',async p=>{await p.evaluate(()=>window.scrollTo(0,600));}],
 ['problems',async p=>{await p.evaluate(()=>navigateModule('problems'));}],
 ['problem-detail',async p=>{await p.evaluate(()=>{navigateModule('problems');openProblemDetails(1);});}],
 ['problem-edit',async p=>{await p.evaluate(()=>{navigateModule('problems');editProblem(1);});}],
 ['problem-new',async p=>{await p.evaluate(()=>{switchBusiness('1');navigateModule('problems');newProblem();});}],
 ['tasks',async p=>{await p.evaluate(()=>navigateModule('tasks'));}],
 ['task-detail',async p=>{await p.evaluate(()=>{navigateModule('tasks');openTaskDetails(1);});}],
 ['task-new',async p=>{await p.evaluate(()=>{switchBusiness('1');navigateModule('tasks');newTask();});}],
 ['updates',async p=>{await p.evaluate(()=>navigateModule('updates'));}],
 ['updates-reply',async p=>{await p.evaluate(()=>{navigateModule('updates');});await p.evaluate(()=>{const t=[...document.querySelectorAll('.update-thread')].find(e=>e.offsetParent);toggleReplyComposer(t.querySelector('.chat-reply-action'));});await p.waitForTimeout(1200);}],
 ['updates-menu',async p=>{await p.evaluate(()=>{navigateModule('updates');const b=[...document.querySelectorAll('.composer-send-btn')].find(e=>e.offsetParent);toggleComposerMenu(b);});}],
 ['docs',async p=>{await p.evaluate(()=>navigateModule('docs'));}],
 ['user',async p=>{await p.evaluate(()=>userScreen());}],
 ['feedback',async p=>{await p.evaluate(()=>feedbackScreen());}],
 ['admin',async p=>{await p.evaluate(()=>adminScreen());}],
 ['admin-newuser',async p=>{await p.evaluate(async()=>{await adminScreen();newAdminUser();});}],
 ['search',async p=>{await p.evaluate(()=>{const i=[...document.querySelectorAll('.stable-search input')].find(e=>e.offsetParent);i.value='Le';liveSearch('home','Le',i);});}],
 ['calendar-day',async p=>{await p.evaluate(()=>calendarDay(isoToday()));}],
 ['exit',async p=>{await p.evaluate(()=>{exitConfirmOpen=false;showExitConfirmation();});}],
 ['logout',async p=>{await p.evaluate(()=>confirmLogout());}],
 ['install',async p=>{await p.evaluate(()=>maybeShowInstallOffer());}],
 ['toast',async p=>{await p.evaluate(()=>toast('בדיקה','error'));await p.waitForTimeout(300);}],
 ['offline',async p=>{await p.evaluate(()=>{document.body.insertAdjacentHTML('afterbegin','<div id="offlineBar" class="offline-bar">אין חיבור לרשת</div>');});}],
 ['docs-items',async p=>{await seedDocs(p);}],
 ['knowledge-new',async p=>{await p.evaluate(()=>{switchBusiness('1');navigateModule('docs');newKnowledge();});}],
 ['knowledge',async p=>{await seedDocs(p);await p.evaluate(()=>openKnowledge(1));await p.waitForFunction(()=>document.querySelectorAll('#docPages canvas').length===2,null,{timeout:15000});}],
 ['password',async p=>{await p.evaluate(()=>changePasswordModal(true));}],
];
(async()=>{await new Promise(r=>srv.listen(0,r));const port=srv.address().port;const b=await chromium.launch();
 const errs=[];
 for(const [vpName,vp] of [['portrait',{width:390,height:844}],['landscape',{width:1280,height:800}]]){
  for(const [name,act,cfg] of STATES){
   const ctx=await b.newContext({viewport:vp,serviceWorkers:'block',timezoneId:'Asia/Jerusalem',locale:'he-IL',reducedMotion:'reduce'});
   const page=await ctx.newPage();page.on('pageerror',e=>errs.push(name+': '+e));page.on('dialog',d=>d.accept());
   await page.clock.setFixedTime(new Date('2026-09-04T09:00:00Z'));
   await page.addInitScript(c=>{window.__cfg=c;localStorage.setItem('izazoo_current_business','all');},cfg||{});
   await page.route('**/vendor/supabase.js',r=>r.fulfill({contentType:'text/javascript',body:STUB}));
   await page.goto(`http://localhost:${port}/`);await page.waitForTimeout(500);
   await page.evaluate(()=>{document.getElementById('installOffer')?.remove();document.querySelector('.app-toast')?.remove();});
   if(act){try{await act(page);}catch(e){errs.push(name+' (setup): '+String(e).split('\n')[0]);}}
   await page.waitForTimeout(250);
   await page.addStyleTag({content:'*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}'});
   if(name!=='toast')await page.evaluate(()=>document.querySelector('.app-toast')?.remove());
   await page.screenshot({path:path.join(OUT,`${vpName}-${name}.png`),fullPage:true});
   await ctx.close();
  }
 }
 if(errs.length)console.log('PAGE ERRORS',errs);console.log('shots done');await b.close();srv.close();
})().catch(e=>{console.error(e);process.exit(1)});
