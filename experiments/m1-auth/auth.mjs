import {Auth} from '@auth/core';
import {adapter} from './adapter.mjs';
if(process.env.M1_AUTH_SPIKE!=='1')throw Error('Isolated test only');
export const config={
 secret:process.env.AUTH_SECRET,trustHost:true,providers:[],adapter,
 basePath:'/api/auth',useSecureCookies:process.env.SPIKE_SECURE==='1',
 session:{strategy:'database',maxAge:3600,updateAge:0},
 logger:{error(e){console.log('Expected/diagnostic Auth.js error type:',e.type??e.name);},warn(){},debug(){}}
};
export const handle=request=>Auth(request,config);
export async function current(request){
 const u=new URL('/api/auth/session',request.url);
 return (await Auth(new Request(u,{headers:request.headers}),config)).json();
}
