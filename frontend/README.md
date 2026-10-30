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
- **Private bucket (this project's case): `docs`, `public = false`** — every grid
  thumbnail and lightbox image is served through a **time-limited signed URL**
  generated on the fly. The app never uses `/object/public/...` or the public
  image-render endpoint, because neither can serve a private bucket. Signing
  runs as the caller, so the same `SELECT` policy below authorizes both listing
  and signing.
- Public buckets still work if you ever switch: signed URLs are valid for public
  objects too, so the code path is unchanged.

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

1. In **Storage**, open the bucket (default `docs`). For this project it stays
   **Private** (`public = false`) — do not make it public and do not create a new
   bucket. The Gallery reads it through **signed URLs**, which work for a private
   bucket and require no public access.
2. The only policy the Gallery needs is `SELECT` on `storage.objects`, scoped to
   this bucket. **No `storage.buckets` policy is required and none is created**:
   the app was changed to avoid the `GET /bucket/:id` metadata request entirely,
   so a buckets policy is unnecessary. Listing and signing are both authorized by
   the single `SELECT` policy below (signing runs as the caller). It also hides
   the `docs/` plumbing folder and root-level files from anon, mirroring the
   app's denylist at the policy layer:
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
   design and are never exposed by the recommended policy.

### Verify the integration against the live bucket

```bash
VITE_SUPABASE_ANON_KEY=... npm run verify:storage
```

This runs `scripts/verifyStorage.mjs` through the same Vite build the app uses,
so it exercises the real service code. It checks folder discovery, the `docs`
denylist, root-file exclusion, slug and path encoding (space handling, no
double-encoding), per-event image counts, nested traversal and cover selection.
**Section 6** then signs a real discovered object and actually retrieves it, to
prove signed-URL generation (category 6) and genuine image delivery (category 7)
— a signed URL is never counted as working on HTTP 200 alone. Image checks
follow the browser's real chain — candidates in order, then one fresh signature —
and report which route loaded each file. Section 2d probes listing vs image
access independently (event-folder listing, public/credentialed/transform/signed
URL, each with a bogus-id control); set `VERIFY_EVENT_PREFIX` to override the
folder name used there. The final **Outcome classification** block maps the run
to the nine cases (network/auth failure; RLS-filtered empty listing; listing OK
but no folders; folder discovery; image discovery; signed-URL generation; image
retrieval; expired/unauthorized signed URL; unsupported transformations). If no
real object is discoverable, image delivery is reported as **UNVERIFIED**, never
as a pass. Signed URLs embed a bearer token, so they are redacted in all output.
Exit code is non-zero if any check fails.

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
  Fix: add the `storage.objects` policy above (Storage → Policies).
- **Section 2d: public image URL says "Bucket not found" but the credentialed
  URL says "Object not found"** — the bucket id is correct and the bucket is
  **private**. Expected: `/object/public/...` and `/render/image/public/...`
  only ever serve buckets flagged public (super-user + `isPublic: true`; no
  policy changes that), so they cannot serve `docs`. The Gallery already loads
  every image via signed URLs, so once the `SELECT` policy exists, verification
  section 6 reports a signed URL that `serves real image bytes`. Thumbnails are
  signed originals (no public transform route) while the bucket stays private.
- **No `storage.buckets` policy needed** — the Gallery no longer issues a
  `GET /bucket/:id` visibility request at all, so there is nothing to grant. If
  an old buckets policy exists it is harmless but unused. Every image is signed
  from the first request.
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
