-- IzaZoo database access checks, run against the REAL database.
-- Everything happens inside one block that ends with an error on purpose,
-- so every test row is rolled back and nothing is changed.
-- The result comes back as the error message:
--   "DB CHECKS: ALL n PASSED"           everything is as it should be
--   "DB CHECKS: k OF n FAILED: ..."     the list of failed checks
-- Run it through the Supabase connector (execute_sql) or in the SQL Editor.
-- It uses only SELECT and INSERT (no UPDATE/DELETE), so the connector runs it
-- without a confirmation prompt.
do $checks$
declare
  own uuid; mgr uuid; mgr_biz bigint; other_biz bigint;
  k_own bigint; k_other bigint; k_arch bigint; k_new bigint; u_owner bigint; u_mgr bigint; p_new bigint;
  n int; total int := 0; failed text[] := '{}';
begin
  -- who to test as: an active owner, and an active manager with a business
  select id into own from public.profiles where role='owner' and is_active order by created_at limit 1;
  select p.id, ub.business_id into mgr, mgr_biz from public.profiles p join public.user_businesses ub on ub.user_id=p.id
    where p.role='manager' and p.is_active and not p.all_businesses_access order by p.created_at limit 1;
  select b.id into other_biz from public.businesses b where b.id<>mgr_biz
    and not exists(select 1 from public.user_businesses ub where ub.user_id=mgr and ub.business_id=b.id) order by b.id limit 1;
  if own is null or mgr is null or other_biz is null then
    raise exception 'DB CHECKS: SKIPPED (need an active owner, a manager limited to some businesses, and a business the manager has no access to)';
  end if;

  -- ---------- structure: logged-out access, row rules on, both layers per app action ----------
  total:=total+1;
  if exists(select 1 from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relkind='r' and not c.relrowsecurity)
    then failed:=failed||'a public table has row-level security off'::text; end if;
  total:=total+1;
  if exists(select 1 from information_schema.role_table_grants where table_schema='public' and grantee='anon' and privilege_type in ('SELECT','INSERT','UPDATE','DELETE'))
    then failed:=failed||'logged-out users have table access'::text; end if;
  total:=total+1;
  if exists(select 1 from pg_proc p where p.pronamespace='public'::regnamespace and has_function_privilege('anon',p.oid,'EXECUTE'))
    then failed:=failed||'logged-out users can call database functions'::text; end if;
  -- every write the app does: table permission AND at least one row rule
  declare r record; begin
    for r in select * from (values
      ('problems','INSERT'),('problems','UPDATE'),('tasks','INSERT'),('tasks','UPDATE'),
      ('updates_v2','INSERT'),('updates_v2','UPDATE'),('update_businesses','INSERT'),
      ('update_followups','INSERT'),('update_followups','UPDATE'),('beta_feedback','INSERT'),('beta_feedback','UPDATE'),
      ('knowledge_items','INSERT'),('knowledge_items','UPDATE'),('knowledge_items','DELETE'),
      ('knowledge_businesses','INSERT'),('knowledge_versions','INSERT')) v(t,op)
    loop
      total:=total+1;
      if not exists(select 1 from information_schema.role_table_grants g where g.table_schema='public' and g.table_name=r.t and g.grantee='authenticated' and g.privilege_type=r.op)
        then failed:=failed||(r.t||' '||r.op||': missing table permission'); end if;
      if not exists(select 1 from pg_policies p where p.schemaname='public' and p.tablename=r.t and (p.cmd=r.op or p.cmd='ALL'))
        then failed:=failed||(r.t||' '||r.op||': missing row rule'); end if;
    end loop;
  end;

  -- ---------- sample data (as the database owner; rolled back at the end) ----------
  insert into public.knowledge_items(title,body,created_by,all_businesses,file_path) values('chk own','',own,false,'chk-own.pdf') returning id into k_own;
  insert into public.knowledge_items(title,body,created_by,all_businesses,file_path) values('chk other','',own,false,'chk-other.pdf') returning id into k_other;
  insert into public.knowledge_items(title,body,created_by,all_businesses,file_path,is_archived) values('chk arch','',own,false,'chk-arch.pdf',true) returning id into k_arch;
  insert into public.knowledge_businesses values(k_own,mgr_biz),(k_other,other_biz),(k_arch,mgr_biz);
  insert into storage.objects(bucket_id,name) values('knowledge','chk-own.pdf'),('knowledge','chk-other.pdf'),('knowledge','chk-arch.pdf');
  insert into public.updates_v2(title,body,created_by,all_businesses) values('chk','chk',own,false) returning id into u_owner;
  insert into public.update_businesses values(u_owner,other_biz);

  perform set_config('role','authenticated',true);

  -- ---------- as the owner: the app's own writes must work ----------
  perform set_config('request.jwt.claims',json_build_object('sub',own,'role','authenticated')::text,true);
  total:=total+1;
  begin
    insert into public.knowledge_items(title,body,created_by,updated_by,all_businesses,file_path,file_name,file_type,file_size)
      values('chk new','',own,own,false,'chk-new.pdf','n.pdf','application/pdf',1) returning id into k_new;
    insert into public.knowledge_businesses values(k_new,mgr_biz);
    insert into public.knowledge_versions(knowledge_id,title,body,file_name,edited_by) values(k_new,'chk',null,'n.pdf',own);
    insert into storage.objects(bucket_id,name) values('knowledge','chk-new.pdf');
  exception when others then failed:=failed||('owner cannot add a document: '||sqlerrm); end;
  total:=total+1;
  begin insert into public.updates_v2(title,body,created_by,all_businesses) values('chk all','x',own,true);
  exception when others then failed:=failed||('owner cannot post to all businesses: '||sqlerrm); end;
  total:=total+1;
  select count(*) into n from public.knowledge_items where id in (k_own,k_other,k_arch);
  if n<>3 then failed:=failed||('owner sees '||n||' of 3 documents'); end if;

  -- ---------- as the manager: own business works, everything else is closed ----------
  perform set_config('request.jwt.claims',json_build_object('sub',mgr,'role','authenticated')::text,true);
  total:=total+1;
  begin insert into public.problems(title,status,priority,created_by,business_id) values('chk','open','normal',mgr,mgr_biz) returning id into p_new;
  exception when others then failed:=failed||('manager cannot open a problem in own business: '||sqlerrm); end;
  total:=total+1;
  begin insert into public.problems(title,status,priority,created_by,business_id) values('chk','open','normal',mgr,other_biz); failed:=failed||'manager CAN open a problem in another business'::text;
  exception when others then null; end;
  total:=total+1;
  begin insert into public.tasks(description,created_by,business_id) values('chk',mgr,mgr_biz) returning id into n;
  exception when others then failed:=failed||('manager cannot add a task in own business: '||sqlerrm); end;
  total:=total+1;
  begin insert into public.tasks(description,created_by,business_id) values('chk',mgr,other_biz); failed:=failed||'manager CAN add a task in another business'::text;
  exception when others then null; end;
  total:=total+1;
  begin
    insert into public.updates_v2(title,body,created_by,all_businesses) values('chk','m',mgr,false) returning id into u_mgr;
    insert into public.update_businesses values(u_mgr,mgr_biz);
  exception when others then failed:=failed||('manager cannot post an update to own business: '||sqlerrm); end;
  total:=total+1;
  begin insert into public.updates_v2(title,body,created_by,all_businesses) values('chk','m',mgr,true); failed:=failed||'manager CAN post to all businesses'::text;
  exception when others then null; end;
  total:=total+1;
  begin insert into public.update_businesses values(u_owner,mgr_biz); failed:=failed||'manager CAN link someone else''s update to a business'::text;
  exception when others then null; end;
  total:=total+1;
  begin insert into public.update_businesses values(u_mgr,other_biz); failed:=failed||'manager CAN link an update to another business'::text;
  exception when others then null; end;
  total:=total+1;
  select count(*) into n from public.updates_v2 where id=u_owner;
  if n<>0 then failed:=failed||'manager sees another business''s update'::text; end if;
  total:=total+1;
  select count(*) into n from public.knowledge_items where id=k_own;
  if n<>1 then failed:=failed||'manager cannot see own business document'::text; end if;
  total:=total+1;
  select count(*) into n from public.knowledge_items where id in (k_other,k_arch);
  if n<>0 then failed:=failed||'manager sees another business''s or an archived document'::text; end if;
  total:=total+1;
  select count(*) into n from storage.objects where bucket_id='knowledge' and name='chk-own.pdf';
  if n<>1 then failed:=failed||'manager cannot open own business document file'::text; end if;
  total:=total+1;
  select count(*) into n from storage.objects where bucket_id='knowledge' and name in ('chk-other.pdf','chk-arch.pdf');
  if n<>0 then failed:=failed||'manager can open another business''s or an archived file'::text; end if;
  total:=total+1;
  begin insert into public.knowledge_items(title,body,created_by,all_businesses) values('chk','',mgr,false); failed:=failed||'manager CAN add a document'::text;
  exception when others then null; end;
  total:=total+1;
  begin insert into storage.objects(bucket_id,name) values('knowledge','chk-mgr.pdf'); failed:=failed||'manager CAN upload a file'::text;
  exception when others then null; end;
  total:=total+1;
  begin perform public.admin_create_business('chk'); failed:=failed||'manager CAN use admin functions'::text;
  exception when others then null; end;
  total:=total+1;
  begin perform public.get_login_users(); failed:=failed||'the staff list function is reachable'::text;
  exception when others then null; end;
  total:=total+1;
  select count(*) into n from public.admin_activity;
  if n<>0 then failed:=failed||'manager can read the admin log'::text; end if;

  if array_length(failed,1) is null then
    raise exception 'DB CHECKS: ALL % PASSED', total;
  else
    raise exception 'DB CHECKS: % OF % FAILED: %', array_length(failed,1), total, array_to_string(failed,' | ');
  end if;
end $checks$;
