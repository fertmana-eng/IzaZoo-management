// Shared helpers for the IzaZoo tests: a tiny web server for the app folder and
// a way to open the app in headless Chromium with a fake (or real) Supabase.
const {chromium}=require('playwright');
const fs=require('fs'),http=require('http'),path=require('path');

const ROOT=path.resolve(__dirname,'..');
const FAKE=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};

function startServer(root=ROOT){
  const srv=http.createServer((req,res)=>{
    let f=decodeURIComponent(req.url.split('?')[0]);if(f==='/')f='/index.html';
    const p=path.join(root,f);
    if(!p.startsWith(root)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.writeHead(404);return res.end();}
    res.writeHead(200,{'content-type':TYPES[path.extname(p)]||'application/octet-stream'});res.end(fs.readFileSync(p));
  });
  return new Promise(r=>srv.listen(0,()=>r({url:`http://localhost:${srv.address().port}/`,close:()=>new Promise(c=>srv.close(c))})));
}

const PORTRAIT={width:390,height:844},LANDSCAPE={width:1280,height:800};

// Open the app. opts: cfg (fake database options), viewport, time (fixed clock),
// realLibrary (use the real supabase-js; pass a route handler for *.supabase.co),
// blockLibrary (simulate the library failing to load), dismissInstall (default true).
async function openApp(browser,url,opts={}){
  const ctx=await browser.newContext({viewport:opts.viewport||PORTRAIT,serviceWorkers:'block',timezoneId:'Asia/Jerusalem',locale:'he-IL'});
  const page=await ctx.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('dialog',d=>d.accept());
  if(opts.time)await page.clock.setFixedTime(new Date(opts.time));
  await page.addInitScript(c=>{window.__cfg=c;},opts.cfg||{});
  if(opts.blockLibrary)await page.route('**/vendor/supabase.js',r=>r.abort());
  else if(!opts.realLibrary)await page.route('**/vendor/supabase.js',r=>r.fulfill({contentType:'text/javascript',body:FAKE}));
  if(opts.realLibrary)await page.route('**/*.supabase.co/**',opts.realLibrary);
  await page.goto(url);await page.waitForTimeout(opts.wait??600);
  if(opts.dismissInstall!==false)await page.evaluate(()=>document.getElementById('installOffer')?.remove());
  return {page,ctx,errors};
}

// Press the browser's back button (ignores the page leaving, which is expected when exiting)
async function back(page,wait=400){try{await page.evaluate(()=>history.back());}catch(e){}await page.waitForTimeout(wait);}

// What the app thinks it shows, what history says, and what is actually drawn
const state=page=>page.evaluate(()=>({
  screen:currentScreen,
  history:history.state?(history.state.exitGuard?'guard'+history.state.level:history.state.view):null,
  drawn:(document.getElementById('root').firstElementChild?.className.match(/module-(\w+)/)||[,'home'])[1],
  modal:document.getElementById('modal')?.innerText.replace(/\s+/g,' ').trim()||null,
}));

const visible=sel=>`${sel} >> visible=true`;

module.exports={chromium,startServer,openApp,back,state,visible,PORTRAIT,LANDSCAPE,ROOT};
