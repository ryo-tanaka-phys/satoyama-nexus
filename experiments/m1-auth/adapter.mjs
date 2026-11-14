import pg from 'pg';
export const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
export async function init(){
 await pool.query(`CREATE SCHEMA IF NOT EXISTS auth_spike;
 CREATE TABLE IF NOT EXISTS auth_spike.users(id text PRIMARY KEY,name text,email text UNIQUE,"emailVerified" timestamptz,image text);
 CREATE TABLE IF NOT EXISTS auth_spike.accounts(provider text,"providerAccountId" text,"userId" text NOT NULL REFERENCES auth_spike.users(id),type text NOT NULL,PRIMARY KEY(provider,"providerAccountId"));
 CREATE TABLE IF NOT EXISTS auth_spike.sessions("sessionToken" text PRIMARY KEY,"userId" text NOT NULL REFERENCES auth_spike.users(id),expires timestamptz NOT NULL);`);
}
const one=async(q,p)=>(await pool.query(q,p)).rows[0]??null;
export const adapter={
 async createUser(u){return one('INSERT INTO auth_spike.users(id,name,email,"emailVerified",image) VALUES ($1,$2,$3,$4,$5) RETURNING *',[u.id,u.name??null,u.email,u.emailVerified??null,u.image??null]);},
 getUser:id=>one('SELECT * FROM auth_spike.users WHERE id=$1',[id]),
 getUserByEmail:email=>one('SELECT * FROM auth_spike.users WHERE email=$1',[email]),
 getUserByAccount:({provider,providerAccountId})=>one('SELECT u.* FROM auth_spike.users u JOIN auth_spike.accounts a ON a."userId"=u.id WHERE a.provider=$1 AND a."providerAccountId"=$2',[provider,providerAccountId]),
 async updateUser(u){
  const old=await this.getUser(u.id);if(!old)throw Error('missing user');
  const n={...old,...u};return one('UPDATE auth_spike.users SET name=$2,email=$3,"emailVerified"=$4,image=$5 WHERE id=$1 RETURNING *',[u.id,n.name,n.email,n.emailVerified,n.image]);
 },
 async linkAccount(a){return one('INSERT INTO auth_spike.accounts(provider,"providerAccountId","userId",type) VALUES ($1,$2,$3,$4) RETURNING *',[a.provider,a.providerAccountId,a.userId,a.type]);},
 unlinkAccount:({provider,providerAccountId})=>one('DELETE FROM auth_spike.accounts WHERE provider=$1 AND "providerAccountId"=$2 RETURNING *',[provider,providerAccountId]),
 createSession:s=>one('INSERT INTO auth_spike.sessions("sessionToken","userId",expires) VALUES ($1,$2,$3) RETURNING *',[s.sessionToken,s.userId,s.expires]),
 async getSessionAndUser(t){
  const session=await one('SELECT * FROM auth_spike.sessions WHERE "sessionToken"=$1',[t]);if(!session)return null;
  const user=await this.getUser(session.userId);return user?{session,user}:null;
 },
 async updateSession(s){
  const old=await one('SELECT * FROM auth_spike.sessions WHERE "sessionToken"=$1',[s.sessionToken]);if(!old)return null;
  return one('UPDATE auth_spike.sessions SET expires=$2 WHERE "sessionToken"=$1 RETURNING *',[s.sessionToken,s.expires??old.expires]);
 },
 deleteSession:t=>one('DELETE FROM auth_spike.sessions WHERE "sessionToken"=$1 RETURNING *',[t])
};
