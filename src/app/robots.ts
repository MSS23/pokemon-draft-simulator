import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://draftpokemon.com'

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin/', '/draft/*/results', '/spectate/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
