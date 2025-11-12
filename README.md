<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Fee Calculator

A Vite + React implementation of the architectural fee calculator that can be deployed to GitHub Pages.

## Local development

- Install dependencies: `npm install`
- Start the dev server: `npm run dev`
- Run a production build: `npm run build`

## Deploying to GitHub Pages

This repository contains a GitHub Actions workflow (`.github/workflows/deploy.yml`) that automatically builds the site and publishes the `dist` folder to GitHub Pages whenever changes are pushed to `main` (you can also trigger it manually via *Run workflow*).

During the build we set `VITE_BASE_PATH=/<repo-name>/`, ensuring that the generated assets use the correct base URL for Pages (e.g. `/Fee-Calculator/`). Vite also falls back to `'/'` for local development so no extra configuration is required when running `npm run dev`.

### Testing the production build locally

If you want to preview exactly what will be deployed to Pages, run:

```bash
VITE_BASE_PATH=/Fee-Calculator/ npm run build
npm run preview
```

Replace `/Fee-Calculator/` with the path that matches your repository name if you fork this project.
