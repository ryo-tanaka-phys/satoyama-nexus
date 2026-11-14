import {current} from '../../../auth.mjs';
export const dynamic='force-dynamic';
export async function GET(request){
 const session=await current(request);
 return Response.json(session?.user?{authenticated:true}:{error:'unauthenticated'},{status:session?.user?200:401});
}
