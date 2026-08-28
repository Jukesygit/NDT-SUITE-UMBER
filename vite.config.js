import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import crypto from 'crypto'

// Generate nonces for inline scripts that absolutely need them
const generateNonce = () => crypto.randomBytes(16).toString('base64')

// NDT Companion app localhost port range (CSP connect-src allowlist — HTTP + WebSocket)
const companionPorts = Array.from({ length: 10 }, (_, i) => `http://localhost:${18923 + i} ws://localhost:${18923 + i}`).join(' ')

export default defineConfig({
  plugins: [
    react()
  ],
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router-dom']
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom']
  },
  server: {
    headers: {
      // Security headers
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',

      // Content Security Policy for development - allows React DevTools
      'Content-Security-Policy': [
        "default-src 'self'",
        // Scripts: self and inline for React HMR in development
        "script-src 'self' 'unsafe-inline'",
        // Styles: self, fonts, and inline for development
        "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'",
        // Fonts
        "font-src 'self' https://fonts.gstatic.com",
        // Images
        "img-src 'self' data: blob: https://*.supabase.co",
        // Connections (includes NDT Companion localhost ports)
        `connect-src 'self' https://*.supabase.co wss://*.supabase.co ${companionPorts}`,
        // Workers
        "worker-src 'self' blob:",
        // Frames - allow embedding PDFs from Supabase storage
        "frame-src 'self' https://*.supabase.co blob:",
        // Frame ancestors
        "frame-ancestors 'self'",
        // Object/embed sources for PDFs
        "object-src 'none'",
        // Base URI
        "base-uri 'self'",
        // Form action
        "form-action 'self'",
        // Upgrade insecure requests
        "upgrade-insecure-requests"
      ].join('; ')
    }
  },
  preview: {
    headers: {
      // Production security headers - even stricter
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',

      // Strict Production CSP
      'Content-Security-Policy': [
        "default-src 'none'",
        "script-src 'self'",
        "style-src 'self' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob: https://*.supabase.co",
        `connect-src 'self' https://*.supabase.co wss://*.supabase.co ${companionPorts}`,
        "worker-src 'self' blob:",
        "frame-src 'self' https://*.supabase.co blob:",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "manifest-src 'self'",
        "upgrade-insecure-requests"
      ].join('; ')
    }
  },
  // Build optimizations
  build: {
    // Enable minification
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console logs in production
        drop_debugger: true // Remove debugger statements
      }
    },
    // Split chunks for better caching
    rollupOptions: {
      output: {
        // Vendor chunks - core libraries always loaded.
        //
        // This is the FUNCTION form on purpose. The object form
        // (`{'supabase-vendor': ['@supabase/supabase-js'], ...}`) makes Rollup
        // walk the whole dependency graph of each listed package and pull
        // everything it reaches into that chunk - including Vite's virtual
        // `vite/preload-helper` module, which supabase-js reaches via its own
        // dynamic import(). That helper is shared by EVERY chunk containing an
        // import(), so parking it inside supabase-vendor gave each such chunk a
        // static ESM edge onto supabase-vendor. One lazy import() in
        // engine/annotation-labels.ts was therefore enough to drag supabase-js
        // (~42 kB gz, auth + database client) onto the loginless /share page,
        // breaking the client-sharing design invariant. Pinning the helper to
        // its own tiny chunk cuts that edge. See scripts/check-share-chunk.mjs
        // and docs/plans/2026-08-17-client-sharing-design.md (2026-08-25).
        manualChunks(id) {
          if (id.includes('vite/preload-helper')) return 'preload-helper'
          // tslib is a transitive dep of the @supabase packages only, so it
          // stays in supabase-vendor exactly as the object form placed it.
          if (id.includes('node_modules/@supabase/') || id.includes('node_modules/tslib/')) {
            return 'supabase-vendor'
          }
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/scheduler/') ||
            id.includes('node_modules/react-router/') ||
            id.includes('node_modules/react-router-dom/') ||
            id.includes('node_modules/@remix-run/')
          ) {
            return 'react-vendor'
          }
          // Heavy libraries are dynamically imported, so we don't bundle them in static chunks
          // Removed: 'three', 'html2canvas', 'jspdf', 'plotly.js-dist-min', 'xlsx'
          // These will be loaded on-demand when their features are used
        }
      }
    },
    // Security: don't expose source maps in production
    sourcemap: false
  }
})