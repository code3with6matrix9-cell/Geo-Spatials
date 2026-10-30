/**
 * Supabase Storage service used by the Gallery.
 *
 * Design notes:
 * - Talks to the Storage REST API directly (`/storage/v1/...`) with the public
 *   anon/publishable key only. No privileged key ever reaches this module.
 * - Storage paths contain spaces (e.g. "Delhi Government Workshop"), so every
 *   path is encoded per-segment and never as a single blob, and never twice.
 * - Folder listings, folder traversals and signed URLs are memoised so the
 *   landing page and the event page share one round of requests.
 * - The `docs` bucket is private: every image and the lightbox are served
 *   through time-limited signed URLs. The app never uses
 *   `/object/public/...` or the public image-render endpoint — neither can
 *   serve a private bucket — and it never reads bucket metadata. Signing
 *   runs as the caller, so listing and signing are both authorised by the
 *   same SELECT policy.
 * - Traversal is bounded (depth + file cap + visited set) so it can never loop
 *   forever or hammer the API.
 *
 * Expected bucket layout (bucket id is configurable, default `docs`):
 *
 *   docs/
 *   ├── Delhi Government Workshop/   <- event folder (shown as a card)
 *   ├── docs/                        <- generic folder (hidden by default)
 *   └── some-file.jpg                <- root level file (never a card)
 */

const DEFAULT_SUPABASE_URL = "https://rtozhqvzunrsulnsvrxo.supabase.co";

function readEnv(read) {
  try {
    const value = read();
    return typeof value === "string" && value.trim() ? value.trim() : "";
  } catch {
    // `import.meta.env` is unavailable outside a Vite runtime.
    return "";
  }
}

const SUPABASE_URL = (
  readEnv(() => import.meta.env.VITE_SUPABASE_URL) || DEFAULT_SUPABASE_URL
).replace(/\/+$/, "");
const SUPABASE_ANON_KEY = readEnv(() => import.meta.env.VITE_SUPABASE_ANON_KEY);
const BUCKET = readEnv(() => import.meta.env.VITE_SUPABASE_STORAGE_BUCKET) || "docs";

/** Raster formats the gallery renders. SVG is intentionally excluded: it is only
 *  safe in a constrained context and event photography does not need it. */
const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "avif",
  "bmp",
  "jfif",
]);

const DOCUMENT_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "txt",
  "csv",
  "rtf",
  "odt",
  "ods",
  "zip",
  "rar",
  "7z",
]);

/** Root folders that are storage plumbing rather than an event category. */
const NON_EVENT_FOLDERS = new Set(["docs"]);

const LIST_PAGE_SIZE = 100;
const MAX_LISTED_ENTRIES = 2000;
const MAX_TRAVERSE_DEPTH = 4;
const MAX_IMAGES_PER_EVENT = 500;
// Signed URLs arrive with one hour of validity; the cache keeps them for 45
// minutes so a URL in use is always re-requested well before it can expire.
const SIGNED_URL_TTL_MS = 45 * 60 * 1000;
const SIGNED_URL_EXPIRES_S = 3600;
// After a signing failure, retries for the same path pause briefly so a broken
// policy cannot trigger one Storage request per rendered image.
const SIGN_FAILURE_TTL_MS = 8 * 1000;
// The batch sign endpoint accepts up to 1000 paths per request; sign in chunks
// of 100 with a few chunks in flight so a 500-image event needs ~5 requests.
const SIGN_BATCH_SIZE = 100;
const SIGN_BATCH_CONCURRENCY = 3;

export class StorageError extends Error {
  constructor(message, { status, code, cause } = {}) {
    super(message);
    this.name = "StorageError";
    this.status = status ?? null;
    this.code = code ?? "storage-error";
    if (cause) this.cause = cause;
  }
}

export function isConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && BUCKET);
}

export function getStorageConfig() {
  return { supabaseUrl: SUPABASE_URL, bucket: BUCKET, hasKey: Boolean(SUPABASE_ANON_KEY) };
}

/* ------------------------------------------------------------------ *
 * Path helpers
 * ------------------------------------------------------------------ */

/** Encode a Storage path segment by segment so `A B/c d.jpg` becomes
 *  `A%20B/c%20d.jpg` — slashes survive, spaces are encoded once. */
export function encodeStoragePath(path) {
  return String(path)
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function slugify(name) {
  const slug = String(name)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return slug || "event";
}

function extensionOf(name) {
  const index = String(name).lastIndexOf(".");
  return index <= 0 ? "" : name.slice(index + 1).toLowerCase();
}

export function isImageFile(name) {
  return IMAGE_EXTENSIONS.has(extensionOf(name));
}

export function isDocumentFile(name) {
  return DOCUMENT_EXTENSIONS.has(extensionOf(name));
}

function pathDepth(path) {
  let depth = 0;
  for (const ch of path) if (ch === "/") depth += 1;
  return depth;
}

function comparePaths(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/* ------------------------------------------------------------------ *
 * Low level transport
 * ------------------------------------------------------------------ */

async function storageFetch(pathname, { method = "GET", body, signal } = {}) {
  if (!isConfigured()) {
    throw new StorageError(
      "Supabase Storage is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
      { code: "not-configured" },
    );
  }

  let response;
  try {
    response = await fetch(`${SUPABASE_URL}/storage/v1/${pathname}`, {
      method,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (error) {
    if (error && error.name === "AbortError") throw error;
    throw new StorageError(
      "Could not reach Supabase Storage. Check your internet connection.",
      { code: "network", cause: error },
    );
  }

  if (!response.ok) {
    let detail = "";
    try {
      const payload = await response.json();
      detail = payload?.message || payload?.error || payload?.msg || "";
    } catch {
      /* body was not JSON */
    }
    const code =
      response.status === 401 || response.status === 403
        ? "forbidden"
        : response.status === 404
          ? "not-found"
          : "request-failed";
    throw new StorageError(
      code === "forbidden"
        ? "Storage access was denied. Check the bucket policies for the anon key."
        : detail || `Storage request failed (HTTP ${response.status}).`,
      { status: response.status, code },
    );
  }

  return response;
}

/* ------------------------------------------------------------------ *
 * Listings (memoised, paginated)
 * ------------------------------------------------------------------ */

const listCache = new Map();

async function listEntriesRaw(prefix) {
  const entries = [];
  for (let offset = 0; offset < MAX_LISTED_ENTRIES; offset += LIST_PAGE_SIZE) {
    const response = await storageFetch(`object/list/${encodeStoragePath(BUCKET)}`, {
      method: "POST",
      body: {
        prefix,
        limit: LIST_PAGE_SIZE,
        offset,
        sortBy: { column: "name", order: "asc" },
      },
    });
    const batch = await response.json();
    if (!Array.isArray(batch)) {
      throw new StorageError("Supabase Storage returned an unexpected response.", {
        code: "bad-response",
      });
    }
    entries.push(...batch);
    if (batch.length < LIST_PAGE_SIZE) break;
  }
  return entries;
}

function normalizeEntry(entry, parentPrefix) {
  const isFolder = entry?.id === null || entry?.id === undefined;
  const path = parentPrefix ? `${parentPrefix}/${entry.name}` : entry.name;
  return {
    name: entry.name,
    path,
    isFolder,
    mimetype: entry?.metadata?.mimetype || null,
    size: entry?.metadata?.size ?? null,
    createdAt: entry?.created_at || null,
  };
}

function listFolder(prefix) {
  const cacheKey = prefix;
  const cached = listCache.get(cacheKey);
  if (cached) return cached;

  const promise = listEntriesRaw(cacheKey)
    .then((entries) => entries.map((entry) => normalizeEntry(entry, cacheKey)))
    .catch((error) => {
      // Failed listings are dropped from the cache so "Try again" re-fetches.
      listCache.delete(cacheKey);
      throw error;
    });

  listCache.set(cacheKey, promise);
  return promise;
}

/* ------------------------------------------------------------------ *
 * Folder traversal (bounded, deduplicated)
 * ------------------------------------------------------------------ */

const traversalCache = new Map();

async function traverseFolder(prefix, { maxDepth, maxImages }) {
  const images = [];
  const documents = [];
  const others = [];
  let truncated = false;
  let subfolders = 0;
  const visited = new Set();

  const walk = async (current, depth) => {
    if (truncated || visited.has(current)) return;
    visited.add(current);

    const entries = await listFolder(current);
    for (const entry of entries) {
      if (truncated) return;

      if (entry.isFolder) {
        subfolders += 1;
        if (depth < maxDepth) await walk(entry.path, depth + 1);
        continue;
      }

      if (isImageFile(entry.name)) {
        if (images.length >= maxImages) {
          truncated = true;
          return;
        }
        images.push(entry);
      } else if (isDocumentFile(entry.name)) {
        documents.push(entry);
      } else {
        others.push(entry);
      }
    }
  };

  await walk(prefix, 0);

  // Shallowest first (files directly inside the event folder), then A→Z.
  images.sort(
    (a, b) => pathDepth(a.path) - pathDepth(b.path) || comparePaths(a.path, b.path),
  );
  documents.sort((a, b) => comparePaths(a.path, b.path));

  return { images, documents, others, truncated, subfolders };
}

function collectFolder(prefix, options = {}) {
  const maxDepth = options.maxDepth ?? MAX_TRAVERSE_DEPTH;
  const maxImages = options.maxImages ?? MAX_IMAGES_PER_EVENT;
  const cacheKey = `${prefix}|${maxDepth}|${maxImages}`;

  const cached = traversalCache.get(cacheKey);
  if (cached) return cached;

  const promise = traverseFolder(prefix, { maxDepth, maxImages }).catch((error) => {
    traversalCache.delete(cacheKey);
    throw error;
  });

  traversalCache.set(cacheKey, promise);
  return promise;
}

/* ------------------------------------------------------------------ *
 * Event folders
 * ------------------------------------------------------------------ */

function assignSlugs(folders) {
  const used = new Set();
  return folders.map((folder) => {
    const base = slugify(folder.name);
    let slug = base;
    let counter = 2;
    while (used.has(slug)) slug = `${base}-${counter++}`;
    used.add(slug);
    return { ...folder, slug };
  });
}

export async function listEventFolders() {
  const entries = await listFolder("");
  const folders = entries.filter((entry) => entry.isFolder);
  const events = folders
    .filter((entry) => {
      const lower = entry.name.toLowerCase();
      return !NON_EVENT_FOLDERS.has(lower) && lower !== BUCKET.toLowerCase();
    })
    .sort((a, b) => comparePaths(a.name, b.name));

  return assignSlugs(events);
}

export async function getEventBySlug(slug) {
  if (!slug) return null;
  const folders = await listEventFolders();
  return folders.find((folder) => folder.slug === slug) || null;
}

/** Cover image + counts for one event folder (shared cache with the event page). */
export async function getEventSummary(folderPath, options = {}) {
  const collected = await collectFolder(folderPath, options);
  return {
    cover: collected.images[0] || null,
    imageCount: collected.images.length,
    documentCount: collected.documents.length,
    truncated: collected.truncated,
    hasImages: collected.images.length > 0,
  };
}

/** Every image belonging to one event folder, including nested folders.
 *  Also warms the signed-URL cache in batches so the grid does not issue one
 *  signing request per image (best effort — failures degrade to lazy signing). */
export async function getEventMedia(folderPath, options = {}) {
  const collected = await collectFolder(folderPath, options);
  await primeSignedUrls(collected.images.map((image) => image.path)).catch(() => {});
  return collected;
}

/* ------------------------------------------------------------------ *
 * Object URLs — signed only (`docs` is a private bucket)
 * ------------------------------------------------------------------ */

function publicObjectUrl(path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${encodeStoragePath(BUCKET)}/${encodeStoragePath(path)}`;
}

function signedObjectUrl(signedPath) {
  const suffix = signedPath.startsWith("/") ? signedPath : `/${signedPath}`;
  return `${SUPABASE_URL}/storage/v1${suffix}`;
}

/* Signed-URL cache: entries move from `pending` (in-flight, shared by every
 * caller) to a settled `{url, at}` reused until SIGNED_URL_TTL_MS passes.
 * Failures are never cached as results — only as a short pause marker. */
const signedCache = new Map();
const signFailures = new Map();

async function requestSignedUrl(path) {
  const response = await storageFetch(`object/sign/${encodeStoragePath(BUCKET)}`, {
    method: "POST",
    body: { expiresIn: SIGNED_URL_EXPIRES_S, paths: [path] },
  });
  const payload = await response.json();
  const entry = Array.isArray(payload) ? payload[0] : payload;
  const signedPath = entry?.signedURL || entry?.signedUrl;
  if (!signedPath) {
    throw new StorageError(
      (entry && entry.error) || "Supabase Storage did not return a signed URL.",
      { code: "sign-failed" },
    );
  }
  return signedObjectUrl(signedPath);
}

/**
 * A time-limited signed URL for one object, or null when signing is not
 * permitted (the image component then shows its fallback instead of a broken
 * image). In-flight requests are shared, settled URLs are reused until they
 * near expiry, failures pause retries for a few seconds, and `force` always
 * asks the API for a fresh signature — used after a displayed URL stops
 * working (expired or revoked), never for plain renders.
 */
export function getSignedUrl(path, { force = false } = {}) {
  if (!path) return Promise.resolve(null);

  if (force) {
    signedCache.delete(path);
    signFailures.delete(path);
  }

  const failedAt = signFailures.get(path);
  if (failedAt !== undefined) {
    if (Date.now() - failedAt < SIGN_FAILURE_TTL_MS) return Promise.resolve(null);
    signFailures.delete(path);
    signedCache.delete(path);
  }

  const entry = signedCache.get(path);
  if (entry) {
    if (entry.pending) return entry.promise;
    if (Date.now() - entry.at < SIGNED_URL_TTL_MS) return Promise.resolve(entry.url);
    signedCache.delete(path); // nearing expiry → sign again below
  }

  const record = { pending: true, promise: null, url: null, at: 0 };
  record.promise = requestSignedUrl(path)
    .then((url) => {
      record.pending = false;
      record.url = url;
      record.at = Date.now();
      signFailures.delete(path);
      return url;
    })
    .catch(() => {
      signedCache.delete(path);
      signFailures.set(path, Date.now());
      return null;
    });
  signedCache.set(path, record);
  return record.promise;
}

async function signBatch(paths) {
  try {
    const response = await storageFetch(`object/sign/${encodeStoragePath(BUCKET)}`, {
      method: "POST",
      body: { expiresIn: SIGNED_URL_EXPIRES_S, paths },
    });
    const payload = await response.json();
    const items = Array.isArray(payload) ? payload : [];
    const at = Date.now();
    for (const item of items) {
      const itemPath = item && item.path;
      const signedPath = item && (item.signedURL || item.signedUrl);
      if (!itemPath) continue;
      if (signedPath) {
        signedCache.set(itemPath, { pending: false, url: signedObjectUrl(signedPath), at });
        signFailures.delete(itemPath);
      } else {
        signFailures.set(itemPath, at);
      }
    }
  } catch {
    // Storage unreachable or denied: pause the whole batch so the per-image
    // path does not fire one doomed request per rendered image.
    const at = Date.now();
    for (const itemPath of paths) signFailures.set(itemPath, at);
  }
}

/**
 * Warms the cache for a whole event in chunked batch requests so a grid signs
 * ~N/100 paths instead of one request per image. Never throws: failures leave
 * those paths to the lazy per-image flow.
 */
async function primeSignedUrls(paths) {
  const pending = [];
  const seen = new Set();
  for (const path of paths) {
    if (!path || seen.has(path) || signedCache.has(path) || signFailures.has(path)) continue;
    seen.add(path);
    pending.push(path);
  }

  const batches = [];
  for (let index = 0; index < pending.length; index += SIGN_BATCH_SIZE) {
    batches.push(pending.slice(index, index + SIGN_BATCH_SIZE));
  }
  for (let index = 0; index < batches.length; index += SIGN_BATCH_CONCURRENCY) {
    await Promise.all(
      batches.slice(index, index + SIGN_BATCH_CONCURRENCY).map((batch) => signBatch(batch)),
    );
  }
}

/**
 * Ordered list of URLs to try for one stored file. The bucket is private, so
 * this is the signed original — the same URL serves the grid and the lightbox.
 * An empty list means signing is currently not permitted; the image component
 * renders its fallback rather than a broken image.
 */
export async function getMediaCandidates(path) {
  const signed = await getSignedUrl(path);
  return signed ? [signed] : [];
}

/**
 * Last resort when a displayed candidate stops working (typically an expired
 * signature): force a FRESH signature instead of retrying the same URL, so a
 * stale link is replaced exactly once and the component never loops.
 */
export function getEmergencyCandidate(path) {
  return getSignedUrl(path, { force: true });
}

/** Test/debug helper: build the public URL for a stored object. */
export function getPublicObjectUrl(path) {
  return publicObjectUrl(path);
}

export function clearStorageCache() {
  listCache.clear();
  traversalCache.clear();
  signedCache.clear();
  signFailures.clear();
}
