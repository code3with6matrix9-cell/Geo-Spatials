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


## SEO and Google Search Console

The production build includes these files at the site root:

- `https://www.geospatials.org/robots.txt` — permits crawling and points to the sitemap.
- `https://www.geospatials.org/sitemap.xml` — lists the canonical homepage. The current website is a single-page layout, so section anchors such as `#about` are not separate sitemap URLs.
- `index.html` — contains a descriptive title and meta description, canonical URL, Open Graph/Twitter metadata, and `WebSite`/`Organization` JSON-LD.

### Deploy and configure Google Search Console

1. Run `npm run build` and deploy the updated frontend to Vercel. Confirm the Vercel production domain is configured to serve `https://www.geospatials.org/`.
2. Open [Google Search Console](https://search.google.com/search-console/) and add a **Domain property** for `geospatials.org` (without `https://` or `www`).
3. Copy the DNS TXT verification record Google provides into the DNS provider for `geospatials.org`. Keep the record in place after verification. If DNS access is unavailable, add a URL-prefix property for `https://www.geospatials.org/` and use one of its offered verification methods.
4. After verification, open **Sitemaps**, enter `sitemap.xml`, and submit it.
5. Open **URL Inspection**, enter `https://www.geospatials.org/`, test the live URL, then select **Request indexing** if available.
6. Check **Page indexing**, **Sitemaps**, and **Performance → Search results** over the following days and weeks. Fix any crawl, canonical, or indexing errors shown there.

### Keyword strategy

Use relevant phrases naturally in visible copy rather than relying on a `meta keywords` tag (Google does not use that tag for ranking). Initial themes for this homepage are: `GEOSPATIALS`, `geospatial learning platform`, `GIS learning`, `remote sensing`, `drone mapping`, `LiDAR`, `GeoAI`, `geospatial technology in India`, `geospatial careers`, `geospatial trainers`, and `geospatial industry partnerships`. Search Console performance data should guide future content updates. Avoid repeating keywords unnaturally.

### Important SEO limitation

This frontend is a Vite/React single-page app that inserts the main page markup client-side. Google can render JavaScript, but rendering can be delayed and other crawlers may not execute it. For stronger and more consistent SEO—especially if you later add separate landing pages—consider prerendering the homepage or moving to an SSR/static-generation setup. The sitemap currently includes only the real canonical homepage; do not list hash links as separate pages.
