import type { NextConfig } from "next";
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'raw.githubusercontent.com',
        pathname: '/PokeAPI/sprites/**',
      },
    ],
  },

  // Optimize bundle size with code splitting
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Split chunks for better caching
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            default: false,
            vendors: false,
            // Vendor chunk for node_modules
            vendor: {
              name: 'vendor',
              chunks: 'all',
              test: /node_modules/,
              priority: 20,
            },
            // Common chunk for shared components
            common: {
              name: 'common',
              minChunks: 2,
              chunks: 'all',
              priority: 10,
              reuseExistingChunk: true,
              enforce: true,
            },
            // Separate chunks for large libraries
            react: {
              test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
              name: 'react',
              chunks: 'all',
              priority: 30,
            },
            supabase: {
              test: /[\\/]node_modules[\\/](@supabase)[\\/]/,
              name: 'supabase',
              chunks: 'all',
              priority: 25,
            },
          },
        },
      }
    }
    return config
  },

  // Enable compression
  compress: true,

  // Experimental features for performance
  experimental: {
    optimizePackageImports: ['@supabase/supabase-js', 'lucide-react'],
  },
};

// Sentry configuration options
const sentryWebpackPluginOptions = {
  // Additional config options for the Sentry webpack plugin
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Only enable in production or when SENTRY_DSN is set
  silent: !process.env.NEXT_PUBLIC_SENTRY_DSN,

  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options
};

// Make sure adding Sentry options is the last code to run before exporting
export default process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, sentryWebpackPluginOptions)
  : nextConfig;