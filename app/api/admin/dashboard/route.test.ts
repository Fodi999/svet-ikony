import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mintTestAdminJwt, TEST_JWT_SECRET } from '@/lib/media/test-support/test-jwt';

const fakeDb = {
  tables: {} as Record<string, unknown[]>,
  prepare(sql: string) {
    return {
      bind: () => ({
        first: async () => ({
          new_orders: 0,
          unread_orders: 0,
          drafts: 0,
          published: 0,
          missing_translations: 0,
          missing_images: 0,
          prayers_without_audio: 0,
        }),
        all: async () => ({ results: [] }),
      }),
    };
  },
};

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { DB: fakeDb, ADMIN_JWT_SECRET: TEST_JWT_SECRET } }),
}));

const { GET } = await import('./route');

function dashboardRequest(serviceToken?: string) {
  return new NextRequest('http://localhost/api/admin/dashboard', {
    headers: serviceToken ? { Authorization: `Bearer ${serviceToken}` } : {},
  });
}

describe('GET /api/admin/dashboard', () => {
  let serviceToken: string;

  beforeEach(async () => {
    serviceToken = await mintTestAdminJwt();
  });

  it('rejects a request with no service credential', async () => {
    const response = await GET(dashboardRequest());
    expect(response.status).toBe(401);
  });

  it('rejects an invalid service credential', async () => {
    const response = await GET(dashboardRequest('not-a-real-token'));
    expect(response.status).toBe(401);
  });

  it('returns the aggregate DTO for a valid service credential', async () => {
    const response = await GET(dashboardRequest(serviceToken));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { newOrders: number; upcomingCalendarDays: unknown[] };
    expect(body.newOrders).toBe(0);
    expect(Array.isArray(body.upcomingCalendarDays)).toBe(true);
  });

  it('never echoes the service credential back', async () => {
    const response = await GET(dashboardRequest(serviceToken));
    const text = await response.text();
    expect(text).not.toContain(serviceToken);
  });
});
