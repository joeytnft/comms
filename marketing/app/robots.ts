import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
      },
    ],
    sitemap: 'https://gathersafeapp.com/sitemap.xml',
    host: 'https://gathersafeapp.com',
  };
}
