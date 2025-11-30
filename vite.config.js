import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import crypto from 'crypto'

// Generate nonces for inline scripts that absolutely need them
const generateNonce = () => crypto.randomBytes(16).toString('base64')

export default defineConfig({
  plugins: [
    react({
      // Include JSX runtime for better compatibility
      jsxRuntime: 'automatic',
      // Ensure proper babel configuration
      babel: {
        plugins: [
          ['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }]
        ]
      }
    })
  ],
  resolve: {
    dedupe: ['react', 'react-dom']
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
        // Connections
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
        // Workers
        "worker-src 'self' blob:",
        // Frames - allow embedding PDFs from Supabase storage
        "frame-src 'self' https://*.supabase.co blob:",
        // Frame ancestors
        "frame-ancestors 'self'",
        // Object/embed sources for PDFs
        "object-src 'self' https://*.supabase.co blob:",
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
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
        "worker-src 'self' blob:",
        "frame-src 'self' https://*.supabase.co blob:",
        "object-src 'self' https://*.supabase.co blob:",
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
        manualChunks: {
          // Vendor chunks
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'supabase-vendor': ['@supabase/supabase-js'],
          'ui-vendor': ['three', 'html2canvas', 'jspdf'],
          'utils-vendor': ['docx', 'papaparse', 'pdfmake', 'crypto-js', 'bcryptjs']
        }
      }
    },
    // Security: don't expose source maps in production
    sourcemap: false
  }
})