import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/d1/auth';
import { withErrors } from '@/lib/d1/errors';
import { deleteProduct, getProduct, updateProduct, type ChurchProductPayload } from '@/lib/d1/repositories/products';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { id } = await params;
    return Response.json(await getProduct(id));
  });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { id } = await params;
    const payload = await request.json() as ChurchProductPayload;
    return Response.json(await updateProduct(id, payload));
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { id } = await params;
    await deleteProduct(id);
    return new Response(null, { status: 204 });
  });
}
