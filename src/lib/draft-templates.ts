/**
 * Draft Templates & Saved Configurations
 * Allows users to save and load draft configurations
 */

import type { Format } from '@/types'

export interface DraftTemplate {
  id: string
  name: string
  description: string
  format: Format
  settings: {
    draftType: 'snake' | 'auction'
    teamSize: number
    maxTeams: number
    budget: number
    turnTimer?: number
    auctionTimer?: number
    allowUndos: boolean
    allowProxyPicks: boolean
    enableWishlist: boolean
    enableAutoPick: boolean
    enableChat: boolean
    publicSpectating: boolean
  }
  customRules?: {
    maxLegendaries?: number
    maxMythicals?: number
    maxParadox?: number
    bannedPokemon?: string[]
    requiredTypes?: string[]
    minBST?: number
    maxBST?: number
  }
  createdBy?: string
  createdAt: Date
  updatedAt: Date
  usageCount: number
  isPublic: boolean
  tags: string[]
  category: 'competitive' | 'casual' | 'themed' | 'custom'
}

/**
 * Built-in templates
 */
export const BUILT_IN_TEMPLATES: DraftTemplate[] = [
  {
    id: 'vgc-standard',
    name: 'VGC Standard',
    description: 'Standard VGC draft with 6 Pokemon per team, snake draft',
    format: {
      id: 'vgc2024regh',
      name: 'VGC 2024 Regulation H',
      generation: 9,
      rules: [],
      banlist: [],
    } as unknown as Format,
    settings: {
      draftType: 'snake',
      teamSize: 6,
      maxTeams: 8,
      budget: 100,
      turnTimer: 90,
      allowUndos: true,
      allowProxyPicks: true,
      enableWishlist: true,
      enableAutoPick: true,
      enableChat: true,
      publicSpectating: true,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    usageCount: 0,
    isPublic: true,
    tags: ['vgc', 'competitive', 'standard'],
    category: 'competitive',
  },
  {
    id: 'smogon-ou-auction',
    name: 'Smogon OU Auction',
    description: 'OverUsed tier auction draft with budget management',
    format: {
      id: 'gen9ou',
      name: 'Gen 9 OU',
      generation: 9,
      rules: [],
      banlist: [],
    } as unknown as Format,
    settings: {
      draftType: 'auction',
      teamSize: 6,
      maxTeams: 6,
      budget: 100,
      auctionTimer: 30,
      allowUndos: false,
      allowProxyPicks: false,
      enableWishlist: true,
      enableAutoPick: true,
      enableChat: true,
      publicSpectating: true,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    usageCount: 0,
    isPublic: true,
    tags: ['smogon', 'ou', 'auction', 'competitive'],
    category: 'competitive',
  },
  {
    id: 'mono-type-challenge',
    name: 'Mono-Type Challenge',
    description: 'Each team must draft Pokemon of a single type',
    format: {
      id: 'gen9ou',
      name: 'Gen 9 OU',
      generation: 9,
      rules: [],
      banlist: [],
    } as unknown as Format,
    settings: {
      draftType: 'snake',
      teamSize: 6,
      maxTeams: 8,
      budget: 100,
      turnTimer: 60,
      allowUndos: true,
      allowProxyPicks: true,
      enableWishlist: true,
      enableAutoPick: false,
      enableChat: true,
      publicSpectating: true,
    },
    customRules: {
      maxLegendaries: 1,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    usageCount: 0,
    isPublic: true,
    tags: ['mono-type', 'challenge', 'themed'],
    category: 'themed',
  },
  {
    id: 'budget-draft',
    name: 'Budget Draft',
    description: 'Low budget, high strategy - focus on lesser-used Pokemon',
    format: {
      id: 'gen9ou',
      name: 'Gen 9 OU',
      generation: 9,
      rules: [],
      banlist: [],
    } as unknown as Format,
    settings: {
      draftType: 'auction',
      teamSize: 6,
      maxTeams: 8,
      budget: 60,
      auctionTimer: 25,
      allowUndos: false,
      allowProxyPicks: true,
      enableWishlist: true,
      enableAutoPick: true,
      enableChat: true,
      publicSpectating: true,
    },
    customRules: {
      maxBST: 550,
      maxLegendaries: 0,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    usageCount: 0,
    isPublic: true,
    tags: ['budget', 'challenge', 'casual'],
    category: 'casual',
  },
  {
    id: 'legendary-showdown',
    name: 'Legendary Showdown',
    description: 'Unrestricted legendary draft - biggest threats allowed',
    format: {
      id: 'unrestricted',
      name: 'Unrestricted',
      generation: 9,
      rules: [],
      banlist: [],
    } as unknown as Format,
    settings: {
      draftType: 'snake',
      teamSize: 4,
      maxTeams: 4,
      budget: 150,
      turnTimer: 120,
      allowUndos: true,
      allowProxyPicks: true,
      enableWishlist: true,
      enableAutoPick: false,
      enableChat: true,
      publicSpectating: true,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    usageCount: 0,
    isPublic: true,
    tags: ['legendary', 'unrestricted', 'competitive'],
    category: 'competitive',
  },
  {
    id: 'beginner-friendly',
    name: 'Beginner Friendly',
    description: 'Perfect for first-time drafters with extended timers',
    format: {
      id: 'vgc2024regh',
      name: 'VGC 2024 Regulation H',
      generation: 9,
      rules: [],
      banlist: [],
    } as unknown as Format,
    settings: {
      draftType: 'snake',
      teamSize: 6,
      maxTeams: 4,
      budget: 100,
      turnTimer: 180,
      allowUndos: true,
      allowProxyPicks: true,
      enableWishlist: true,
      enableAutoPick: true,
      enableChat: true,
      publicSpectating: false,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    usageCount: 0,
    isPublic: true,
    tags: ['beginner', 'casual', 'learning'],
    category: 'casual',
  },
  {
    id: 'speed-draft',
    name: 'Speed Draft',
    description: 'Fast-paced draft with short timers - think quick!',
    format: {
      id: 'gen9ou',
      name: 'Gen 9 OU',
      generation: 9,
      rules: [],
      banlist: [],
    } as unknown as Format,
    settings: {
      draftType: 'snake',
      teamSize: 6,
      maxTeams: 6,
      budget: 100,
      turnTimer: 30,
      allowUndos: false,
      allowProxyPicks: false,
      enableWishlist: true,
      enableAutoPick: true,
      enableChat: true,
      publicSpectating: true,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    usageCount: 0,
    isPublic: true,
    tags: ['speed', 'fast', 'competitive'],
    category: 'competitive',
  },
  {
    id: 'doubles-focused',
    name: 'Doubles Focused',
    description: 'Optimized for VGC doubles battles',
    format: {
      id: 'vgc2024regh',
      name: 'VGC 2024 Regulation H',
      generation: 9,
      rules: [],
      banlist: [],
    } as unknown as Format,
    settings: {
      draftType: 'auction',
      teamSize: 8,
      maxTeams: 8,
      budget: 120,
      auctionTimer: 35,
      allowUndos: true,
      allowProxyPicks: true,
      enableWishlist: true,
      enableAutoPick: true,
      enableChat: true,
      publicSpectating: true,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    usageCount: 0,
    isPublic: true,
    tags: ['vgc', 'doubles', 'competitive'],
    category: 'competitive',
  },
]

/**
 * Save a custom template
 */
export function saveTemplate(template: Omit<DraftTemplate, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>): DraftTemplate {
  const newTemplate: DraftTemplate = {
    ...template,
    id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    createdAt: new Date(),
    updatedAt: new Date(),
    usageCount: 0,
  }

  // Save to localStorage
  const saved = getSavedTemplates()
  saved.push(newTemplate)
  localStorage.setItem('draft-templates', JSON.stringify(saved))

  return newTemplate
}

/**
 * Get all saved templates
 */
export function getSavedTemplates(): DraftTemplate[] {
  if (typeof window === 'undefined') return []

  try {
    const saved = localStorage.getItem('draft-templates')
    if (!saved) return []

    const parsed = JSON.parse(saved)
    return parsed.map((t: any) => ({
      ...t,
      createdAt: new Date(t.createdAt),
      updatedAt: new Date(t.updatedAt),
    }))
  } catch {
    return []
  }
}

/**
 * Get all templates (built-in + saved)
 */
export function getAllTemplates(): DraftTemplate[] {
  return [...BUILT_IN_TEMPLATES, ...getSavedTemplates()]
}

/**
 * Get template by ID
 */
export function getTemplateById(id: string): DraftTemplate | null {
  const all = getAllTemplates()
  return all.find(t => t.id === id) || null
}

/**
 * Delete a saved template
 */
export function deleteTemplate(id: string): boolean {
  const saved = getSavedTemplates()
  const filtered = saved.filter(t => t.id !== id)

  if (filtered.length === saved.length) return false

  localStorage.setItem('draft-templates', JSON.stringify(filtered))
  return true
}

/**
 * Update a template
 */
export function updateTemplate(id: string, updates: Partial<DraftTemplate>): DraftTemplate | null {
  const saved = getSavedTemplates()
  const index = saved.findIndex(t => t.id === id)

  if (index === -1) return null

  saved[index] = {
    ...saved[index],
    ...updates,
    updatedAt: new Date(),
  }

  localStorage.setItem('draft-templates', JSON.stringify(saved))
  return saved[index]
}

/**
 * Increment usage count
 */
export function incrementUsageCount(id: string): void {
  const template = getTemplateById(id)
  if (!template) return

  // Only increment for custom templates
  if (!id.startsWith('custom-')) return

  updateTemplate(id, {
    usageCount: template.usageCount + 1,
  })
}

/**
 * Search templates
 */
export function searchTemplates(query: string, filters?: {
  category?: DraftTemplate['category']
  tags?: string[]
  draftType?: 'snake' | 'auction'
}): DraftTemplate[] {
  let templates = getAllTemplates()

  // Text search
  if (query) {
    const lower = query.toLowerCase()
    templates = templates.filter(
      t =>
        t.name.toLowerCase().includes(lower) ||
        t.description.toLowerCase().includes(lower) ||
        t.tags.some(tag => tag.toLowerCase().includes(lower))
    )
  }

  // Category filter
  if (filters?.category) {
    templates = templates.filter(t => t.category === filters.category)
  }

  // Tags filter
  if (filters?.tags && filters.tags.length > 0) {
    templates = templates.filter(t =>
      filters.tags!.some(tag => t.tags.includes(tag))
    )
  }

  // Draft type filter
  if (filters?.draftType) {
    templates = templates.filter(t => t.settings.draftType === filters.draftType)
  }

  return templates
}

/**
 * Get popular templates
 */
export function getPopularTemplates(limit: number = 5): DraftTemplate[] {
  return getAllTemplates()
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, limit)
}

/**
 * Get recent templates
 */
export function getRecentTemplates(limit: number = 5): DraftTemplate[] {
  return getSavedTemplates()
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, limit)
}

/**
 * Export template to JSON
 */
export function exportTemplate(template: DraftTemplate): string {
  return JSON.stringify(template, null, 2)
}

/**
 * Import template from JSON
 */
export function importTemplate(json: string): DraftTemplate | null {
  try {
    const parsed = JSON.parse(json)

    // Validate required fields
    if (!parsed.name || !parsed.settings) {
      throw new Error('Invalid template format')
    }

    const template: DraftTemplate = {
      ...parsed,
      id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      usageCount: 0,
      isPublic: false,
    }

    // Save it
    return saveTemplate(template)
  } catch {
    return null
  }
}

/**
 * Clone a template
 */
export function cloneTemplate(templateId: string, newName?: string): DraftTemplate | null {
  const template = getTemplateById(templateId)
  if (!template) return null

  return saveTemplate({
    ...template,
    name: newName || `${template.name} (Copy)`,
    isPublic: false,
    createdBy: undefined,
  })
}

/**
 * Validate template
 */
export function validateTemplate(template: Partial<DraftTemplate>): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (!template.name) errors.push('Name is required')
  if (!template.settings) errors.push('Settings are required')

  if (template.settings) {
    if (template.settings.teamSize < 1 || template.settings.teamSize > 12) {
      errors.push('Team size must be between 1 and 12')
    }
    if (template.settings.maxTeams < 2 || template.settings.maxTeams > 16) {
      errors.push('Max teams must be between 2 and 16')
    }
    if (template.settings.budget < 0) {
      errors.push('Budget cannot be negative')
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Get template stats
 */
export function getTemplateStats() {
  const all = getAllTemplates()
  const saved = getSavedTemplates()

  const byCategory = {
    competitive: all.filter(t => t.category === 'competitive').length,
    casual: all.filter(t => t.category === 'casual').length,
    themed: all.filter(t => t.category === 'themed').length,
    custom: all.filter(t => t.category === 'custom').length,
  }

  const byDraftType = {
    snake: all.filter(t => t.settings.draftType === 'snake').length,
    auction: all.filter(t => t.settings.draftType === 'auction').length,
  }

  return {
    total: all.length,
    builtIn: BUILT_IN_TEMPLATES.length,
    custom: saved.length,
    byCategory,
    byDraftType,
    totalUsage: all.reduce((sum, t) => sum + t.usageCount, 0),
  }
}
