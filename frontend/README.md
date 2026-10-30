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

## Gallery (`/gallery`)

The Gallery is a React route that lists event folders directly from Supabase
Storage — no hard-coded event names, images or URLs.

| Route | What it shows |
| --- | --- |
| `/gallery` | One card per event folder (cover image, label, photo count) |
| `/gallery/<slug>` | Breadcrumb, title, responsive image grid and lightbox for one event |

Slugs are derived from folder names, e.g. `Delhi Government Workshop` →
`/gallery/delhi-government-workshop`.

### How event folders are discovered

- Every **folder** in the root of the storage bucket becomes an event card.
- **Files** in the bucket root are never event cards.
- The generic `docs` plumbing folder is hidden by default (denylist:
  `NON_EVENT_FOLDERS` in `src/services/supabaseStorage.js`).
- Sub-folders inside an event are traversed (bounded depth 4 / 500 images /
  visited-set, so it can never loop or hammer the API). Images from nested
  folders appear in that event's gallery.
- The cover image is the shallowest, then A→Z first image of the folder. Folders
  without a usable image get a placeholder card.
- Only raster images are shown (`jpg jpeg png webp gif avif bmp jfif`); SVG is
  deliberately excluded for safety. PDFs and other documents are counted but not
  rendered.
- Grid thumbnails use Supabase's image-render endpoint (one tiny probe decides if
  transformations are enabled); the lightbox loads the original. Private buckets
  automatically switch to time-limited signed URLs.

### Environment variables

Set these in `frontend/.env.local` for local work and in the Vercel project
environment for production (then **redeploy**, because Vite inlines `VITE_*`
values at build time):

```text
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=<public anon or publishable key>
VITE_SUPABASE_STORAGE_BUCKET=docs   # optional, this is the default
```

`VITE_SUPABASE_ANON_KEY` must be the **public anon/publishable key only**
(`eyJ…` JWT or `sb_publishable_…`). Never place a `service_role` key, an
`sb_secret_*` token or an `sbp_*` personal access token in frontend
configuration — anything in a `VITE_*` variable is published in the browser
bundle.

### Supabase configuration (manual steps)

1. In **Storage**, open the bucket (default `docs`) and note whether it is
   **Public** or **Private**.
   - **Public bucket** — object *downloads* and image *transforms* are served by
     Storage's super-user path (`/object/public/...`,
     `/render/image/public/...`) and need **no RLS policy at all**. Only
     **listing** needs a policy.
   - **Private bucket** — the Gallery signs URLs on the fly; signing runs as the
     caller, so the same `SELECT` policy below covers it too.
2. The only policy the Gallery needs is `SELECT` on `storage.objects`, scoped to
   this bucket. **No `storage.buckets` policy is required**: listing never reads
   the buckets table, public downloads bypass RLS, and the Gallery's
   `GET /bucket/:id` probe treats a failure as "assume public" and falls back to
   signed URLs. Recommended (also hides the `docs/` plumbing folder and
   root-level files from anon, mirroring the app's denylist at the policy
   layer):
   ```sql
   create policy "Gallery: anon may list and read event folders"
   on storage.objects for select
   to anon
   using (
     bucket_id = 'docs'
     and (storage.foldername(name))[1] is not null      -- no root-level files
     and (storage.foldername(name))[1] <> 'docs'        -- no plumbing subfolder
   );
   ```
   Absolute minimum, if everything inside the bucket is public anyway:
   `using (bucket_id = 'docs')`. Adjust to your access model — do not weaken
   policies to make the Gallery work; the Gallery adapts to the bucket instead.
   Note: in a **public** bucket the Public/Private flag is bucket-wide, so RLS
   cannot stop direct public-URL downloads of any object — genuinely sensitive
   files belong in a separate private bucket, not in `docs`.
3. Keep event photos inside per-event folders. Root-level files are ignored by
   design.

### Verify the integration against the live bucket

```bash
VITE_SUPABASE_ANON_KEY=... npm run verify:storage
```

This runs `scripts/verifyStorage.mjs` through the same Vite build the app uses,
so it exercises the real service code. It checks folder discovery, the `docs`
denylist, root-file exclusion, slug and path encoding (space handling, no
double-encoding), per-event image counts, nested traversal, cover selection and
that the generated image URLs actually resolve (HTTP 200/206). Exit code is
non-zero if any check fails.

### Troubleshooting: verification reports 0 event folders

The script prints read-only diagnostics (HTTP status, API error message, entry
count and names, folder-vs-file counts) and runs control probes against a
deliberately-bogus bucket id and key. It never prints credentials. Reading the
result:

- **Listing returns `[]` and every probe against a bogus bucket id returns the
  same answer** ("Bucket not found", 0 entries) — the API cannot distinguish
  the real bucket from one that cannot exist, i.e. the anon role sees no rows
  in `storage.buckets`/`storage.objects`. This is the missing-SELECT-policy
  case above, **not** a parsing bug and **not** proof the bucket id is wrong.
  Fix: add the two policies above (Storage → Policies).
- **Storage rejects even the configured key** — the key in
  `VITE_SUPABASE_ANON_KEY` is wrong or from another project; copy the current
  project's publishable key from Project Settings → API.
- **Listing returns entries but 0 folders** — inspect the printed entry names;
  folders must have a null/absent `id`, files a present one.

The dashboard (signed in as the project owner) always sees the folders because
it queries with the service role, which bypasses these RLS checks — that
asymmetry is expected and is why the anon policies must be verified explicitly.

### Routing/deployment notes

- `vercel.json` rewrites `/gallery` and `/gallery/:path*` to `index.html`
  (SPA fallback), so deep links and refreshes work on Vercel. The Vercel
  **Root Directory** for this project must stay `frontend`.
- The Gallery uses a small History-API router (`src/lib/router.jsx`); no routing
  library was added. Same-origin links are intercepted client-side; external,
  `mailto:`/`tel:` and hash links keep their default behaviour.
- The classic home page markup stays mounted (hidden on Gallery routes) so
  `site.js` and `registration.js` initialize exactly once and the registration
  modal works from every route.

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
