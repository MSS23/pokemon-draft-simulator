/**
 * Image Optimization Utilities
 *
 * Provides helpers for optimized image loading:
 * - Blur placeholder generation
 * - Lazy loading
 * - Progressive image loading
 * - Image format selection
 */

/**
 * Generate a blur data URL for a Pokemon sprite
 * Uses a tiny base64 encoded image as placeholder
 */
export function generatePokemonBlurDataURL(pokemonId: string | number): string {
  // Simple color-based blur placeholder
  // Could be enhanced with actual tiny thumbnail
  const colors = [
    '#ef4444', // red
    '#3b82f6', // blue
    '#10b981', // green
    '#f59e0b', // yellow
    '#8b5cf6', // purple
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#f97316', // orange
  ]

  const colorIndex = Number(pokemonId) % colors.length
  const color = colors[colorIndex]

  // Create a 1x1 pixel blur placeholder
  const svg = `
    <svg width="1" height="1" xmlns="http://www.w3.org/2000/svg">
      <rect width="1" height="1" fill="${color}"/>
    </svg>
  `

  const base64 = Buffer.from(svg).toString('base64')
  return `data:image/svg+xml;base64,${base64}`
}

/**
 * Generate a shimmer effect placeholder
 */
export function generateShimmerDataURL(width: number = 400, height: number = 400): string {
  const shimmer = `
    <svg width="${width}" height="${height}" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
      <defs>
        <linearGradient id="g">
          <stop stop-color="#f3f4f6" offset="0%" />
          <stop stop-color="#e5e7eb" offset="50%" />
          <stop stop-color="#f3f4f6" offset="100%" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="#f3f4f6" />
      <rect id="r" width="${width}" height="${height}" fill="url(#g)" />
      <animate xlink:href="#r" attributeName="x" from="-${width}" to="${width}" dur="1s" repeatCount="indefinite"  />
    </svg>
  `

  const base64 = Buffer.from(shimmer).toString('base64')
  return `data:image/svg+xml;base64,${base64}`
}

/**
 * Get optimized Pokemon image URL based on preferences
 */
export interface PokemonImageOptions {
  preferArtwork?: boolean
  size?: 'small' | 'medium' | 'large'
  shiny?: boolean
}

export function getPokemonImageURL(
  pokemonId: string | number,
  options: PokemonImageOptions = {}
): string {
  const { preferArtwork = false, size = 'medium', shiny = false } = options

  const baseURL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon'

  // Shiny variant
  const shinyPath = shiny ? '/shiny' : ''

  if (preferArtwork) {
    // Official artwork (high quality, larger file size)
    return `${baseURL}/other/official-artwork${shinyPath}/${pokemonId}.png`
  }

  // Default sprite (smaller, faster to load)
  switch (size) {
    case 'small':
      // 96x96 sprite
      return `${baseURL}${shinyPath}/${pokemonId}.png`
    case 'large':
      // Home artwork
      return `${baseURL}/other/home${shinyPath}/${pokemonId}.png`
    case 'medium':
    default:
      // Default sprite
      return `${baseURL}${shinyPath}/${pokemonId}.png`
  }
}

/**
 * Preload images in background
 */
export function preloadImages(urls: string[]): void {
  if (typeof window === 'undefined') return

  urls.forEach(url => {
    const link = document.createElement('link')
    link.rel = 'prefetch'
    link.as = 'image'
    link.href = url
    document.head.appendChild(link)
  })
}

/**
 * Progressive image loader
 * Loads low-quality placeholder first, then high-quality image
 */
export class ProgressiveImageLoader {
  private loaded: Set<string> = new Set()
  private loading: Map<string, Promise<void>> = new Map()

  /**
   * Load image progressively
   */
  public async load(
    lowQualityUrl: string,
    highQualityUrl: string,
    onLowQualityLoaded?: () => void,
    onHighQualityLoaded?: () => void
  ): Promise<void> {
    // Check if already loaded
    if (this.loaded.has(highQualityUrl)) {
      onHighQualityLoaded?.()
      return
    }

    // Check if already loading
    const existing = this.loading.get(highQualityUrl)
    if (existing) {
      return existing
    }

    // Create loading promise
    const promise = this.loadProgressive(
      lowQualityUrl,
      highQualityUrl,
      onLowQualityLoaded,
      onHighQualityLoaded
    )

    this.loading.set(highQualityUrl, promise)

    try {
      await promise
    } finally {
      this.loading.delete(highQualityUrl)
    }
  }

  /**
   * Internal progressive loading logic
   */
  private async loadProgressive(
    lowQualityUrl: string,
    highQualityUrl: string,
    onLowQualityLoaded?: () => void,
    onHighQualityLoaded?: () => void
  ): Promise<void> {
    // Load low-quality first
    try {
      await this.loadImage(lowQualityUrl)
      onLowQualityLoaded?.()
    } catch (error) {
      console.warn('Failed to load low-quality image:', error)
    }

    // Load high-quality
    try {
      await this.loadImage(highQualityUrl)
      this.loaded.add(highQualityUrl)
      onHighQualityLoaded?.()
    } catch (error) {
      console.warn('Failed to load high-quality image:', error)
      throw error
    }
  }

  /**
   * Load single image
   */
  private loadImage(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve()
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`))
      img.src = url
    })
  }

  /**
   * Check if image is loaded
   */
  public isLoaded(url: string): boolean {
    return this.loaded.has(url)
  }

  /**
   * Clear cache
   */
  public clear(): void {
    this.loaded.clear()
    this.loading.clear()
  }
}

/**
 * Singleton progressive image loader
 */
let progressiveLoader: ProgressiveImageLoader | null = null

/**
 * Get progressive image loader instance
 */
export function getProgressiveImageLoader(): ProgressiveImageLoader {
  if (typeof window === 'undefined') {
    return {} as ProgressiveImageLoader
  }

  if (!progressiveLoader) {
    progressiveLoader = new ProgressiveImageLoader()
  }

  return progressiveLoader
}

/**
 * Image loading priority
 */
export enum ImagePriority {
  HIGH = 'high',
  LOW = 'low',
  AUTO = 'auto',
}

/**
 * Calculate image priority based on viewport position
 */
export function calculateImagePriority(
  element: HTMLElement | null,
  threshold: number = 500
): ImagePriority {
  if (!element || typeof window === 'undefined') {
    return ImagePriority.AUTO
  }

  const rect = element.getBoundingClientRect()
  const viewportHeight = window.innerHeight

  // Above viewport
  if (rect.bottom < 0) {
    return ImagePriority.LOW
  }

  // Below viewport + threshold
  if (rect.top > viewportHeight + threshold) {
    return ImagePriority.LOW
  }

  // In viewport or near viewport
  return ImagePriority.HIGH
}

/**
 * Responsive image sizes for Next.js Image component
 */
export const POKEMON_IMAGE_SIZES = {
  card: {
    sm: '(max-width: 640px) 80px, (max-width: 768px) 96px, (max-width: 1024px) 112px, 120px',
    md: '(max-width: 640px) 96px, (max-width: 768px) 120px, (max-width: 1024px) 144px, 160px',
    lg: '(max-width: 640px) 120px, (max-width: 768px) 144px, (max-width: 1024px) 176px, 200px',
  },
  modal: '(max-width: 640px) 200px, (max-width: 768px) 250px, (max-width: 1024px) 300px, 400px',
  hero: '(max-width: 640px) 300px, (max-width: 768px) 400px, (max-width: 1024px) 500px, 600px',
} as const
