import { NextRequest } from 'next/server';
import { requireSuperAdmin } from '@/lib/d1/auth';
import { withErrors } from '@/lib/d1/errors';
import { createProductCategory, listProductCategories, type ChurchProductCategoryPayload } from '@/lib/d1/repositories/productCategories';

export async function GET(request: NextRequest) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    return Response.json(await listProductCategories());
  });
}

export async function POST(request: NextRequest) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const payload = await request.json() as ChurchProductCategoryPayload;
    const category = await createProductCategory(payload);
    return Response.json(category, { status: 201 });
  });
}
