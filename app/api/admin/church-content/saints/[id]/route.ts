import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/d1/auth';
import { withErrors } from '@/lib/d1/errors';
import { deleteSaint, getSaint, updateSaint, type ChurchSaintPayload } from '@/lib/d1/repositories/saints';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { id } = await params;
    return Response.json(await getSaint(id));
  });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { id } = await params;
    const payload = await request.json() as ChurchSaintPayload;
    return Response.json(await updateSaint(id, payload));
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { id } = await params;
    await deleteSaint(id);
    return new Response(null, { status: 204 });
  });
}
