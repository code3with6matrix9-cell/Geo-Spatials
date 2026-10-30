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
const THUMB_WIDTH = 900;
const THUMB_QUALITY = 72;
const SIGNED_URL_TTL_MS = 45 * 60 * 1000;

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

/** Every image belonging to one event folder, including nested folders. */
export async function getEventMedia(folderPath, options = {}) {
  const collected = await collectFolder(folderPath, options);
  return collected;
}

/* ------------------------------------------------------------------ *
 * Object URLs (public, transform, signed)
 * ------------------------------------------------------------------ */

function publicObjectUrl(path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${encodeStoragePath(BUCKET)}/${encodeStoragePath(path)}`;
}

function publicRenderUrl(path, width = THUMB_WIDTH) {
  return `${SUPABASE_URL}/storage/v1/render/image/public/${encodeStoragePath(BUCKET)}/${encodeStoragePath(path)}?width=${width}&quality=${THUMB_QUALITY}`;
}

function signedObjectUrl(signedPath) {
  const suffix = signedPath.startsWith("/") ? signedPath : `/${signedPath}`;
  return `${SUPABASE_URL}/storage/v1${suffix}`;
}

let visibilityPromise = null;

/** `public` buckets can be read with plain URLs; `private` buckets need signed
 *  URLs. Resolved once per session and reused by every image on the page. */
async function getBucketVisibility() {
  if (!visibilityPromise) {
    visibilityPromise = (async () => {
      try {
        const response = await storageFetch(`bucket/${encodeStoragePath(BUCKET)}`);
        const info = await response.json();
        return info?.public ? "public" : "private";
      } catch (error) {
        if (error instanceof StorageError && error.code === "not-configured") throw error;
        // Older deployments may hide bucket metadata from the anon key: assume
        // public and let the per-image fallback sign the object if needed.
        return "public";
      }
    })();
  }
  return visibilityPromise;
}

const signedCache = new Map();

/** Returns a time-limited signed URL, or null when signing is not allowed. */
export async function getSignedUrl(path) {
  const cached = signedCache.get(path);
  if (cached && Date.now() - cached.at < SIGNED_URL_TTL_MS) return cached.url;

  try {
    const response = await storageFetch(`object/sign/${encodeStoragePath(BUCKET)}`, {
      method: "POST",
      body: { expiresIn: 3600, paths: [path] },
    });
    const payload = await response.json();
    const entry = Array.isArray(payload) ? payload[0] : payload;
    const signedPath = entry?.signedURL || entry?.signedUrl;
    if (!signedPath) return null;
    const url = signedObjectUrl(signedPath);
    signedCache.set(path, { url, at: Date.now() });
    return url;
  } catch {
    return null;
  }
}

let transformProbe = null;

/** Image transformation may be disabled on the project; probe once with a tiny
 *  render so the grid does not issue a failing request for every thumbnail. */
async function transformsSupported(probePath) {
  if (!transformProbe) {
    transformProbe = (async () => {
      try {
        const response = await fetch(publicRenderUrl(probePath, 16), {
          headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
          signal: AbortSignal.timeout(15000),
        });
        return response.ok;
      } catch {
        // Network hiccup: prefer thumbnails and fall back per image.
        return true;
      }
    })();
  }
  return transformProbe;
}

/**
 * Ordered list of URLs to try for one stored file.
 * [0] is the cheap thumbnail (public buckets with transforms enabled),
 * [1] the original object. Private buckets get a signed original.
 */
export async function getMediaCandidates(path, { kind = "image" } = {}) {
  const visibility = await getBucketVisibility();

  if (visibility === "private") {
    const signed = await getSignedUrl(path);
    return signed ? [signed] : [];
  }

  if (kind !== "image") return [publicObjectUrl(path)];

  const supported = await transformsSupported(path);
  const full = publicObjectUrl(path);
  const thumb = publicRenderUrl(path);
  return supported && thumb !== full ? [thumb, full] : [full];
}

/** Last resort used when every candidate failed: the bucket was private after
 *  all (bucket metadata hidden), so sign the object now. */
export async function getEmergencyCandidate(path) {
  const visibility = await getBucketVisibility();
  if (visibility === "private") return null;
  return getSignedUrl(path);
}

/** Test/debug helper: build the public URL for a stored object. */
export function getPublicObjectUrl(path) {
  return publicObjectUrl(path);
}

export function clearStorageCache() {
  listCache.clear();
  traversalCache.clear();
  signedCache.clear();
  visibilityPromise = null;
  transformProbe = null;
}
