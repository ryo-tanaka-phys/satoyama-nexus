import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root=process.env.M1_SPIKE_DIR;
assert(root, 'M1_SPIKE_DIR required');
const localRequire=createRequire(path.join(root,'package.json'));
const pg=localRequire('pg');
const {drizzle}=localRequire('drizzle-orm/node-postgres');
const {sql}=localRequire('drizzle-orm');
const {Auth}=await import(pathToFileURL(path.join(root,'node_modules/@auth/core/index.js')).href);
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
await client.connect();
const suffix=randomBytes(6).toString('hex');
const schema='m1_spike_'+suffix, role='m1_spike_role_'+suffix;
try {
  const db=drizzle(client);
  await client.query('CREATE SCHEMA '+schema);
  await client.query('CREATE ROLE '+role+' NOLOGIN');
  const migrate=async()=>{
    await db.transaction(async tx=>{
      await tx.execute(sql.raw('CREATE TABLE IF NOT EXISTS '+schema+'.history (id text PRIMARY KEY, location geography(Point,4326), precision text NOT NULL, public_granularity text NOT NULL, evidence text NOT NULL CHECK(length(trim(evidence))>0))'));
      await tx.execute(sql.raw('CREATE INDEX IF NOT EXISTS history_location_gist ON '+schema+'.history USING gist(location)'));
      await tx.execute(sql.raw('CREATE TABLE IF NOT EXISTS '+schema+".actors (id text, domain text CHECK(domain IN ('simulation','public-catalog')), PRIMARY KEY(id,domain))"));
      await tx.execute(sql.raw('CREATE TABLE IF NOT EXISTS '+schema+".parties (case_id text, actor_id text, actor_domain text CHECK(actor_domain='simulation'), PRIMARY KEY(case_id,actor_id), FOREIGN KEY(actor_id,actor_domain) REFERENCES "+schema+'.actors(id,domain))'));
    });
  };
  await migrate(); await migrate();
  await db.execute(sql.raw('INSERT INTO '+schema+".history VALUES ('h1',ST_SetSRID(ST_MakePoint(139,35),4326)::geography,'approximate','administrative-area','test-only')"));
  const result=await db.execute(sql.raw('SELECT ST_SRID(location::geometry) srid, ST_Distance(location,location) meters, precision, public_granularity FROM '+schema+".history WHERE id='h1'"));
  assert.equal(result.rows[0].srid,4326);
  assert.equal(Number(result.rows[0].meters),0);
  assert.equal(result.rows[0].precision,'approximate');
  assert.equal(result.rows[0].public_granularity,'administrative-area');
  assert.equal((await client.query("SELECT count(*)::int n FROM pg_indexes WHERE schemaname=$1 AND indexdef LIKE '%USING gist%'",[schema])).rows[0].n,1);
  await assert.rejects(db.transaction(async tx=>{
    await tx.execute(sql.raw('INSERT INTO '+schema+".history VALUES ('rollback',NULL,'unknown','withheld','test-only')"));
    throw new Error('injected audit failure');
  }),/injected audit failure/);
  assert.equal((await client.query('SELECT count(*)::int n FROM '+schema+".history WHERE id='rollback'")).rows[0].n,0);
  await client.query('GRANT USAGE ON SCHEMA '+schema+' TO '+role);
  await client.query('GRANT SELECT,INSERT ON '+schema+'.history TO '+role);
  for(const op of ['UPDATE '+schema+".history SET evidence='overwrite'",'DELETE FROM '+schema+'.history']) {
    await assert.rejects(db.transaction(async tx=>{
      await tx.execute(sql.raw('SET LOCAL ROLE '+role));
      await tx.execute(sql.raw(op));
    }),e=>(e.code??e.cause?.code)==='42501');
  }
  await db.execute(sql.raw('INSERT INTO '+schema+".actors VALUES ('public','public-catalog'),('sim','simulation')"));
  await assert.rejects(db.execute(sql.raw('INSERT INTO '+schema+".parties VALUES ('case','public','public-catalog')")),e=>(e.code??e.cause?.code)==='23514');
  await assert.rejects(db.execute(sql.raw('INSERT INTO '+schema+".parties VALUES ('case','missing','simulation')")),e=>(e.code??e.cause?.code)==='23503');
  await db.execute(sql.raw('INSERT INTO '+schema+".parties VALUES ('case','sim','simulation')"));
  console.log('PASS Drizzle 0.44.7: geography/SRID/GiST, repeated DDL, transaction rollback, append-only role, simulation CHECK/FK');

  const sessions=new Map();
  const user={id:'test-user',name:'TEST ONLY',email:'test@example.invalid',emailVerified:null};
  const token=randomBytes(32).toString('hex');
  const unsupported=async()=>{throw new Error('Account creation/linking is outside this fixture');};
  const adapter={
    createUser:unsupported, updateUser:unsupported, linkAccount:unsupported,
    async getUser(id){return id===user.id?user:null;},
    async getUserByEmail(email){return email===user.email?user:null;},
    async getUserByAccount(){return null;},
    async createSession(session){sessions.set(session.sessionToken,session);return session;},
    async getSessionAndUser(t) { const session=sessions.get(t); return session?{session,user}:null; },
    async updateSession(value) { const old=sessions.get(value.sessionToken); if(!old)return null;
      const next={...old,...value}; sessions.set(value.sessionToken,next); return next; },
    async deleteSession(t) { const old=sessions.get(t); sessions.delete(t); return old??null; }
  };
  const config={secret:randomBytes(32).toString('hex'),trustHost:true,providers:[],adapter,
    session:{strategy:'database',maxAge:3600},basePath:'/api/auth',
    logger:{error(error){ console.log('Auth.js diagnostic:',error.type ?? error.name); },warn(){},debug(){}}
  };
  const call=(action,t,method='GET')=>Auth(new Request('http://localhost/api/auth/'+action,{
    method,headers:t?{cookie:'authjs.session-token='+t}:{} }),config);
  sessions.set(token,{sessionToken:token,userId:user.id,expires:new Date(Date.now()+3600000)});
  assert.equal((await (await call('session',token)).json()).user.email,user.email);
  assert.equal(await (await call('session','forged')).json(),null);
  const csrf=await call('signout',token,'POST');
  assert.match(csrf.headers.get('location')??'',/MissingCSRF/);
  assert(sessions.has(token),'missing CSRF must not delete a valid session');
  sessions.delete(token);
  assert.equal(await (await call('session',token)).json(),null);
  sessions.set(token,{sessionToken:token,userId:user.id,expires:new Date(Date.now()-1000)});
  assert.equal(await (await call('session',token)).json(),null);
  assert(!sessions.has(token),'expired database session removed');
  assert.equal(await (await call('session',null)).json(),null);
  console.log('PASS @auth/core 0.41.1: database-session read, forged/revoked/expired/anonymous rejection, signout CSRF rejection');
  console.log('LIMITS: in-memory auth adapter; no Next.js integration, real OAuth, durable sessions, account linking, production deployment, or authorization proof');
} finally {
  await client.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');
  await client.query('DROP ROLE IF EXISTS '+role);
  await client.end();
}
