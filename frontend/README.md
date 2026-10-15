# GEOSPATIALS React frontend

This is a Vite + React migration of the supplied static GEOSPATIALS website.

## Run locally

```bash
npm install
cp .env.example .env
npm run dev
```

Set `VITE_API_BASE_URL` to the Spring Boot API base URL. For local development it defaults to `http://localhost:8080`.

## Production build

```bash
npm run build
npm run preview
```

## Deployment

The frontend is intended to deploy independently from the Spring Boot backend. Configure this Vercel environment variable:

```text
VITE_API_BASE_URL=https://geo-spatials-production-2026.onrender.com
```

Then redeploy the frontend.

## Migration note

The original HTML body, CSS, assets, and classic JavaScript behavior are retained to prioritize visual and behavioral parity. The markup is mounted by React as a preserved HTML fragment, and the legacy scripts are loaded in order after the markup exists. This is a safe first migration step to React/Vite; the legacy UI can later be split into individual React components without changing its appearance.
