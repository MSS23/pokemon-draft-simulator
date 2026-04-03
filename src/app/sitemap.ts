import { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://draftpokemon.com'

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${baseUrl}/auth/login`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/auth/register`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/create-draft`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/join-draft`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/create-tournament`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/join-tournament`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/watch-drafts`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ]

  // Dynamic pages from database
  const dynamicPages: MetadataRoute.Sitemap = []

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (supabaseUrl && supabaseKey && supabaseUrl !== 'your-supabase-project-url') {
    try {
      const supabase = createClient(supabaseUrl, supabaseKey)

      // Public leagues
      const { data: leagues } = await supabase
        .from('leagues')
        .select('id, updated_at')
        .order('updated_at', { ascending: false })
        .limit(500)

      if (leagues) {
        for (const league of leagues) {
          dynamicPages.push({
            url: `${baseUrl}/league/${league.id}`,
            lastModified: new Date(league.updated_at || Date.now()),
            changeFrequency: 'weekly',
            priority: 0.6,
          })
        }
      }

      // Completed drafts (results pages are public)
      const { data: drafts } = await supabase
        .from('drafts')
        .select('id, updated_at')
        .eq('status', 'completed')
        .order('updated_at', { ascending: false })
        .limit(500)

      if (drafts) {
        for (const draft of drafts) {
          dynamicPages.push({
            url: `${baseUrl}/draft/${draft.id}/results`,
            lastModified: new Date(draft.updated_at || Date.now()),
            changeFrequency: 'monthly',
            priority: 0.4,
          })
        }
      }
    } catch {
      // Silently fail — static sitemap is still valid
    }
  }

  return [...staticPages, ...dynamicPages]
}
