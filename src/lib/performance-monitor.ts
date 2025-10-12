/**
 * Performance Monitoring Utility
 *
 * Tracks and reports Web Vitals and custom performance metrics
 * Helps identify performance bottlenecks and regressions
 */

interface PerformanceMetrics {
  // Core Web Vitals
  lcp?: number  // Largest Contentful Paint
  fid?: number  // First Input Delay
  cls?: number  // Cumulative Layout Shift
  fcp?: number  // First Contentful Paint
  ttfb?: number // Time to First Byte

  // Custom metrics
  domContentLoaded?: number
  loadComplete?: number
  firstPaint?: number

  // Navigation timing
  dns?: number
  tcp?: number
  request?: number
  response?: number
  domInteractive?: number
  domComplete?: number
}

interface PerformanceEntry {
  name: string
  value: number
  rating: 'good' | 'needs-improvement' | 'poor'
  timestamp: number
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics = {}
  private entries: PerformanceEntry[] = []
  private observers: PerformanceObserver[] = []

  constructor() {
    if (typeof window === 'undefined') return

    // Initialize observers on next tick to avoid blocking initial render
    setTimeout(() => {
      this.initializeObservers()
      this.measureNavigationTiming()
    }, 0)
  }

  /**
   * Initialize performance observers for Web Vitals
   */
  private initializeObservers(): void {
    try {
      // Largest Contentful Paint (LCP)
      if ('PerformanceObserver' in window) {
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries()
          const lastEntry = entries[entries.length - 1] as any
          const lcp = lastEntry.renderTime || lastEntry.loadTime

          this.recordMetric('lcp', lcp, this.rateLCP(lcp))
          this.metrics.lcp = lcp
        })

        try {
          lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true })
          this.observers.push(lcpObserver)
        } catch (e) {
          // LCP not supported
        }

        // First Input Delay (FID)
        const fidObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries()
          entries.forEach((entry: any) => {
            const fid = entry.processingStart - entry.startTime
            this.recordMetric('fid', fid, this.rateFID(fid))
            this.metrics.fid = fid
          })
        })

        try {
          fidObserver.observe({ type: 'first-input', buffered: true })
          this.observers.push(fidObserver)
        } catch (e) {
          // FID not supported
        }

        // Cumulative Layout Shift (CLS)
        let clsValue = 0
        const clsObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as any[]) {
            if (!entry.hadRecentInput) {
              clsValue += entry.value
              this.metrics.cls = clsValue
            }
          }

          this.recordMetric('cls', clsValue, this.rateCLS(clsValue))
        })

        try {
          clsObserver.observe({ type: 'layout-shift', buffered: true })
          this.observers.push(clsObserver)
        } catch (e) {
          // CLS not supported
        }
      }
    } catch (error) {
      console.warn('Performance observers not supported:', error)
    }
  }

  /**
   * Measure navigation timing metrics
   */
  private measureNavigationTiming(): void {
    if (typeof window === 'undefined') return

    window.addEventListener('load', () => {
      // Use setTimeout to ensure all metrics are available
      setTimeout(() => {
        const perfData = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming

        if (!perfData) return

        // Core metrics
        this.metrics.domContentLoaded = perfData.domContentLoadedEventEnd - perfData.domContentLoadedEventStart
        this.metrics.loadComplete = perfData.loadEventEnd - perfData.loadEventStart
        this.metrics.ttfb = perfData.responseStart - perfData.requestStart

        // Navigation breakdown
        this.metrics.dns = perfData.domainLookupEnd - perfData.domainLookupStart
        this.metrics.tcp = perfData.connectEnd - perfData.connectStart
        this.metrics.request = perfData.responseStart - perfData.requestStart
        this.metrics.response = perfData.responseEnd - perfData.responseStart
        this.metrics.domInteractive = perfData.domInteractive - perfData.fetchStart
        this.metrics.domComplete = perfData.domComplete - perfData.fetchStart

        // Paint metrics
        const paintEntries = performance.getEntriesByType('paint')
        const fp = paintEntries.find(e => e.name === 'first-paint')
        const fcp = paintEntries.find(e => e.name === 'first-contentful-paint')

        if (fp) {
          this.metrics.firstPaint = fp.startTime
          this.recordMetric('fp', fp.startTime, this.rateFP(fp.startTime))
        }

        if (fcp) {
          this.metrics.fcp = fcp.startTime
          this.recordMetric('fcp', fcp.startTime, this.rateFCP(fcp.startTime))
        }

        this.recordMetric('ttfb', this.metrics.ttfb, this.rateTTFB(this.metrics.ttfb))

        // Log summary
        this.logMetrics()

        // Send to analytics if available
        this.sendToAnalytics()
      }, 0)
    })
  }

  /**
   * Record a performance metric
   */
  private recordMetric(name: string, value: number, rating: 'good' | 'needs-improvement' | 'poor'): void {
    this.entries.push({
      name,
      value,
      rating,
      timestamp: Date.now()
    })
  }

  /**
   * Rate LCP (Largest Contentful Paint)
   * Good: < 2.5s, Needs improvement: 2.5-4s, Poor: > 4s
   */
  private rateLCP(value: number): 'good' | 'needs-improvement' | 'poor' {
    if (value < 2500) return 'good'
    if (value < 4000) return 'needs-improvement'
    return 'poor'
  }

  /**
   * Rate FID (First Input Delay)
   * Good: < 100ms, Needs improvement: 100-300ms, Poor: > 300ms
   */
  private rateFID(value: number): 'good' | 'needs-improvement' | 'poor' {
    if (value < 100) return 'good'
    if (value < 300) return 'needs-improvement'
    return 'poor'
  }

  /**
   * Rate CLS (Cumulative Layout Shift)
   * Good: < 0.1, Needs improvement: 0.1-0.25, Poor: > 0.25
   */
  private rateCLS(value: number): 'good' | 'needs-improvement' | 'poor' {
    if (value < 0.1) return 'good'
    if (value < 0.25) return 'needs-improvement'
    return 'poor'
  }

  /**
   * Rate FCP (First Contentful Paint)
   * Good: < 1.8s, Needs improvement: 1.8-3s, Poor: > 3s
   */
  private rateFCP(value: number): 'good' | 'needs-improvement' | 'poor' {
    if (value < 1800) return 'good'
    if (value < 3000) return 'needs-improvement'
    return 'poor'
  }

  /**
   * Rate FP (First Paint)
   * Good: < 1s, Needs improvement: 1-2s, Poor: > 2s
   */
  private rateFP(value: number): 'good' | 'needs-improvement' | 'poor' {
    if (value < 1000) return 'good'
    if (value < 2000) return 'needs-improvement'
    return 'poor'
  }

  /**
   * Rate TTFB (Time to First Byte)
   * Good: < 800ms, Needs improvement: 800-1800ms, Poor: > 1800ms
   */
  private rateTTFB(value: number): 'good' | 'needs-improvement' | 'poor' {
    if (value < 800) return 'good'
    if (value < 1800) return 'needs-improvement'
    return 'poor'
  }

  /**
   * Log performance metrics to console
   */
  private logMetrics(): void {
    const getColor = (rating: 'good' | 'needs-improvement' | 'poor') => {
      switch (rating) {
        case 'good': return '🟢'
        case 'needs-improvement': return '🟡'
        case 'poor': return '🔴'
      }
    }

    console.group('📊 Performance Metrics')

    if (this.metrics.lcp) {
      const rating = this.rateLCP(this.metrics.lcp)
      console.log(`${getColor(rating)} LCP (Largest Contentful Paint): ${(this.metrics.lcp / 1000).toFixed(2)}s`)
    }

    if (this.metrics.fid) {
      const rating = this.rateFID(this.metrics.fid)
      console.log(`${getColor(rating)} FID (First Input Delay): ${this.metrics.fid.toFixed(2)}ms`)
    }

    if (this.metrics.cls !== undefined) {
      const rating = this.rateCLS(this.metrics.cls)
      console.log(`${getColor(rating)} CLS (Cumulative Layout Shift): ${this.metrics.cls.toFixed(3)}`)
    }

    if (this.metrics.fcp) {
      const rating = this.rateFCP(this.metrics.fcp)
      console.log(`${getColor(rating)} FCP (First Contentful Paint): ${(this.metrics.fcp / 1000).toFixed(2)}s`)
    }

    if (this.metrics.ttfb) {
      const rating = this.rateTTFB(this.metrics.ttfb)
      console.log(`${getColor(rating)} TTFB (Time to First Byte): ${this.metrics.ttfb.toFixed(2)}ms`)
    }

    console.groupEnd()

    console.group('⏱️ Navigation Timing')
    if (this.metrics.dns) console.log(`DNS Lookup: ${this.metrics.dns.toFixed(2)}ms`)
    if (this.metrics.tcp) console.log(`TCP Connection: ${this.metrics.tcp.toFixed(2)}ms`)
    if (this.metrics.request) console.log(`Request Time: ${this.metrics.request.toFixed(2)}ms`)
    if (this.metrics.response) console.log(`Response Time: ${this.metrics.response.toFixed(2)}ms`)
    if (this.metrics.domInteractive) console.log(`DOM Interactive: ${(this.metrics.domInteractive / 1000).toFixed(2)}s`)
    if (this.metrics.domComplete) console.log(`DOM Complete: ${(this.metrics.domComplete / 1000).toFixed(2)}s`)
    console.groupEnd()
  }

  /**
   * Send metrics to analytics (Google Analytics, Sentry, etc.)
   */
  private sendToAnalytics(): void {
    // Send to Google Analytics if available
    if (typeof window !== 'undefined' && (window as any).gtag) {
      const gtag = (window as any).gtag

      this.entries.forEach(entry => {
        gtag('event', 'timing_complete', {
          name: entry.name,
          value: Math.round(entry.value),
          event_category: 'Performance',
          event_label: entry.rating,
          non_interaction: true
        })
      })
    }

    // Send to Sentry if available
    if (typeof window !== 'undefined' && (window as any).Sentry) {
      const Sentry = (window as any).Sentry

      Sentry.setContext('performance', {
        metrics: this.metrics,
        entries: this.entries.slice(0, 10) // Limit to 10 most recent
      })
    }
  }

  /**
   * Get current metrics
   */
  public getMetrics(): PerformanceMetrics {
    return { ...this.metrics }
  }

  /**
   * Get metric entries
   */
  public getEntries(): PerformanceEntry[] {
    return [...this.entries]
  }

  /**
   * Clean up observers
   */
  public cleanup(): void {
    this.observers.forEach(observer => observer.disconnect())
    this.observers = []
  }
}

// Singleton instance
let monitor: PerformanceMonitor | null = null

/**
 * Initialize performance monitoring
 */
export function initPerformanceMonitoring(): PerformanceMonitor {
  if (typeof window === 'undefined') {
    return {} as PerformanceMonitor
  }

  if (!monitor) {
    monitor = new PerformanceMonitor()
  }

  return monitor
}

/**
 * Get performance monitor instance
 */
export function getPerformanceMonitor(): PerformanceMonitor | null {
  return monitor
}

/**
 * Cleanup performance monitoring
 */
export function cleanupPerformanceMonitoring(): void {
  if (monitor) {
    monitor.cleanup()
    monitor = null
  }
}

/**
 * Measure custom performance mark
 */
export function measurePerformance(markName: string): void {
  if (typeof window === 'undefined') return

  try {
    performance.mark(markName)
  } catch (error) {
    console.warn('Failed to mark performance:', error)
  }
}

/**
 * Measure duration between two marks
 */
export function measureDuration(startMark: string, endMark: string, measureName: string): number | null {
  if (typeof window === 'undefined') return null

  try {
    performance.measure(measureName, startMark, endMark)
    const measure = performance.getEntriesByName(measureName)[0]
    return measure?.duration || null
  } catch (error) {
    console.warn('Failed to measure duration:', error)
    return null
  }
}
