/** Explicit local preview of PUBLIC records only; never uses admin credentials or D1 writes. */
export async function GET(request:Request) {
  if(process.env.NODE_ENV!=='development')return new Response(null,{status:404});
  const language=new URL(request.url).searchParams.get('language')??'uk';
  if(!['uk','ru','en'].includes(language))return Response.json({error:'Invalid language'},{status:400});
  try{
    const response=await fetch(`https://svetikony.com/api/church/visualizer-events?language=${language}`,{
      cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000),
    });
    if(!response.ok)throw new Error('Public history unavailable');
    const records:unknown=await response.json();
    if(!Array.isArray(records)||!records.every(row=>row&&row.status==='published'&&typeof row.id==='string'&&typeof row.title==='string'))throw new Error('Invalid public history');
    return Response.json(records,{headers:{'Cache-Control':'no-store','X-History-Source':'production-public-read-only'}});
  }catch{
    return Response.json({error:'Production public history unavailable; local drafts are unchanged'},{status:502});
  }
}
