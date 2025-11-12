import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const explicitBase = process.env.VITE_BASE_PATH
  const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1]
  const base =
    explicitBase ??
    (mode === 'production' && repoName ? `/${repoName}/` : '/')

  return {
    base,
    plugins: [react()],
  }
})
