import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.js'),
      name: 'GoogleAITTS',       // UMD global name
      formats: ['es', 'cjs', 'umd'],
      fileName: (format) => `google-ai-tts.${format}.js`,
    },
    rollupOptions: {
      // Externalize React so consumers supply their own
      external: ['react', 'react-dom'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
        },
      },
    },
  },
})