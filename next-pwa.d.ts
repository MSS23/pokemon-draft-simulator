declare module 'next-pwa' {
  import { NextConfig } from 'next'

  interface PWAConfig {
    dest?: string
    sw?: string
    register?: boolean
    skipWaiting?: boolean
    disable?: boolean
    runtimeCaching?: any[]
    buildExcludes?: (string | RegExp)[]
    publicExcludes?: string[]
    cacheOnFrontEndNav?: boolean
    reloadOnOnline?: boolean
    scope?: string
  }

  function withPWA(config: PWAConfig): (nextConfig: NextConfig) => NextConfig
  export default withPWA
}
