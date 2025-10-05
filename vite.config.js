import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    headers: {
      // Security headers
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Cache-Control': 'public, max-age=31536000, immutable',

      // Content Security Policy - allowing external CDNs used in the app
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://cdn.plot.ly",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.tailwindcss.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob:",
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
        "worker-src 'self' blob:",
        "frame-ancestors 'self'"
      ].join('; ')
    }
  },
  preview: {
    headers: {
      // Production security headers
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Cache-Control': 'public, max-age=31536000, immutable',

      // Stricter CSP for production with frame-ancestors
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://cdn.plot.ly",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.tailwindcss.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob:",
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
        "worker-src 'self' blob:",
        "frame-ancestors 'none'"
      ].join('; ')
    }
  }
})
