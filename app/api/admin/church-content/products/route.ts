import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/d1/auth';
import { withErrors } from '@/lib/d1/errors';
import { createProduct, listProducts, type ChurchProductPayload } from '@/lib/d1/repositories/products';

export async function GET(request: NextRequest) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    return Response.json(await listProducts());
  });
}

export async function POST(request: NextRequest) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const payload = await request.json() as ChurchProductPayload;
    const product = await createProduct(payload);
    return Response.json(product, { status: 201 });
  });
}
