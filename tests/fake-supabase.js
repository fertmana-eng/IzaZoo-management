// Fake Supabase client used by the tests instead of the real database.
// It keeps a small in-memory database (window.__db) and records every call (window.__ops).
// Options are read from window.__cfg: noSession, mustChange, failTables[], profileError,
// role ("owner" by default; "manager" or "admin" are limited to business 1).
(function(){
  const cfg=window.__cfg||{};
  const now=()=>new Date().toISOString();
  const db={
    profiles:[{id:"u1",username:"alex",first_name:"Alex",last_name:"A",display_name:"Alex A",role:cfg.role||"owner",is_active:true,must_change_password:!!cfg.mustChange,all_businesses_access:!cfg.role||cfg.role==="owner",business_ids:[1,2]}],
    businesses:[{id:1,name:"Biz1",is_active:true},{id:2,name:"Biz2",is_active:true}],
    user_businesses:[{user_id:"u1",business_id:1}],
    problems:[{id:1,title:"Leak",description:"d",status:"open",priority:"normal",created_by:"u1",assigned_to:null,created_at:"2026-09-03T22:30:00Z",updated_at:now(),closed_at:null,closed_by:null,business_id:1}],
    problem_activity:[],
    tasks:[{id:1,description:"Task due 4th",business_id:1,created_by:"u1",created_at:"2026-09-01T10:00:00Z",assigned_to:null,due_date:"2026-09-04",status:"open"}],
    updates_v2:Array.from({length:30},(_,i)=>({id:i+1,title:"u"+(i+1),body:"Update number "+(i+1),created_by:"u1",created_at:new Date(Date.UTC(2026,7,1+i,10)).toISOString(),updated_at:now(),expires_at:null,is_archived:false,is_pinned:false,all_businesses:true})),
    update_businesses:[],update_followups:[],knowledge_items:[],knowledge_businesses:[],knowledge_versions:[],knowledge_categories:[],beta_feedback:[],admin_activity:[]
  };
  window.__db=db;window.__ops=[];
  function q(table){
    const st={op:"select",filters:[],single:false,payload:null};
    const b={
      select(){return b},order(){return b},limit(){return b},
      eq(k,v){st.filters.push([k,v]);return b},
      or(x){st.or=x;return b},
      in(k,v){st.inF=[k,v];return b},
      insert(p){st.op="insert";st.payload=p;return b},
      update(p){st.op="update";st.payload=p;return b},
      single(){st.single=true;return b},
      then(res,rej){
        window.__ops.push({table,op:st.op,payload:st.payload,filters:st.filters,or:st.or,inF:st.inF});
        if((cfg.failTables||[]).includes(table))return Promise.resolve({data:null,error:{code:"",message:"Failed to fetch"}}).then(res,rej);
        if(table==="profiles"&&cfg.profileError)return Promise.resolve({data:null,error:{code:cfg.profileError,message:"x"}}).then(res,rej);
        let rows=db[table]||[];
        const match=r=>st.filters.every(([k,v])=>String(r[k])===String(v))&&(!st.inF||st.inF[1].map(String).includes(String(r[st.inF[0]])));
        let out;
        if(st.op==="insert"){const arr=Array.isArray(st.payload)?st.payload:[st.payload];out=arr.map(p=>{const r={id:rows.length+1000,created_at:now(),updated_at:now(),status:"open",...p};rows.push(r);return r;});}
        else if(st.op==="update"){out=rows.filter(match);out.forEach(r=>Object.assign(r,st.payload));}
        else out=rows.filter(match);
        return Promise.resolve({data:st.single?(out[0]||null):out,error:null}).then(res,rej);
      }
    };
    return b;
  }
  window.supabase={createClient(){return {
    auth:{
      getSession:async()=>({data:{session:cfg.noSession?null:{user:{id:"u1"}}}}),
      getUser:async()=>({data:{user:{id:"u1"}}}),
      signInWithPassword:async()=>({data:{user:{id:"u1"}},error:null}),
      signOut:async()=>{window.__signOuts=(window.__signOuts||0)+1;return {error:null}}
    },
    from:q,
    rpc:async(name,args)=>{
      window.__ops.push({rpc:name,args});
      if(name==="get_visible_profiles")return {data:db.profiles,error:null};
      if(name==="close_problem"){const p=db.problems.find(x=>x.id===args.problem_id);p.status="closed";p.closed_at=now();p.closed_by="u1";db.problem_activity.push({id:db.problem_activity.length+1,problem_id:p.id,actor_id:"u1",action:"closed",created_at:now()});}
      if(name==="reopen_problem"){const p=db.problems.find(x=>x.id===args.problem_id);p.status="open";}
      return {data:null,error:null};
    },
    functions:{invoke:async(n,o)=>{window.__ops.push({fn:n,body:o.body});return {data:{},error:null}}}
  }}};
})();
