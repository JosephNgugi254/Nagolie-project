import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'https://nagolie-backend.onrender.com',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Add these optimizations for production
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
        }
      }
    }
  },
  // Updated environment variable handling
  define: {
    'process.env': {}
  },
  // Add base URL configuration for production
  base: '/',
  // Optional: Preview configuration for production-like testing
  preview: {
    port: 4173,
    host: true
  }
})