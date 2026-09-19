import {requireSuperAdmin} from '@/lib/d1/auth';
import {withErrors,ApiError} from '@/lib/d1/errors';
import {requireLocalCalendar} from '@/lib/church/geo-api';
import {calendarReviewProfile,calendarReviewQueue,applyCalendarReview,previewCalendarCandidate,previewCalendarMerge} from '@/lib/d1/repositories/calendarGeoReview';
import {validateSession} from '@/lib/d1/repositories/admin-sessions';
import {hashSessionToken} from '@/lib/d1/session-token';
import type {ReviewCommand} from '@/lib/church/geo-review-plan';
export async function GET(request:Request) {
  return withErrors(async()=>{
    const url=requireLocalCalendar(request);
    await requireSuperAdmin(request);
    const id=url.searchParams.get('id');
    if(id&&url.searchParams.has('qid'))return Response.json(await previewCalendarCandidate(id,url.searchParams.get('qid')!),{headers:{'Cache-Control':'no-store'}});
    if(url.searchParams.has('source')&&url.searchParams.has('target'))return Response.json(await previewCalendarMerge(url.searchParams.get('source')!,url.searchParams.get('target')!),{headers:{'Cache-Control':'no-store'}});
    return Response.json(id?await calendarReviewProfile(id):await calendarReviewQueue(url.searchParams),{headers:{'Cache-Control':'no-store'}});
  });
}
export async function POST(request:Request) {
  return withErrors(async()=>{
    requireLocalCalendar(request);await requireSuperAdmin(request);
    const raw=request.headers.get('X-Admin-Session');if(!raw)throw ApiError.authentication('Human session required');
    const session=await validateSession(await hashSessionToken(raw),new Date().toISOString());
    if(session.outcome!=='valid')throw ApiError.authentication('Invalid human session');
    if(!['super_admin','editor'].includes(session.user.role))throw ApiError.authorization('Editor required');
    const command=await request.json() as ReviewCommand;
    if(!command||typeof command!=='object'||typeof command.profileId!=='string'||typeof command.requestId!=='string')throw ApiError.validation('Review command required');
    return Response.json(await applyCalendarReview(command,session.user.id),{headers:{'Cache-Control':'no-store'}});
  });
}
