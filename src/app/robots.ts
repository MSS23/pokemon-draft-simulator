import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  // trim(): the production env value carries a trailing newline
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://draftpokemon.com').trim().replace(/\/$/, '')

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
