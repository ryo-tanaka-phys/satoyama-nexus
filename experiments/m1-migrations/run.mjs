import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir,cp} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import pg from 'pg';
const root=process.cwd();
const source=process.env.M1_SOURCE;
assert(source);
const url=new URL(process.env.DATABASE_URL);
assert.equal(url.hostname,'localhost','CI-only local service required');
const admin=new pg.Client({connectionString:url.href});await admin.connect();
const bin=root+'/node_modules/drizzle-kit/bin.cjs';
await writeFile(root+'/schema.ts','export {};\n');
await writeFile(root+'/drizzle.config.ts',`export default {dialect:"postgresql",schema:"./schema.ts",out:"./migrations",dbCredentials:{url:process.env.DATABASE_URL}};\n`);
function kit(args,dbUrl,ok=true){
 const r=spawnSync(process.execPath,[bin,...args],{cwd:root,env:{...process.env,DATABASE_URL:dbUrl},encoding:'utf8'});
 if(ok)assert.equal(r.status,0,r.stdout+r.stderr);else assert.notEqual(r.status,0,'expected migration failure');
 return r;
}
for(const [i,name] of ['domains','audit'].entries()){
 kit(['generate','--custom','--name='+name],url.href);
 const files=(await readdir(root+'/migrations')).filter(f=>f.endsWith('.sql')).sort();
 await writeFile(root+'/migrations/'+files[i],await readFile(source+'/000'+i+'_'+name+'.sql'));
}
const generated=JSON.parse(await readFile(root+'/migrations/meta/_journal.json'));
const journal=JSON.parse(await readFile(source+'/meta/_journal.json'));
assert.equal(generated.entries.length,2);
assert.deepEqual(generated.entries.map(e=>[e.idx,e.tag,e.breakpoints]),journal.entries.map(e=>[e.idx,e.tag,e.breakpoints]));
// Preserve version-controlled identities/timestamps across every installation.
await writeFile(root+'/migrations/meta/_journal.json',JSON.stringify(journal,null,2)+'\n');
const hash=s=>createHash('sha256').update(s).digest('hex');
async function history(c){return (await c.query('select hash,created_at from drizzle.__drizzle_migrations order by created_at')).rows;}
async function verify(c){
 const exists=(await c.query("select to_regclass('drizzle.__drizzle_migrations') t")).rows[0].t;
 if(!exists)return;
 const h=await history(c);assert(h.length<=journal.entries.length);
 for(let i=0;i<h.length;i++){
  assert.equal(String(h[i].created_at),String(journal.entries[i].when),'history timestamp/order mismatch');
  assert.equal(h[i].hash,hash(await readFile(root+'/migrations/'+journal.entries[i].tag+'.sql')),'history hash mismatch');
 }
}
async function migrate(c,u){await verify(c);kit(['migrate'],u);await verify(c);}
const databases=[];
try{
 for(const mode of ['empty','m0','failure']){
  const db='m1_kit_'+mode+'_'+randomBytes(5).toString('hex');databases.push(db);
  await admin.query('CREATE DATABASE '+db);
  const u=new URL(url);u.pathname='/'+db;
  const c=new pg.Client({connectionString:u.href});await c.connect();
  try{
   if(mode==='m0'){
    // M0 owns only the extension, not persisted domain tables. Sentinel tests unrelated data preservation.
    await c.query("CREATE EXTENSION IF NOT EXISTS postgis; CREATE TABLE public.m0_sentinel(id text primary key,payload text); INSERT INTO public.m0_sentinel VALUES ('keep','unchanged')");
   }
   if(mode==='failure'){
    // Apply 0000 first; fail 0001 after its first DDL. Already-applied history must survive.
    const full=await readFile(root+'/migrations/meta/_journal.json','utf8');
    await writeFile(root+'/migrations/meta/_journal.json',JSON.stringify({...journal,entries:journal.entries.slice(0,1)}));
    await migrate(c,u.href);
    await writeFile(root+'/migrations/meta/_journal.json',full);
    const f=root+'/migrations/'+journal.entries[1].tag+'.sql', original=await readFile(f,'utf8');
    await writeFile(f,original+'\n--> statement-breakpoint\nSELECT * FROM injected_missing_relation;\n');
    kit(['migrate'],u.href,false);
    assert.equal((await history(c)).length,1);
    assert.equal((await c.query("select to_regclass('m1_simulation.audit_event') t")).rows[0].t,null);
    await writeFile(f,original);await migrate(c,u.href);
   }else await migrate(c,u.href);
   const before=await history(c);await migrate(c,u.href);assert.deepEqual(await history(c),before);
   assert.equal(before.length,2);
   await c.query("INSERT INTO m1_catalog.activity_revision VALUES ('a',1,'TEST ONLY','https://example.invalid',ST_SetSRID(ST_MakePoint(139,35),4326)::geography,'approximate','administrative-area','synthetic')");
   await c.query("INSERT INTO m1_simulation.actor VALUES ('s','person','SYNTHETIC'); INSERT INTO m1_simulation.collaboration_case VALUES ('c','simulation','a',1,1,'draft'); INSERT INTO m1_simulation.case_party VALUES ('c','s','candidate')");
   const reject=async(q,code)=>assert.rejects(c.query(q),e=>e.code===code);
   await reject("INSERT INTO m1_simulation.case_party VALUES ('c','public-actor','participant')",'23503');
   await reject("INSERT INTO m1_simulation.collaboration_case VALUES ('bad','public','a',1,1,'draft')",'23514');
   await reject("INSERT INTO m1_simulation.collaboration_case VALUES ('bad','simulation','a',2,1,'draft')",'23503');
   await reject("INSERT INTO m1_catalog.activity_revision VALUES ('bad',0,'t','https://example.invalid',NULL,'p','g','e')",'23514');
   await reject("INSERT INTO m1_catalog.activity_revision VALUES ('bad',1,'t','',NULL,'p','g','e')",'23514');
   const geo=(await c.query("select ST_SRID(location::geometry) srid,ST_Distance(location,location) meters from m1_catalog.activity_revision")).rows[0];
   assert.equal(geo.srid,4326);assert.equal(Number(geo.meters),0);
   assert.equal((await c.query("select count(*)::int n from pg_indexes where schemaname='m1_catalog' and indexdef like '%USING gist%'")).rows[0].n,1);
   const role=db+'_app';await c.query('CREATE ROLE '+role+' NOLOGIN');
   await c.query('GRANT USAGE ON SCHEMA m1_simulation TO '+role);
   await c.query('GRANT SELECT,INSERT ON m1_simulation.audit_event TO '+role);
   await c.query('SET ROLE '+role);
   await c.query("INSERT INTO m1_simulation.audit_event(id,case_id,case_revision,event) VALUES ('e','c',1,'test')");
   await reject("UPDATE m1_simulation.audit_event SET event='overwrite'",'42501');
   await reject("DELETE FROM m1_simulation.audit_event",'42501');
   await reject("INSERT INTO m1_catalog.activity_revision(id) VALUES ('forbidden')",'42501');
   await c.query('RESET ROLE');
   if(mode==='m0')assert.deepEqual((await c.query('SELECT * FROM public.m0_sentinel')).rows,[{id:'keep',payload:'unchanged'}]);
   const f=root+'/migrations/'+journal.entries[0].tag+'.sql', original=await readFile(f,'utf8');
   await writeFile(f,original+'\n-- tampered');await assert.rejects(verify(c),/history hash mismatch/);await writeFile(f,original);
   await c.query("UPDATE drizzle.__drizzle_migrations SET hash='tampered' WHERE created_at=$1",[journal.entries[0].when]);
   await assert.rejects(verify(c),/history hash mismatch/);
   await c.query("UPDATE drizzle.__drizzle_migrations SET hash=$1 WHERE created_at=$2",[hash(Buffer.from(original)),journal.entries[0].when]);
   await verify(c);
   console.log('PASS',mode,': Kit custom generate/migrate, rerun, history hashes, CHECK/FK, PostGIS, role permissions, data preservation');
  }finally{await c.end();}
 }
 console.log('PASS failure: transaction rollback preserves prior migration; corrected unapplied SQL recovers without reset');
}finally{await admin.end();console.log('No DROP/TRUNCATE/reset performed. Isolated service disposal owns:',databases.join(','));}
