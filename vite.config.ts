import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  // IMPORTANT: Replace 'your-repo-name' with the actual name of your GitHub repository.
  base: '/Fee-Calculator.git', 
  plugins: [react()],
})
