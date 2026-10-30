import subprocess,tempfile,pathlib,json,os,shutil
# Local disposable database only. POSTGRES_BIN selects a full Postgres install.
candidates=[pathlib.Path('/opt/homebrew/opt/postgresql@18/bin'),pathlib.Path('/opt/homebrew/opt/postgresql@17/bin'),*pathlib.Path('/usr/lib/postgresql').glob('*/bin')]
pgbin=next((p for p in candidates if (p/'postgres').exists()),None)
if pgbin is None: raise RuntimeError('Set POSTGRES_BIN to a full PostgreSQL installation; no live database is used.')
folder=pathlib.Path(tempfile.mkdtemp(prefix='m07d-pg-'))
pg=['-h',str(folder),'-p','65439','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
def run(args,**kw):
 r=subprocess.run(args,capture_output=True,text=True,**kw)
 if r.returncode: raise RuntimeError((r.stderr or r.stdout)[-4000:])
 return r.stdout
started=False
try:
 run([str(pgbin/'initdb'),'-D',str(folder/'data'),'--no-sync','-A','trust','-U','postgres','--locale=C','-E','UTF8'])
 run([str(pgbin/'pg_ctl'),'-D',str(folder/'data'),'-l',str(folder/'postgres.log'),'-o',f"-k {folder} -p 65439 -c listen_addresses=''",'-w','start']);started=True
 run(['psql',*pg],input='create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key,email text); create function auth.uid() returns uuid language sql as $$select null::uuid$$;')
 for file in sorted(pathlib.Path('supabase/migrations').glob('*.sql')):
  try: run(['psql',*pg,'-f',str(file)])
  except Exception as error: raise RuntimeError(file.name+': '+str(error))
 run(['psql',*pg],input="do $$ begin begin perform public.studio_start_creative(gen_random_uuid(),'{}'::jsonb,gen_random_uuid()); raise exception 'UNAUTHORIZED_START'; exception when others then if sqlerrm<>'FORBIDDEN' then raise;end if;end;end $$;")
 run(['psql',*pg,'-f','supabase/tests/creative-edit-revisions.sql'])
 result=run(['psql',*pg,'-Atc',"select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname like 'studio_%creative%';"])
 print(json.dumps({'migration':'passed','creativeFunctions':int(result),'database':'isolated temporary Postgres','productionChanged':False,'editRevisionPersistence':'passed','staleRevisionAndSource':'refused','unauthorizedEdit':'refused','blockedApproval':'refused','RLS':'enabled'}))
finally:
 if started: subprocess.run([str(pgbin/'pg_ctl'),'-D',str(folder/'data'),'-m','immediate','stop'],capture_output=True)
 import shutil;shutil.rmtree(folder)
