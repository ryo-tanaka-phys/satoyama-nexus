import {current} from '../../../auth.mjs';
export const dynamic='force-dynamic';
export async function GET(request){
 const session=await current(request);
 // No case grants exist in this isolated authentication test.
 return Response.json({error:session?.user?'case-grant-required':'unauthenticated'},{status:session?.user?403:401});
}
