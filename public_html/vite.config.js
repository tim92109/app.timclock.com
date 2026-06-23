import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load environment variables
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  
  return {
    plugins: [react()],
    server: {
      port: 3001,
      host: true,
      proxy: {
        '/api': {
          target: 'http://localhost:3000', // Match backend server port
          changeOrigin: true,
          secure: false
        }
      }
    },
    build: {
      outDir: 'dist',
      sourcemap: true
    },
    define: {
      'process.env': env
    }
  }
})