import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: '*',
      allow: ['/', '/church/', '/icons/', '/prayers/', '/saints/', '/gospel/', '/churches/', '/staroslavyanskaya-azbuka/'],
      disallow: ['/*preview_token=', '/*token=', '/api/', '/public/api/']
    }],
    sitemap: `${siteUrl}/sitemap.xml`
  };
}
