import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/d1/auth';
import { withErrors } from '@/lib/d1/errors';
import { createVisualizerEvent, listVisualizerEvents, type ChurchVisualizerEventPayload } from '@/lib/d1/repositories/visualizerEvents';

export async function GET(request: NextRequest) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { searchParams } = new URL(request.url);
    const events = await listVisualizerEvents({
      language: searchParams.get('language') ?? undefined,
      status: searchParams.get('status') ?? undefined,
    });
    return Response.json(events);
  });
}

export async function POST(request: NextRequest) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const payload = await request.json() as ChurchVisualizerEventPayload;
    const event = await createVisualizerEvent(payload);
    return Response.json(event, { status: 201 });
  });
}
