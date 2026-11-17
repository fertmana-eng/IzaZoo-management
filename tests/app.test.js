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

describe('knowledge (ידע ונהלים): documents',()=>{
  // a small valid PDF with the given number of pages (each page a coloured box)
  const makePdf=(pages=1)=>{
    const objs=['<</Type/Catalog/Pages 2 0 R>>',`<</Type/Pages/Kids[${Array.from({length:pages},(_,i)=>`${3+i*2} 0 R`).join(' ')}]/Count ${pages}>>`];
    for(let i=0;i<pages;i++){const c=`0 0 ${i%2?1:0.5} rg 30 30 240 340 re f`;
      objs.push(`<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 400]/Contents ${4+i*2} 0 R/Resources<<>>>>`);
      objs.push(`<</Length ${c.length}>>stream\n${c}\nendstream`);}
    let out='%PDF-1.4\n';const offs=[];
    objs.forEach((o,i)=>{offs.push(out.length);out+=`${i+1} 0 obj${o}endobj\n`;});
    const x=out.length;
    out+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`+offs.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+`trailer<</Root 1 0 R/Size ${objs.length+1}>>\nstartxref\n${x}\n%%EOF`;
    return Buffer.from(out,'latin1');
  };
  // put documents straight into the fake database and file store
  const seed=(page,items)=>page.evaluate(async([items,b64])=>{
    const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
    for(const k of items){
      __db.knowledge_items.push({body:'',category_id:null,all_businesses:false,is_archived:false,is_pinned:false,updated_at:'2026-11-01T10:00:00Z',file_path:`f${k.id}.pdf`,file_name:`f${k.id}.pdf`,file_type:'application/pdf',file_size:bytes.length,...k});
      (window.__files||(window.__files={}))[`knowledge/f${k.id}.pdf`]=new Blob([bytes],{type:'application/pdf'});
      if(!k.all_businesses)(k.businesses||[1]).forEach(b=>__db.knowledge_businesses.push({knowledge_id:k.id,business_id:b}));
    }
    await loadKnowledge();navigateModule('docs');
  },[items,makePdf(2).toString('base64')]);
  const cards=page=>page.evaluate(()=>[...document.querySelectorAll('.knowledge-card')].filter(e=>e.offsetParent).map(e=>e.innerText.replace(/\s+/g,' ')));
  const chips=page=>page.evaluate(()=>[...document.querySelectorAll('.doc-chips')].filter(e=>e.offsetParent).map(r=>[...r.querySelectorAll('.doc-chip')].map(c=>(c.classList.contains('active')?'*':'')+c.textContent)));
  const toastText=page=>page.evaluate(()=>document.querySelector('.app-toast')?.textContent||'');

  test('an admin uploads a PDF; it appears in the list with its size',async()=>{
    const {page,ctx,errors}=await open();
    await page.evaluate(()=>navigateModule('docs'));await page.waitForTimeout(300);
    assert.match(await page.innerText(visible('.knowledge-page')),/אין עדיין מסמכים/);
    await page.click(visible('.cat-plus-btn'));
    await page.setInputFiles('#nkFile',{name:'נוהל פתיחה.pdf',mimeType:'application/pdf',buffer:makePdf(1)});
    assert.equal(await page.inputValue('#nkTitle'),'נוהל פתיחה','title is taken from the file name');
    await page.selectOption('#nkCategory','1');
    await page.click('#modal .primary');await page.waitForTimeout(500);
    assert.match((await cards(page))[0],/נוהל פתיחה.*פתיחה.*KB/);
    const r=await page.evaluate(()=>({row:__db.knowledge_items[0],files:Object.keys(window.__files||{})}));
    assert.match(r.row.file_path,/\.pdf$/);assert.equal(r.row.file_name,'נוהל פתיחה.pdf');assert.equal(r.row.category_id,1);
    assert.deepEqual(r.files,['knowledge/'+r.row.file_path]);
    assert.deepEqual(errors,[]);await ctx.close();
  });
  test('only PDF files up to 20 MB are accepted, and a failed upload saves nothing',async()=>{
    const {page,ctx}=await open({cfg:{failUpload:true}});
    await page.evaluate(()=>navigateModule('docs'));await page.waitForTimeout(300);
    await page.click(visible('.cat-plus-btn'));
    await page.setInputFiles('#nkFile',{name:'notes.txt',mimeType:'text/plain',buffer:Buffer.from('hello')});
    await page.click('#modal .primary');await page.waitForTimeout(200);
    assert.match(await toastText(page),/רק קובצי PDF/);
    await page.setInputFiles('#nkFile',{name:'big.pdf',mimeType:'application/pdf',buffer:Buffer.alloc(21*1024*1024)});
    await page.click('#modal .primary');await page.waitForTimeout(200);
    assert.match(await toastText(page),/גדול מדי/);
    await page.setInputFiles('#nkFile',{name:'ok.pdf',mimeType:'application/pdf',buffer:makePdf(1)});
    await page.click('#modal .primary');await page.waitForTimeout(400);
    assert.match(await toastText(page),/העלאת הקובץ נכשלה/);
    assert.equal(await page.evaluate(()=>__db.knowledge_items.length),0);
    await ctx.close();
  });
  test('opening a document shows its pages inside the app',async()=>{
    const {page,ctx,errors}=await open();
    await seed(page,[{id:1,title:'נוהל סגירה'}]);await page.waitForTimeout(300);
    await page.click(visible('.knowledge-card'));
    await page.waitForFunction(()=>document.querySelectorAll('#docPages canvas.doc-page').length===2,null,{timeout:15000});
    const r=await page.evaluate(()=>({sizes:[...document.querySelectorAll('#docPages canvas')].map(c=>c.width>0&&c.height>0),
      // pages must be drawn left-to-right: inheriting the app's right-to-left direction scrambles the text
      directions:[...document.querySelectorAll('#docPages canvas')].map(c=>getComputedStyle(c).direction+'/'+c.getContext('2d').direction),
      buttons:[...document.querySelectorAll('#modal button')].map(b=>b.textContent.trim())}));
    assert.deepEqual(r.sizes,[true,true]);
    assert.deepEqual(r.directions,['ltr/ltr','ltr/ltr']);
    assert.ok(r.buttons.includes('הורדה')&&r.buttons.includes('פרטים')&&r.buttons.includes('הסרה'));
    await back(page);assert.equal((await state(page)).modal,null,'back closes the viewer');
    assert.deepEqual(errors,[]);await ctx.close();
  });
  test('documents are filtered by business and by category within the business',async()=>{
    const {page,ctx,errors}=await open();
    await page.evaluate(()=>switchBusiness('1'));
    await seed(page,[{id:1,title:'A פתיחה',category_id:1,businesses:[1]},{id:2,title:'B מטבח',category_id:2,businesses:[1]},{id:3,title:'C עסק שני',category_id:1,businesses:[2]}]);
    await page.waitForTimeout(300);
    assert.deepEqual(await chips(page),[['כל העסקים','*Biz1','Biz2'],['*הכל','פתיחה','מטבח']]);
    assert.equal((await cards(page)).length,2);
    await page.click(visible('.doc-chip:has-text("מטבח")'));
    let c=await cards(page);assert.equal(c.length,1);assert.match(c[0],/B מטבח/);
    await page.click(visible('.doc-chip:has-text("Biz2")'));await page.waitForTimeout(200);
    c=await cards(page);assert.equal(c.length,1);assert.match(c[0],/C עסק שני/);
    assert.deepEqual((await chips(page)).length,1,'one category in this business: no category filter');
    assert.deepEqual(errors,[]);await ctx.close();
  });
  test('editing details and replacing the file; the old file is removed',async()=>{
    const {page,ctx,errors}=await open();
    await seed(page,[{id:1,title:'ישן'}]);await page.waitForTimeout(300);
    await page.click(visible('.knowledge-card'));await page.click('#modal button:has-text("פרטים")');
    await page.fill('#ekTitle','חדש');
    await page.setInputFiles('#ekFile',{name:'v2.pdf',mimeType:'application/pdf',buffer:makePdf(1)});
    await page.click('#modal .primary');await page.waitForTimeout(600);
    assert.match((await cards(page))[0],/חדש/);
    const r=await page.evaluate(()=>({row:__db.knowledge_items[0],files:Object.keys(window.__files),version:__db.knowledge_versions[0]}));
    assert.equal(r.row.file_name,'v2.pdf');
    assert.ok(!r.files.includes('knowledge/f1.pdf'),'old file removed');assert.ok(r.files.includes('knowledge/'+r.row.file_path));
    assert.equal(r.version.title,'ישן');assert.equal(r.version.file_name,'f1.pdf');
    assert.deepEqual(errors,[]);await ctx.close();
  });
  test('"הסרה" asks: archive (can be restored) or delete for good; cancel changes nothing',async()=>{
    const {page,ctx,errors}=await open();
    await seed(page,[{id:1,title:'נוהל ישן'}]);await page.waitForTimeout(300);
    await page.click(visible('.knowledge-card'));await page.click('#modal button:has-text("הסרה")');
    assert.match((await state(page)).modal||'',/להסיר את המסמך.*העברה לארכיון.*מחיקה לצמיתות/s);
    await page.click('#modal button:has-text("ביטול")');
    assert.equal(await page.evaluate(()=>__db.knowledge_items[0].is_archived),false,'cancel changes nothing');
    await page.click('#modal button:has-text("הסרה")');await page.click('#modal button:has-text("העברה לארכיון")');await page.waitForTimeout(400);
    assert.match(await page.innerText(visible('.knowledge-page')),/ארכיון/);
    await page.click(visible('.knowledge-card'));await page.click('#modal button:has-text("החזר לפעילים")');await page.waitForTimeout(400);
    assert.doesNotMatch(await page.innerText(visible('.knowledge-page')),/ארכיון/);
    assert.deepEqual(errors,[]);await ctx.close();
  });
  test('deleting for good removes the document and its file (from "הסרה" or from the archive)',async()=>{
    const {page,ctx,errors}=await open();
    await seed(page,[{id:1,title:'למחיקה'},{id:2,title:'בארכיון',is_archived:true}]);await page.waitForTimeout(300);
    await page.click(visible('.knowledge-card:has-text("למחיקה")'));await page.click('#modal button:has-text("הסרה")');
    await page.click('#modal button:has-text("מחיקה לצמיתות")');await page.waitForTimeout(400);
    let r=await page.evaluate(()=>({items:__db.knowledge_items.map(k=>k.id),files:Object.keys(window.__files)}));
    assert.deepEqual(r,{items:[2],files:['knowledge/f2.pdf']});
    await page.click(visible('.knowledge-card:has-text("בארכיון")'));await page.click('#modal button:has-text("מחיקה לצמיתות")');
    assert.match((await state(page)).modal||'',/למחוק לצמיתות/);
    await page.click('#modal .danger-btn');await page.waitForTimeout(400);
    r=await page.evaluate(()=>({items:__db.knowledge_items.length,files:Object.keys(window.__files).length}));
    assert.deepEqual(r,{items:0,files:0});
    assert.match(await page.innerText(visible('.knowledge-page')),/אין עדיין מסמכים/);
    assert.deepEqual(errors,[]);await ctx.close();
  });
  test('a manager can view and download, but cannot upload, edit or archive',async()=>{
    const {page,ctx,errors}=await open({cfg:{role:'manager'}});
    await seed(page,[{id:1,title:'בטיחות'},{id:2,title:'ישן',is_archived:true}]);await page.waitForTimeout(300);
    assert.equal(await page.locator(visible('.cat-plus-btn')).count(),0);
    assert.equal((await cards(page)).length,1,'archived documents are hidden');
    await page.click(visible('.knowledge-card'));
    assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('#modal button')].map(b=>b.textContent.trim())),['חזרה','הורדה']);
    await page.waitForFunction(()=>document.querySelectorAll('#docPages canvas').length===2,null,{timeout:15000});
    assert.deepEqual(errors,[]);await ctx.close();
  });
  test('search finds documents, on home and in the knowledge screen',async()=>{
    const {page,ctx}=await open();
    await seed(page,[{id:9,title:'הכנת קפה',all_businesses:true}]);
    await page.evaluate(()=>dashboard());
    await page.fill(visible('.stable-search input'),'קפה');await page.waitForTimeout(200);
    assert.match(await page.innerText('.search-result-row'),/הכנת קפה/);
    await page.click('.search-result-row');await page.waitForTimeout(400);
    const s=await state(page);assert.equal(s.screen,'docs');assert.match(s.modal||'',/הכנת קפה/);
    await ctx.close();
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
