// Behaviour tests for IzaZoo. Run from the project folder:  node --test tests/
// Each test opens the app in headless Chromium with a fake database
// (tests/fake-supabase.js) unless it says it uses the real library.
const {test,describe,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {chromium,startServer,openApp,back,state,visible,PORTRAIT,LANDSCAPE}=require('./helpers');

let browser,server;
before(async()=>{browser=await chromium.launch();server=await startServer();});
after(async()=>{await browser.close();await server.close();});
const open=(opts)=>openApp(browser,server.url,opts);

describe('startup and login',()=>{
  test('login screen has no built-in user list and no debug button',async()=>{
    const {page,ctx,errors}=await open({cfg:{noSession:true}});
    const buttons=await page.evaluate(()=>[...document.querySelectorAll('button')].map(b=>b.textContent.trim()));
    assert.ok(buttons.includes('כניסה'));
    assert.ok(!buttons.includes('יומן'),'debug log button must not exist');
    assert.equal(await page.evaluate(()=>typeof USERS),'undefined');
    assert.deepEqual(errors,[]);await ctx.close();
  });
  test('if the database library cannot load, a try-again screen is shown',async()=>{
    const {page,ctx}=await open({blockLibrary:true});
    assert.match(await page.evaluate(()=>document.getElementById('root').innerText),/נסה שוב/);
    await ctx.close();
  });
  test('a network error while loading the profile does not sign the user out',async()=>{
    const {page,ctx,errors}=await open({cfg:{profileError:'NET'}});
    const r=await page.evaluate(()=>({signOuts:window.__signOuts||0,text:document.getElementById('root').innerText}));
    assert.equal(r.signOuts,0);assert.match(r.text,/נסה שוב/);assert.deepEqual(errors,[]);await ctx.close();
  });
  test('a profile that does not exist signs the user out',async()=>{
    const {page,ctx}=await open({cfg:{profileError:'PGRST116'}});
    assert.equal(await page.evaluate(()=>window.__signOuts||0),1);
    assert.ok(await page.isVisible('#lu'));await ctx.close();
  });
  test('a failed data load shows a message instead of empty lists',async()=>{
    const {page,ctx}=await open({cfg:{failTables:['tasks']}});
    assert.match(await page.evaluate(()=>document.querySelector('.app-toast')?.textContent||''),/חלק מהנתונים לא נטענו/);
    await ctx.close();
  });
  test('the forced password change cannot be skipped with the back button',async()=>{
    const {page,ctx}=await open({cfg:{mustChange:true}});
    await page.click('#newPass1');await back(page);await back(page);
    assert.match((await state(page)).modal||'',/נדרשת החלפת סיסמה/);await ctx.close();
  });
});

describe('problems and tasks',()=>{
  test('closing a problem asks first; cancel keeps it open; confirm closes it once',async()=>{
    const {page,ctx,errors}=await open();
    await page.evaluate(()=>navigateModule('problems'));await page.waitForTimeout(300);
    const r=await page.evaluate(async()=>{
      openProblemDetails(1);confirmCloseProblem(1);
      const whileAsking=__db.problems[0].status;
      history.back();await new Promise(r=>setTimeout(r,300));
      const afterCancel=__db.problems[0].status;
      openProblemDetails(1);confirmCloseProblem(1);await doCloseProblem(1,document.querySelector('#modal .primary'));
      return {whileAsking,afterCancel,afterConfirm:__db.problems[0].status,activity:__db.problem_activity.length};
    });
    assert.deepEqual(r,{whileAsking:'open',afterCancel:'open',afterConfirm:'closed',activity:1});
    assert.deepEqual(errors,[]);await ctx.close();
  });
  test('editing a problem or task updates the list right away',async()=>{
    const {page,ctx,errors}=await open();
    const cards=sel=>page.evaluate(s=>[...document.querySelectorAll(s)].filter(e=>e.offsetParent).map(e=>e.innerText),sel);
    await page.click(visible('.portrait-bottom-cat.problem'));await page.waitForTimeout(300);
    await page.click(visible('.problem-card'));await page.click('#modal button:has-text("עריכה")');
    await page.fill('#editTitle','Leak FIXED');await page.click('#modal .primary');await page.waitForTimeout(400);
    await page.click('#modal button:has-text("חזרה")');await page.waitForTimeout(300);
    assert.match((await cards('.problem-card'))[0],/Leak FIXED/);
    await back(page);
    await page.click(visible('.portrait-bottom-cat.task'));await page.waitForTimeout(300);
    await page.click(visible('.task-card'));await page.click('#modal button:has-text("עריכה")');
    await page.fill('#editTaskDescription','Task EDITED');await page.click('#modal .primary');await page.waitForTimeout(400);
    await page.click('#modal button:has-text("חזרה")');await page.waitForTimeout(300);
    assert.match((await cards('.task-card'))[0],/Task EDITED/);
    assert.deepEqual(errors,[]);await ctx.close();
  });
  test('dates use Israel time (00:30 on Sept 5 is Sept 5, not Sept 4)',async()=>{
    const {page,ctx}=await open({time:'2026-09-04T21:30:00Z'});
    const r=await page.evaluate(()=>({today:isoToday(),cell:document.querySelector('.day.today .day-num')?.textContent,
      overdue:isTaskOverdue(tasks[0]),problemDate:problems[0].date}));
    assert.deepEqual(r,{today:'2026-09-05',cell:'5',overdue:true,problemDate:'2026-09-04'});await ctx.close();
  });
});

describe('updates',()=>{
  test('an edit survives returning to the app, and is cancelled (not applied to a new post) after a redraw',async()=>{
    const {page,ctx,errors}=await open();
    await page.evaluate(()=>navigateModule('updates'));await page.waitForTimeout(300);
    const r=await page.evaluate(async()=>{
      const vis=()=>[...document.querySelectorAll('.chat-composer-wrap')].find(e=>e.offsetParent);
      startEditUpdate(5);lastNetworkActivity=0;await refreshOnResume();
      const bannerAfterResume=!vis().querySelector('.composer-edit-banner').hidden;
      switchBusiness('all');
      const bannerAfterRedraw=!vis().querySelector('.composer-edit-banner').hidden;
      vis().querySelector('.composer-input').value='NEW ONE';const n=__db.updates_v2.length;
      await publishFromComposer('all');
      return {bannerAfterResume,bannerAfterRedraw,u5:__db.updates_v2.find(x=>x.id===5).body,created:__db.updates_v2.length-n};
    });
    assert.deepEqual(r,{bannerAfterResume:true,bannerAfterRedraw:false,u5:'Update number 5',created:1});
    assert.deepEqual(errors,[]);await ctx.close();
  });
  test('text being typed is kept when returning to the app',async()=>{
    const {page,ctx}=await open();
    await page.evaluate(()=>navigateModule('updates'));await page.waitForTimeout(300);
    const kept=await page.evaluate(async()=>{
      const vis=()=>[...document.querySelectorAll('.chat-composer-wrap')].find(e=>e.offsetParent);
      vis().querySelector('.composer-input').value='half written';lastNetworkActivity=0;await refreshOnResume();
      return vis().querySelector('.composer-input').value;});
    assert.equal(kept,'half written');await ctx.close();
  });
  test('jumping to an update scrolls to it and highlights it (portrait)',async()=>{
    const {page,ctx}=await open();
    await page.evaluate(()=>navigateModule('updates'));await page.waitForTimeout(300);
    const r=await page.evaluate(async()=>{
      const el=[...document.querySelectorAll('.update-thread[data-update-id="1"]')].find(e=>e.offsetParent);
      const before=el.getBoundingClientRect().top;focusUpdateThread(1);
      await new Promise(r=>setTimeout(r,250));const highlighted=el.classList.contains('chat-highlight');
      await new Promise(r=>setTimeout(r,900));return {moved:Math.abs(el.getBoundingClientRect().top-before)>100,highlighted};});
    assert.deepEqual(r,{moved:true,highlighted:true});await ctx.close();
  });
});

describe('back button and exit',()=>{
  test('back closes the window, then goes home, then asks to exit; "ביטול" stays; back on the question exits',async()=>{
    const {page,ctx,errors}=await open();
    await page.click(visible('.portrait-bottom-cat.problem'));await page.waitForTimeout(300);
    await page.click(visible('.problem-card'));await page.waitForTimeout(200);
    await back(page);let s=await state(page);assert.equal(s.modal,null);assert.equal(s.screen,'problems');
    await back(page);s=await state(page);assert.equal(s.screen,'home');assert.equal(s.modal,null);
    await back(page);s=await state(page);assert.match(s.modal||'',/לצאת מ־IzaZoo/);
    await page.click('#modal .secondary');await page.waitForTimeout(600);
    s=await state(page);assert.equal(s.modal,null);assert.equal(s.history,'home');
    await back(page);s=await state(page);assert.match(s.modal||'',/לצאת מ־IzaZoo/);
    await back(page,600);
    assert.notEqual(page.url().replace(/#.*/,''),server.url,'the second back press should leave the app');
    assert.deepEqual(errors,[]);await ctx.close();
  });
  test('back pressed while the admin screen reloads does not draw the admin screen again',async()=>{
    const {page,ctx,errors}=await open();
    await page.click(visible('button[aria-label="משתמש"]'));await page.waitForTimeout(300);
    await page.click(visible('button:has-text("ניהול מערכת")'));await page.waitForTimeout(500);
    await page.evaluate(()=>{const o=loadAdminData;loadAdminData=async()=>{await new Promise(r=>setTimeout(r,1200));return o();};});
    await page.evaluate(()=>{adminScreen();history.back();});await page.waitForTimeout(2500);
    let s=await state(page);assert.equal(s.screen,'user');assert.equal(s.drawn,'user');
    await back(page,600);s=await state(page);assert.equal(s.screen,'home');
    assert.deepEqual(errors,[]);await ctx.close();
  });
});

describe('screens and orientation',()=>{
  for(const screen of ['home','problems','tasks','updates','docs','user','feedback','admin']){
    test(`${screen}: built once, and redrawn correctly when the phone is turned`,async()=>{
      const {page,ctx,errors}=await open();
      if(screen!=='home'){await page.evaluate(s=>goToScreen(s,{push:true}),screen);await page.waitForTimeout(500);}
      const info=()=>page.evaluate(()=>{const ls=[...document.querySelectorAll('#root .desktop-layout,#root .mobile-layout')];
        return {count:ls.length,shown:ls.filter(e=>getComputedStyle(e).display!=='none').map(e=>e.className.split(' ')[0]).join(),text:document.getElementById('root').innerText.trim().length};});
      const a=await info();await page.setViewportSize(LANDSCAPE);await page.waitForTimeout(500);
      const b=await info();await page.setViewportSize(PORTRAIT);await page.waitForTimeout(500);const c=await info();
      assert.deepEqual([a.count,a.shown],[1,'mobile-layout']);
      assert.deepEqual([b.count,b.shown],[1,'desktop-layout']);
      assert.deepEqual([c.count,c.shown,c.text],[1,'mobile-layout',a.text]);
      assert.ok(a.text>0&&b.text>0);assert.deepEqual(errors,[]);await ctx.close();
    });
  }
  for(const viewport of [PORTRAIT,LANDSCAPE]){
    test(`home works (${viewport.width}x${viewport.height}): calendar, search, open items, calendar day`,async()=>{
      const {page,ctx,errors}=await open({viewport});
      const month=()=>page.evaluate(()=>document.querySelector('.month-label').textContent);
      const m0=await month();await page.click('.calendar-toolbar .small-btn >> nth=0');assert.notEqual(await month(),m0);
      await page.click('.calendar-toolbar .small-btn >> nth=1');assert.equal(await month(),m0);
      await page.fill('.stable-search input','Lea');await page.waitForTimeout(200);
      assert.match(await page.innerText('.search-result-row'),/Leak/);
      await page.click('.search-result-row');await page.waitForTimeout(400);
      let s=await state(page);assert.equal(s.screen,'problems');assert.match(s.modal||'',/פרטי תקלה/);
      await page.evaluate(()=>{hideModal();history.back();});await page.waitForTimeout(400);
      await page.click('.clickable-open-item >> nth=0');await page.waitForTimeout(400);
      assert.notEqual((await state(page)).screen,'home');
      await page.evaluate(()=>{hideModal();history.back();});await page.waitForTimeout(400);
      await page.click('.day.today');await page.waitForTimeout(200);assert.ok((await state(page)).modal);
      const dupIds=await page.evaluate(()=>{const c={};document.querySelectorAll('#root [id]').forEach(e=>c[e.id]=(c[e.id]||0)+1);return Object.keys(c).filter(k=>c[k]>1);});
      assert.deepEqual(dupIds,[]);assert.deepEqual(errors,[]);await ctx.close();
    });
  }
});

describe('real Supabase library (fake server)',()=>{
  const fakeServer=route=>{
    const u=new URL(route.request().url());
    if(u.pathname.startsWith('/auth/v1/token'))return route.fulfill({json:{access_token:'a.b.c',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'r',user:{id:'u1',aud:'authenticated'}}});
    if(u.pathname==='/rest/v1/profiles')return route.fulfill({json:{username:'alex',first_name:'Alex',last_name:'A',display_name:'Alex A',role:'owner',is_active:true,must_change_password:false,all_businesses_access:true}});
    if(u.pathname==='/rest/v1/rpc/get_visible_profiles')return route.fulfill({json:[{id:'u1',display_name:'Alex A',username:'alex',role:'owner',business_ids:[1]}]});
    if(u.pathname==='/rest/v1/businesses')return route.fulfill({json:[{id:1,name:'Biz1',is_active:true}]});
    if(u.pathname==='/rest/v1/updates_v2')return route.fulfill({json:[{id:1,title:'t',body:'Hello team',created_by:'u1',created_at:new Date().toISOString(),all_businesses:true}]});
    return route.fulfill({json:[]});
  };
  test('login screen appears at once, and logging in loads the data',async()=>{
    const {page,ctx,errors}=await open({realLibrary:fakeServer});
    assert.ok(await page.isVisible('#lu'));
    await page.fill('#lu','alex');await page.fill('#lp','secret');await page.click('#loginBtn');await page.waitForTimeout(1500);
    const r=await page.evaluate(()=>({greeting:document.querySelector('.portrait-single-header h1')?.textContent,updates:updates.length,toast:document.querySelector('.app-toast')?.textContent||null}));
    assert.deepEqual(r,{greeting:'שלום, Alex',updates:1,toast:null});assert.deepEqual(errors,[]);await ctx.close();
  });
  test('a server that never answers shows a clear message within seconds',{timeout:30000},async()=>{
    const ctx=await browser.newContext({viewport:PORTRAIT,serviceWorkers:'block'});const page=await ctx.newPage();
    await page.addInitScript(()=>localStorage.setItem('sb-ocfbgppfpvjfhclpdtao-auth-token',JSON.stringify({access_token:'a.b.c',refresh_token:'r',expires_at:Math.floor(Date.now()/1000)-10,expires_in:3600,token_type:'bearer',user:{id:'u1'}})));
    await page.route('**/*.supabase.co/**',()=>{});await page.goto(server.url);
    await page.waitForFunction(()=>/אין תשובה משרת הנתונים/.test(document.getElementById('root').innerText),null,{timeout:15000});
    await ctx.close();
  });
});
