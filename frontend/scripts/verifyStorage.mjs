#!/usr/bin/env node
/**
 * End-to-end verification of the Gallery's Supabase Storage integration.
 *
 * It exercises the exact same service module the React pages use, so what it
 * reports is what the Gallery will do in the browser:
 *
 *   1. config sanity (public anon/publishable key only)
 *   2. root listing: folders become event cards, root-level files never do
 *   3. the non-event denylist (e.g. the `docs` plumbing folder)
 *   4. folder names containing spaces are encoded once (no %2520)
 *   5. per event: image counts, nested traversal, cover selection
 *   6. signed URL generation + actual image bytes (the private-bucket path)
 *
 * Run it with the key in the environment or in frontend/.env.local:
 *
 *   VITE_SUPABASE_ANON_KEY=sb_publishable_... npm run verify:storage
 *
 * The script only ever reads. It never uploads, mutates policies or deletes.
 */

import {
  listEventFolders,
  getEventSummary,
  getEventMedia,
  getMediaCandidates,
  getEmergencyCandidate,
  getPublicObjectUrl,
  getSignedUrl,
  getStorageConfig,
  isConfigured,
  encodeStoragePath,
} from "../src/services/supabaseStorage.js";

const failures = [];
let checks = 0;

function check(label, ok, detail = "") {
  checks += 1;
  const mark = ok ? "PASS" : "FAIL";
  console.log(`  [${mark}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
}

/** HEAD the URL (falling back to a body-less GET); reports status and the
 *  Content-Type so a "200" that is actually an HTML error page is not counted
 *  as a delivered image. */
async function probe(url, { hasKey }) {
  // The public anon key is not a secret; sending it matches what the browser
  // does and keeps the check valid for buckets that require apikey headers.
  const key = readAnonKey();
  const headers = hasKey && key ? { apikey: key, Authorization: `Bearer ${key}` } : {};

  const request = (method) =>
    fetch(url, { method, headers, signal: AbortSignal.timeout(20000) });

  try {
    let response = await request("HEAD");
    if (response.status === 405 || response.status === 501) {
      response = await request("GET");
      await response.body?.cancel().catch(() => {});
    }
    return {
      status: response.status,
      contentType: response.headers.get("content-type") || "",
    };
  } catch (error) {
    return { status: 0, contentType: "", error: error.message };
  }
}

function readAnonKey() {
  try {
    // Same static read the browser bundle performs.
    return import.meta.env.VITE_SUPABASE_ANON_KEY || "";
  } catch {
    return "";
  }
}

/** Classify a generated URL so reports say WHICH route loaded the image. */
function urlKind(url) {
  if (url.includes("/render/image/")) return "thumbnail";
  if (url.includes("/object/public/")) return "public original";
  if (url.includes("/object/sign/") || url.includes("token=")) return "signed";
  return "url";
}

/** A 200 whose body is an HTML/JSON error page must not count as an image. */
function looksLikeImage(contentType) {
  const type = String(contentType || "").split(";")[0].trim().toLowerCase();
  if (!type || type.startsWith("image/") || type === "application/octet-stream") return true;
  return false;
}

/**
 * Probe one stored file exactly the way StorageImage does in the browser:
 * every candidate in order, then ONE fresh signature via the emergency path,
 * then give up. Reports each attempt's status/content-type, and labels
 * 401/403 as "unauthorized/expired" so expired signatures are distinguishable
 * from missing objects. URLs themselves are never printed.
 */
async function probeLikeBrowser(path, config) {
  const candidates = await getMediaCandidates(path);
  const attempts = [];
  const describe = (result) => {
    let attempt = `HTTP ${result.status}`;
    if (result.status === 401 || result.status === 403) attempt += " (unauthorized/expired)";
    if (result.error) attempt += ` error: ${result.error}`;
    return attempt;
  };

  for (const url of candidates) {
    const kind = urlKind(url);
    const result = await probe(url, config);
    attempts.push(`${kind} ${describe(result)}`);
    if ((result.status === 200 || result.status === 206) && looksLikeImage(result.contentType)) {
      return {
        ok: true,
        detail: `${attempts.join("; ")} — loaded via ${kind}${
          result.contentType ? ` (${result.contentType.split(";")[0]})` : ""
        }`,
      };
    }
    if (result.status === 200 || result.status === 206) {
      attempts[attempts.length - 1] += ` unexpected content-type ${
        result.contentType || "(none)"
      }`;
    }
  }

  const emergency = path ? await getEmergencyCandidate(path) : null;
  if (emergency) {
    const result = await probe(emergency, config);
    attempts.push(`fresh signed ${describe(result)}`);
    if ((result.status === 200 || result.status === 206) && looksLikeImage(result.contentType)) {
      return {
        ok: true,
        detail: `${attempts.join("; ")} — loaded via re-signed URL${
          result.contentType ? ` (${result.contentType.split(";")[0]})` : ""
        }`,
      };
    }
    return { ok: false, detail: attempts.join("; ") };
  }

  return {
    ok: false,
    detail: attempts.length
      ? `${attempts.join("; ")}; no fresh signature available`
      : "no candidate URL produced (signing unavailable)",
  };
}

/** Names are content, not credentials — but never echo anything that looks
 *  like a token, in case one ever ends up inside a file name. */
function safeName(name) {
  return String(name).replace(
    /(sbp_[A-Za-z0-9_-]+|sb_secret_[A-Za-z0-9_-]+|sb_publishable_[A-Za-z0-9_-]+|service_role|eyJ[A-Za-z0-9_-]{8,})/gi,
    "<redacted>",
  );
}

/** Redact header values; only ever report their length/presence. */
function redactedHeaders(key) {
  return `apikey: <redacted ${key.length} chars>, Authorization: Bearer <redacted ${key.length} chars>`;
}

/** The exact raw POST /object/list request the service sends, reported without
 *  any credential: HTTP status, API error message, entry count, entry names and
 *  the folder-vs-file classification the production parsing applies. */
async function diagnoseRootListing(config) {
  console.log("\n2a) Raw root-listing diagnostics (read-only, never prints credentials)");

  const key = readAnonKey();
  const endpoint = `${config.supabaseUrl}/storage/v1/object/list/${encodeURIComponent(config.bucket)}`;
  const requestBody = { prefix: "", limit: 100, offset: 0, sortBy: { column: "name", order: "asc" } };

  console.log(`  Method      : POST`);
  console.log(`  Endpoint    : ${endpoint}`);
  console.log(`  Request body: ${JSON.stringify(requestBody)}`);
  console.log(`  Headers     : ${redactedHeaders(key)}, Content-Type: application/json`);

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(20000),
    });
  } catch (error) {
    console.log(`  RESULT      : network error — ${error.message}`);
    check("Raw root listing reached the API", false, error.message);
    return null;
  }

  const raw = await response.text();
  console.log(`  HTTP status : ${response.status} ${response.statusText}`);
  console.log(`  Content-Type: ${response.headers.get("content-type") || "(none)"}`);

  let payload = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    /* body was not JSON */
  }

  if (!response.ok) {
    const message =
      (payload && (payload.message || payload.error || payload.msg)) ||
      raw.slice(0, 300);
    console.log(`  API error   : ${safeName(message)}`);
    check("Raw root listing returned HTTP 2xx", false, `HTTP ${response.status}`);
    return null;
  }

  if (!Array.isArray(payload)) {
    if (payload && typeof payload === "object") {
      console.log(
        `  Body shape  : object — top-level keys: ${Object.keys(payload).join(", ")}`,
      );
      console.log(
        `  Hint        : the service expects a bare JSON array; an object body would be rejected as "unexpected response".`,
      );
    } else {
      console.log(`  Body shape  : ${raw ? safeName(raw.slice(0, 300)) : "(empty body)"}`);
    }
    check("Root listing body is a plain JSON array", false, "see body shape above");
    return null;
  }

  // Classify with the exact rule the service uses in normalizeEntry():
  // a folder is an entry whose `id` is null or absent.
  const folders = payload.filter((entry) => entry && (entry.id === null || entry.id === undefined));
  const files = payload.filter((entry) => entry && !(entry.id === null || entry.id === undefined));
  const blanks = payload.filter((entry) => !entry);

  console.log(
    `  Entries     : ${payload.length} total — ${folders.length} folder(s), ${files.length} file(s)${blanks.length ? `, ${blanks.length} blank` : ""}`,
  );
  if (payload[0]) {
    console.log(`  First entry fields: ${Object.keys(payload[0]).join(", ")}`);
  }
  for (const entry of payload) {
    if (!entry) {
      console.log(`    · (blank entry)`);
      continue;
    }
    const isFolder = entry.id === null || entry.id === undefined;
    const idState = entry.id === undefined ? "absent" : entry.id === null ? "null" : "present";
    console.log(
      `    · ${JSON.stringify(safeName(entry.name))} → ${isFolder ? "FOLDER" : "file"} (id=${idState}, metadata=${entry.metadata == null ? "null" : "present"})`,
    );
  }

  return {
    total: payload.length,
    folders,
    files,
    folderNames: folders.map((entry) => entry.name),
  };
}

/** Report bucket visibility so a follow-up permission check is easy to pick. */
async function diagnoseBucket(config) {
  const key = readAnonKey();
  const endpoint = `${config.supabaseUrl}/storage/v1/bucket/${encodeURIComponent(config.bucket)}`;
  try {
    const response = await fetch(endpoint, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15000),
    });
    const body = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(body);
    } catch {
      /* not JSON */
    }
    if (response.ok && payload) {
      console.log(
        `  Bucket info : HTTP ${response.status} — id=${safeName(payload.id)}, public=${payload.public}, created=${payload.created_at || "n/a"}`,
      );
    } else {
      console.log(
        `  Bucket info : HTTP ${response.status} — ${safeName(payload?.message || payload?.error || body.slice(0, 200))}`,
      );
    }
  } catch (error) {
    console.log(`  Bucket info : network error — ${error.message}`);
  }
}

/** Which buckets can this public key actually see? Distinguishes
 *  "wrong bucket id" from "the bucket exists but is invisible to anon". */
async function diagnoseBucketList(config) {
  console.log("\n2b) Bucket enumeration (which buckets does this key see?)");

  const key = readAnonKey();
  const endpoint = `${config.supabaseUrl}/storage/v1/bucket`;
  console.log(`  Endpoint    : GET ${endpoint}`);
  console.log(`  Headers     : ${redactedHeaders(key)}`);

  const result = { count: null, configuredSeen: false };

  try {
    const response = await fetch(endpoint, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15000),
    });
    const body = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(body);
    } catch {
      /* not JSON */
    }

    console.log(`  HTTP status : ${response.status}`);

    if (response.ok && Array.isArray(payload)) {
      result.count = payload.length;
      console.log(`  Buckets     : ${payload.length} returned`);
      if (payload.length === 0) {
        console.log(
          `    (none — this key cannot enumerate buckets, or the project has no buckets visible to anon)`,
        );
      }
      for (const bucket of payload.slice(0, 50)) {
        console.log(
          `    · id=${JSON.stringify(safeName(bucket.id))}, name=${JSON.stringify(safeName(bucket.name))}, public=${bucket.public}, created=${bucket.created_at || "n/a"}`,
        );
      }
      const match = payload.find(
        (bucket) => String(bucket.id).toLowerCase() === config.bucket.toLowerCase(),
      );
      result.configuredSeen = Boolean(match);
      console.log(
        match
          ? `  Configured bucket "${config.bucket}" IS in this list (id matches${String(match.id) !== config.bucket ? ` — exact id is ${JSON.stringify(safeName(match.id))}` : ""}).`
          : `  Configured bucket "${config.bucket}" is NOT in this list.`,
      );
    } else if (response.ok && payload && typeof payload === "object") {
      console.log(`  Body shape  : object — keys: ${Object.keys(payload).join(", ")}`);
      console.log(`  Message     : ${safeName(payload.message || payload.error || "")}`);
    } else {
      console.log(
        `  API error   : ${safeName((payload && (payload.message || payload.error)) || body.slice(0, 300))}`,
      );
    }
  } catch (error) {
    console.log(`  Network error: ${error.message}`);
  }

  return result;
}

/**
 * Differential probes: read-only requests that make the failure mode visible by
 * comparing a known-good value against a deliberately-broken control value.
 * Nothing here mutates data, and no real credential is ever printed (the
 * "bogus" control key is a constant of zeroes and is not a credential).
 */
async function differentialProbes(config, bucketView = { count: null, configuredSeen: false }) {
  console.log("\n2c) Differential probes (control vs real) — read-only");

  const key = readAnonKey();
  const fakeKey = "sb_publishable_0000000000000000000000000000000000000000000000000000";

  const call = async (label, url, { method = "GET", apiKey = key, body } = {}) => {
    try {
      const response = await fetch(url, {
        method,
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${apiKey}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000),
      });
      const text = await response.text();
      let payload = null;
      try {
        payload = JSON.parse(text);
      } catch {
        /* not JSON */
      }
      const summary =
        response.status === 200 && Array.isArray(payload)
          ? `HTTP 200 — array of ${payload.length}`
          : response.status === 200 && payload && typeof payload === "object"
            ? `HTTP 200 — object keys: ${Object.keys(payload).slice(0, 6).join(", ")}`
            : `HTTP ${response.status} — ${safeName((payload && (payload.message || payload.error)) || text.slice(0, 160))}`;
      console.log(`  ${label}: ${summary}`);
      return { status: response.status, payload, text };
    } catch (error) {
      console.log(`  ${label}: network error — ${error.message}`);
      return { status: 0, payload: null, text: "" };
    }
  };

  // Extract the API's own error message from a probe result, redacted.
  const apiError = (result) =>
    safeName(
      (result && result.payload && (result.payload.message || result.payload.error)) ||
        (result ? result.text.slice(0, 120) : "no response"),
    );

  // P1/P2 — is the key accepted by this project at all? PostgREST rejects an
  // unknown key with 401, so the control proves the endpoint discriminates.
  const p1 = await call("P1 PostgREST, our key  ", `${config.supabaseUrl}/rest/v1/`);
  const p2 = await call("P2 PostgREST, bogus key", `${config.supabaseUrl}/rest/v1/`, { apiKey: fakeKey });

  // P3/P4 — does the storage API tell buckets apart? A bucket id that certainly
  // does not exist is the control for the configured one.
  const p3 = await call(
    "P3 list, configured bucket",
    `${config.supabaseUrl}/storage/v1/object/list/${encodeURIComponent(config.bucket)}`,
    { method: "POST", body: { prefix: "", limit: 10, offset: 0 } },
  );
  const p4 = await call(
    "P4 list, bogus bucket     ",
    `${config.supabaseUrl}/storage/v1/object/list/__bogus_bucket_probe__`,
    { method: "POST", body: { prefix: "", limit: 10, offset: 0 } },
  );

  // P5/P6 — bucket metadata control pair.
  const p5 = await call("P5 getBucket, configured id", `${config.supabaseUrl}/storage/v1/bucket/${encodeURIComponent(config.bucket)}`);
  const p6 = await call("P6 getBucket, bogus id     ", `${config.supabaseUrl}/storage/v1/bucket/__bogus_bucket_probe__`);

  // P7 — does the project URL point at a live Supabase project?
  const p7 = await call("P7 auth health             ", `${config.supabaseUrl}/auth/v1/health`);
  const p7ok = p7.status === 200;

  // Summarise the earlier section so the verdicts can reference real numbers.
  const p3Same =
    p3.status === p4.status &&
    apiError(p3) === apiError(p4) &&
    Array.isArray(p3.payload) &&
    Array.isArray(p4.payload);
  const p5Same = p5.status === p6.status && apiError(p5) === apiError(p6);

  // P8/P9 — does STORAGE validate the key against this project? If a bogus key
  // is rejected while ours is accepted, our key is recognised by this project
  // and the emptiness below is a visibility/bucket-id problem instead.
  const p8 = await call(
    "P8 bucket list, our key    ",
    `${config.supabaseUrl}/storage/v1/bucket`,
  );
  const p9 = await call(
    "P9 bucket list, bogus key  ",
    `${config.supabaseUrl}/storage/v1/bucket`,
    { apiKey: fakeKey },
  );

  // P10/P11 — bucket-existence probe that does not depend on list policies:
  // asking for a public object that certainly does not exist usually answers
  // "Bucket not found" for a bucket id that does not exist, and an
  // object-level error when the bucket id itself is real.
  const p10 = await call(
    "P10 public object, cfg. id ",
    `${config.supabaseUrl}/storage/v1/object/public/${encodeURIComponent(config.bucket)}/__verify_probe__.txt`,
  );
  const p11 = await call(
    "P11 public object, bogus id",
    `${config.supabaseUrl}/storage/v1/object/public/__bogus_bucket_probe__/__verify_probe__.txt`,
  );

  // ---- data-driven verdicts (computed from the actual responses above) ----
  const verdicts = [];

  verdicts.push(
    p7ok
      ? "Project URL is a live Supabase project (health 200)."
      : `Project URL health check failed: ${apiError(p7)}`,
  );

  verdicts.push(
    p1.status === p2.status && apiError(p1) === apiError(p2)
      ? `PostgREST answers our key and the bogus key identically (${apiError(p1)}) ⇒ no key signal from PostgREST.`
      : `PostgREST treats our key differently from the bogus key (ours: "${apiError(p1)}" vs bogus: "${apiError(p2)}") ⇒ our key is well-formed and recognised; PostgREST simply requires a different key type.`,
  );

  verdicts.push(
    p9.status === 200
      ? "Storage did not reject the bogus control key — the 200-vs-400 signal is unavailable, so key acceptance cannot be inferred here."
      : p8.status === 200
        ? `Storage accepts our key (200) and rejects the bogus key (${p9.status}) ⇒ key is recognised by this project; the empty results are a visibility problem, not a config typo.`
        : `Storage rejects even our key (${p8.status}: ${apiError(p8)}) — check VITE_SUPABASE_ANON_KEY.`,
  );

  verdicts.push(
    p3Same
      ? "Listing answers identically for the configured bucket and for an id that cannot exist ⇒ the anon role cannot see any objects rows (expected when no SELECT policy matches anon)."
      : "Listing distinguishes the configured bucket from a bogus id ⇒ bucket visibility works; the emptiness is a path/content question instead.",
  );

  verdicts.push(
    p5Same
      ? "getBucket answers identically for the configured and bogus ids (\"Bucket not found\") ⇒ the buckets row is not visible to anon (expected without a SELECT policy on storage.buckets)."
      : "getBucket distinguishes the configured bucket ⇒ storage.buckets is visible to anon.",
  );

  verdicts.push(
    p10.status === p11.status && apiError(p10) === apiError(p11)
      ? "Public-object probe answers identically for the configured and bogus ids ⇒ the public route (super-user + isPublic:true) accepts neither id: the bucket is missing OR private — RLS is not involved on this route; section 2d's credentialed probe separates the two cases."
      : `Public-object probe differs (cfg. ${p10.status} \"${apiError(p10)}\" vs bogus ${p11.status} \"${apiError(p11)}\") ⇒ the bucket id "${config.bucket}" does exist and is public; the emptiness is policy visibility, not a wrong id.`,
  );

  verdicts.push(
    bucketView.count === 0
      ? "Bucket enumeration returns 0 buckets to our key ⇒ anon has no readable rows in storage.buckets (no matching SELECT policy)."
      : bucketView.count == null
        ? "Bucket enumeration did not return a usable array — no conclusion about storage.buckets visibility."
        : `Bucket enumeration returns ${bucketView.count} bucket(s); configured bucket ${bucketView.configuredSeen ? "is" : "is NOT"} among them.`,
  );

  console.log("  Verdicts:");
  for (const verdict of verdicts) console.log(`    · ${verdict}`);

  // Return P3-vs-P4 equality: true when the anon role cannot distinguish the
  // real bucket id from one that cannot exist (i.e. it sees no objects rows).
  return p3Same;
}

/**
 * 2d) Listing and image-loading are independent failure domains: a bucket may
 * deny anonymous listing while public downloads work, or vice versa. These
 * read-only probes test each axis separately against the configured bucket AND
 * a bogus control id. Only the public key is used; no credential or signed
 * URL is ever printed.
 */
async function imageAccessProbes(config, { listCannotDistinguish = false } = {}) {
  console.log("\n2d) Listing vs image-loading separation (independent, read-only)");

  const key = readAnonKey();
  const PROBE_FILE = "__gallery_probe__.jpg";
  // Probe input only (folder name from the task report). It gates nothing: no
  // check passes or fails because of this string.
  const eventPrefix = process.env.VERIFY_EVENT_PREFIX || "Delhi Government Workshop";

  const call = async (label, url, { method = "GET", body } = {}) => {
    try {
      const response = await fetch(url, {
        method,
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000),
      });
      const text = await response.text();
      let payload = null;
      try {
        payload = JSON.parse(text);
      } catch {
        /* not JSON */
      }
      const summary = Array.isArray(payload)
        ? `HTTP ${response.status} — array of ${payload.length}`
        : response.ok && payload && typeof payload === "object"
          ? `HTTP ${response.status} — object keys: ${Object.keys(payload).slice(0, 6).join(", ")}`
          : `HTTP ${response.status} — ${safeName((payload && (payload.message || payload.error)) || text.slice(0, 160))}`;
      console.log(`  ${label}: ${summary}`);
      return { status: response.status, payload, text, response };
    } catch (error) {
      console.log(`  ${label}: network error — ${error.message}`);
      return { status: 0, payload: null, text: "", response: null };
    }
  };

  // Never fall back to raw response text here: a successful sign response is
  // an array whose entries contain signedURLs. Only message/error fields print.
  const msg = (r) => {
    if (!r) return "no response";
    if (Array.isArray(r.payload)) {
      const entry = r.payload[0] || {};
      return safeName(
        entry.message || entry.error || `(array of ${r.payload.length}, no error field)`,
      );
    }
    if (r.payload && typeof r.payload === "object") {
      return safeName(r.payload.message || r.payload.error || "(object without message)");
    }
    return safeName(r.text.slice(0, 120));
  };

  // L1 — event-folder listing: byte-for-byte the request the service sends.
  console.log(
    `\n  L1) Event-folder listing (service-exact request, prefix ${JSON.stringify(eventPrefix)})`,
  );
  const l1 = await call(
    "POST /object/list/<cfg>   ",
    `${config.supabaseUrl}/storage/v1/object/list/${encodeURIComponent(config.bucket)}`,
    {
      method: "POST",
      body: { prefix: eventPrefix, limit: 100, offset: 0, sortBy: { column: "name", order: "asc" } },
    },
  );

  // I1/I2 — public image URL. This route runs as super user with an
  // isPublic=true filter, so "Bucket not found" means: id missing OR bucket
  // private — it is NOT an RLS artifact.
  console.log("\n  I1) Direct image access, public URL (super-user + public=true filter)");
  const i1 = await call(
    "GET /object/public/<cfg>  ",
    `${config.supabaseUrl}/storage/v1/object/public/${encodeURIComponent(config.bucket)}/${PROBE_FILE}`,
  );
  console.log("  I2) Control: same URL, bucket id that cannot exist");
  const i2 = await call(
    "GET /object/public/<bogus>",
    `${config.supabaseUrl}/storage/v1/object/public/__bogus_bucket_probe__/${PROBE_FILE}`,
  );
  if (i1.response) {
    const acao = i1.response.headers.get("access-control-allow-origin");
    console.log(
      `         CORS: access-control-allow-origin: ${acao === null ? "(absent)" : JSON.stringify(acao)}`,
    );
  }

  // I3/I4 — credentialed direct URL: the bucket lookup here does NOT filter on
  // public, so "Object not found" proves the bucket id exists.
  console.log("\n  I3) Direct image access, credentialed URL (RLS-free bucket lookup)");
  const i3 = await call(
    "GET /object/<cfg>         ",
    `${config.supabaseUrl}/storage/v1/object/${encodeURIComponent(config.bucket)}/${PROBE_FILE}`,
  );
  console.log("  I4) Control: same, bogus bucket id");
  const i4 = await call(
    "GET /object/<bogus>       ",
    `${config.supabaseUrl}/storage/v1/object/__bogus_bucket_probe__/${PROBE_FILE}`,
  );

  // T1/T2 — the exact transform endpoint the thumbnail builder uses.
  console.log("\n  T1) Image transform endpoint (thumbnail path used by the Gallery)");
  const t1 = await call(
    "GET /render/image/public  ",
    `${config.supabaseUrl}/storage/v1/render/image/public/${encodeURIComponent(config.bucket)}/${PROBE_FILE}?width=16`,
  );
  const t2 = await call(
    "control (bogus bucket)    ",
    `${config.supabaseUrl}/storage/v1/render/image/public/__bogus_bucket_probe__/${PROBE_FILE}?width=16`,
  );

  // S1/S2 — signed URL behaviour (the app's private-bucket fallback).
  console.log("\n  S1) Signed URL behaviour (runs as the caller — needs the SELECT policy)");
  const s1 = await call(
    "POST /object/sign/<cfg>   ",
    `${config.supabaseUrl}/storage/v1/object/sign/${encodeURIComponent(config.bucket)}`,
    { method: "POST", body: { expiresIn: 60, paths: [PROBE_FILE] } },
  );
  const s2 = await call(
    "control (bogus bucket)    ",
    `${config.supabaseUrl}/storage/v1/object/sign/__bogus_bucket_probe__`,
    { method: "POST", body: { expiresIn: 60, paths: [PROBE_FILE] } },
  );

  console.log("\n  Verdicts (computed from the responses above):");
  const verdict = (line) => console.log(`    · ${line}`);

  if (l1.status === 200 && Array.isArray(l1.payload)) {
    verdict(
      l1.payload.length === 0
        ? `Event-folder listing also returns 0 entries ⇒ the failure is not folder-name- or space-encoding-specific: the anon role sees no rows in storage.objects at this prefix either.`
        : `Event-folder listing returned ${l1.payload.length} entr(ies) ⇒ folder-level listing works for this prefix.`,
    );
  } else {
    verdict(`Event-folder listing failed outright (HTTP ${l1.status}: ${msg(l1)}) — see L1 above.`);
  }

  const pubMissing = /bucket not found/i.test(msg(i1));
  const directObjMissing = /object not found|no such key/i.test(msg(i3));
  if (!pubMissing) {
    verdict(
      `Public image URL answers "${msg(i1)}" (control: "${msg(i2)}") ⇒ bucket "${config.bucket}" exists and is PUBLIC: images and transforms need no policy, and the empty listing is purely a missing SELECT policy.`,
    );
  } else if (directObjMissing) {
    verdict(
      `Public image URL says "Bucket not found" (super-user + isPublic:true ⇒ private or missing id) while the credentialed URL says "${msg(i3)}" ⇒ bucket "${config.bucket}" EXISTS and is PRIVATE. Public/transform URLs cannot serve it; the Gallery loads images through signed URLs, which start working once the SELECT policy exists.`,
    );
  } else {
    verdict(
      `Public image URL says "Bucket not found" and the credentialed URL answers "${msg(i3)}" (control: "${msg(i4)}") ⇒ bucket id "${config.bucket}" cannot be confirmed from the anon key: either the id differs from the dashboard bucket (Storage → bucket → Settings shows the id) or this key is not treated as an authenticated request. The listing emptiness is unaffected: it is the missing SELECT policy either way.`,
    );
  }

  verdict(
    t1.status === t2.status && msg(t1) === msg(t2)
      ? `Transform endpoint answers identically for configured and bogus ids ⇒ thumbnails are gated by the same public-bucket requirement; while the bucket is private the Gallery falls back to full-size/signed images.`
      : `Transform endpoint distinguishes the configured bucket (cfg HTTP ${t1.status} "${msg(t1)}" vs bogus HTTP ${t2.status} "${msg(t2)}") ⇒ transforms are reachable for this bucket id.`,
  );

  verdict(
    `Signed URL: HTTP ${s1.status} — ${msg(s1)} (control: HTTP ${s2.status}: "${msg(s2)}"). Signing runs as the caller and this probe file does not exist, so it cannot succeed today either way; after the policy is applied the real test is a genuine object — section 3's cover probe runs exactly that chain.`,
  );

  // Evidence the summary/classification block needs, computed from the actual
  // responses above. No URL or credential is returned — only classifications.
  const t1IdenticalToControl = t1.status === t2.status && msg(t1) === msg(t2);
  return {
    // True when a bogus bucket id answers exactly like the real one ⇒ the anon
    // role sees no storage.objects rows at all (missing SELECT policy).
    listCannotDistinguish,
    // True when the public-object route says "Bucket not found" for a real id
    // that the credentialed route can tell apart ⇒ the bucket is private.
    bucketPrivate: pubMissingFromResult(i1) && !pubMissingFromResult(i3),
    // Transforms are only reachable when the public render route serves the
    // configured bucket (i.e. it is public). Private ⇒ not publicly reachable.
    transformsPublic: !pubMissingFromResult(t1),
    transformsIdenticalToControl: t1IdenticalToControl,
    credentialedDistinct: msg(i3) !== msg(i4) || i3.status !== i4.status,
  };
}

/** True when a Storage public/credentialed probe answered "Bucket not found",
 *  meaning the bucket id is not publicly servable (private, or wrong id). */
function pubMissingFromResult(result) {
  const text =
    (result && result.payload && (result.payload.message || result.payload.error)) ||
    (result && result.text) ||
    "";
  return /bucket not found/i.test(String(text));
}

function containsDoubleEncoding(pathOrUrl) {
  return pathOrUrl.includes("%2520") || pathOrUrl.includes("%252F");
}

/**
 * Section 6 — the two categories the earlier sections cannot prove on their own:
 * does a real, existing object actually produce a signed URL (6), and does that
 * signed URL serve real image bytes (7/8)? Signed URLs embed a bearer token in
 * the query string, so every URL printed here is redacted to path + token
 * placeholder. If no real object is discoverable, image delivery is reported as
 * UNVERIFIED — never as a pass.
 */
async function signedUrlDeliveryProbes(config, events) {
  console.log("\n6) Signed URL generation and image delivery (real objects)");

  // Find a real object to sign: first event's cover, else its first image.
  let target = null;
  for (const event of events) {
    try {
      const media = await getEventMedia(event.path);
      if (media.images.length > 0) {
        target = { event, path: media.images[0].path };
        break;
      }
    } catch (error) {
      console.log(`  (could not read media for "${event.name}": ${error.message})`);
    }
  }

  if (!target) {
    console.log(
      "  [UNVERIFIED] No real Storage object is discoverable, so signed-URL",
      "generation and image delivery CANNOT be verified right now. This is not a",
      "pass and not a failure of the signing code — the anon role currently sees",
      "no objects (see section 2). Apply the SELECT policy, then re-run.",
    );
    check("Signed URL generated for a real object", false, "unverified — no discoverable object");
    check("Signed URL serves real image bytes", false, "unverified — no discoverable object");
    return { signed: "unverified", delivered: "unverified" };
  }

  const objectPath = target.path;
  const redacted = objectPath.split("/").map((seg) => safeName(seg)).join("/");
  console.log(`  Signing real object: ${JSON.stringify(redacted)} (from "${safeName(target.event.name)}")`);

  // 6 — signed URL generation via the exact service call the pages use.
  let signedUrl;
  try {
    signedUrl = await getSignedUrl(objectPath, { force: true });
  } catch (error) {
    signedUrl = null;
    console.log(`  Sign call threw: ${error.message}`);
  }

  if (!signedUrl) {
    console.log(
      `  [6] No signed URL returned. For a real, existing object this means anon`,
      `      cannot SELECT it — the SELECT policy is missing/not matching anon.`,
    );
    check("Signed URL generated for a real object", false, "signing denied for a real object");
    check("Signed URL serves real image bytes", false, "no signed URL to retrieve");
    return { signed: "denied", delivered: "unverified" };
  }

  const isSigned = signedUrl.includes("token=") || signedUrl.includes("/object/sign/");
  check(
    "Signed URL generated for a real object",
    isSigned,
    `shape OK (${describeUrlShape(signedUrl)}), token redacted`,
  );
  console.log(`  Signed URL (redacted): ${redactUrl(signedUrl)}`);

  // 7/8 — retrieve the signed URL exactly like an <img> tag would (no auth
  // headers: the token in the query string is the whole credential). A 401/403
  // here means the signature is expired/invalid (category 8), a 200 with an
  // image content-type is genuine delivery (category 7).
  const result = await retrieveImage(signedUrl, { sendAuthHeaders: false });
  console.log(`  Retrieval status: HTTP ${result.status}, content-type: ${result.contentType || "(none)"}`);

  if (result.retrieved) {
    console.log(`  [7] Genuine image delivery — the browser would render this.`);
    check("Signed URL serves real image bytes", true, `HTTP ${result.status}, ${result.contentType}`);
    return { signed: isSigned ? "ok" : "nonstandard", delivered: "ok" };
  }

  if (result.status === 401 || result.status === 403) {
    console.log(
      `      [8] HTTP ${result.status} ⇒ signature expired or not authorized (not a network error).`,
    );
    check("Signed URL serves real image bytes", false, `HTTP ${result.status} — expired/unauthorized signature`);
    return { signed: isSigned ? "ok" : "nonstandard", delivered: "expired-or-unauthorized" };
  }

  if (result.status === 404) {
    console.log(`      HTTP 404 ⇒ the signed path does not resolve to an object.`);
    check("Signed URL serves real image bytes", false, "HTTP 404 — object did not resolve");
    return { signed: isSigned ? "ok" : "nonstandard", delivered: "not-found" };
  }

  check("Signed URL serves real image bytes", false, `HTTP ${result.status}`);
  return { signed: isSigned ? "ok" : "nonstandard", delivered: `http-${result.status}` };
}

/** GET/HEAD a URL; with sendAuthHeaders:false it is retrieved exactly like a
 *  browser <img> (the signed token is the only credential). Classifies a real
 *  image (2xx + image content-type) separately from a 200 that is not an image. */
async function retrieveImage(url, { sendAuthHeaders }) {
  const key = readAnonKey();
  const headers =
    sendAuthHeaders && key ? { apikey: key, Authorization: `Bearer ${key}` } : {};
  const request = (method) =>
    fetch(url, { method, headers, signal: AbortSignal.timeout(30000) });

  try {
    let response = await request("HEAD");
    if (response.status === 405 || response.status === 501) {
      // Some storage frontends reject HEAD; fall back to a streaming GET.
      response = await request("GET");
      await response.body?.cancel().catch(() => {});
    }
    const contentType = response.headers.get("content-type") || "";
    const retrieved =
      (response.status === 200 || response.status === 206) && looksLikeImage(contentType);
    return { status: response.status, contentType, retrieved };
  } catch (error) {
    return { status: 0, contentType: "", retrieved: false, error: error.message };
  }
}

/** One-line shape of a URL with the token (a credential) redacted. */
function describeUrlShape(url) {
  return redactUrl(url);
}

/** Redact query params/tokens so a signed URL can be logged safely. */
function redactUrl(url) {
  const withoutQuery = String(url).split("?")[0];
  const hasToken = String(url).includes("?");
  return `${withoutQuery}?<token redacted>${hasToken ? "" : ""}`;
}

async function main() {
  console.log("\nGEOSPATIALS gallery — Supabase Storage verification\n");

  const config = getStorageConfig();

  if (!isConfigured()) {
    console.error(
      [
        "Storage is not configured.",
        `  Supabase URL : ${config.supabaseUrl || "(unset)"}`,
        `  Bucket       : ${config.bucket || "(unset)"}`,
        `  Anon key     : ${config.hasKey ? "present" : "MISSING"}`,
        "",
        "Set VITE_SUPABASE_ANON_KEY (and VITE_SUPABASE_URL if needed) in",
        "frontend/.env.local or the environment, then re-run:",
        "  npm run verify:storage",
      ].join("\n"),
    );
    process.exit(2);
  }

  console.log(`  Project : ${config.supabaseUrl}`);
  console.log(`  Bucket  : ${config.bucket}`);
  console.log(`  Key     : ${config.hasKey ? "present (public anon/publishable key only)" : "missing"}\n`);

  // ---------------------------------------------------------------- config
  console.log("1) Configuration");
  check(
    "Only a public anon/publishable key is used from the browser bundle",
    config.hasKey && !String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").length,
    "no service-role/privileged key is read anywhere",
  );

  // ---------------------------------------------------------- event folders
  console.log("\n2) Event folder discovery");

  // Raw request first: it tells us whether an empty result comes from the API
  // (permissions/bucket/path) or from the service's parsing/discovery logic.
  const raw = await diagnoseRootListing(config);
  await diagnoseBucket(config);
  const bucketView = await diagnoseBucketList(config);
  // differentialProbes returns whether a bogus bucket id answered exactly like
  // the real one; imageAccessProbes uses that to distinguish "RLS-filtered
  // empty listing" (category 2) from "listing works, no folders" (category 3).
  const p3Same = await differentialProbes(config, bucketView);
  const access = await imageAccessProbes(config, { listCannotDistinguish: p3Same });

  if (raw && raw.total === 0) {
    // The API answered 200 with a genuinely empty array. Probe once more with a
    // minimal body to rule out an interaction with limit/offset/sortBy.
    console.log("\n  Follow-up probe: same endpoint, minimal body {\"prefix\":\"\"} only");
    try {
      const key = readAnonKey();
      const response = await fetch(
        `${config.supabaseUrl}/storage/v1/object/list/${encodeURIComponent(config.bucket)}`,
        {
          method: "POST",
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ prefix: "" }),
          signal: AbortSignal.timeout(15000),
        },
      );
      const text = await response.text();
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        /* not JSON */
      }
      console.log(`  Follow-up   : HTTP ${response.status} — ${Array.isArray(parsed) ? `${parsed.length} entry(ies)` : safeName(text.slice(0, 200))}`);
      if (Array.isArray(parsed)) {
        for (const entry of parsed.slice(0, 20)) {
          const isFolder = entry && (entry.id === null || entry.id === undefined);
          console.log(`    · ${JSON.stringify(safeName(entry?.name))} → ${isFolder ? "FOLDER" : "file"}`);
        }
      }
    } catch (error) {
      console.log(`  Follow-up   : network error — ${error.message}`);
    }
  }

  let events = [];
  try {
    events = await listEventFolders();
  } catch (error) {
    check("Root listing succeeded", false, error.message);
    console.error(
      [
        "",
        "The Gallery would show the same error on /gallery.",
        "Common causes:",
        "  · the key is not a valid anon/publishable key of this project",
        "  · the bucket id is wrong (VITE_SUPABASE_STORAGE_BUCKET)",
        "  · the bucket's storage policies do not allow public reads for the anon key",
        "",
        `Details: ${error.stack || error.message}`,
      ].join("\n"),
    );
    process.exit(1);
  }

  check(
    "Root listing succeeded",
    true,
    `${events.length} event folder(s) discovered by the service`,
  );

  // Raw-vs-service comparison: does the API actually return entries, and does
  // the service classify/discover them the same way?
  if (raw) {
    check(
      "Raw root listing returned at least one entry",
      raw.total > 0,
      `${raw.total} entr${raw.total === 1 ? "y" : "ies"} at prefix ""`,
    );
    check(
      "At least one entry was classified as a folder (id null/absent)",
      raw.folders.length > 0,
      `${raw.folders.length} folder(s), ${raw.files.length} file(s)`,
    );

    const eventNames = new Set(events.map((event) => event.name));
    const missing = raw.folderNames.filter((name) => !eventNames.has(name));
    check(
      "Service discovered every raw folder not on the denylist",
      missing.length === 0,
      missing.length
        ? `suppressed: ${missing.map((name) => JSON.stringify(safeName(name))).join(", ")} (expected only for denylisted names such as "docs")`
        : `${eventNames.size} folder(s) surfaced as event cards`,
    );
    if (events.length > 0) {
      const invented = events.filter((event) => !raw.folderNames.includes(event.name));
      check(
        "Service never invents folders absent from the API",
        invented.length === 0,
        invented.length ? invented.map((event) => safeName(event.name)).join(", ") : "all events trace to raw entries",
      );
    }
  }

  for (const event of events) {
    console.log(`       · ${event.name}  →  /gallery/${event.slug}`);
    check(
      `Path encoding for "${event.name}" is single-encoded`,
      !containsDoubleEncoding(event.path) &&
        (event.path.includes(" ") ||
          encodeStoragePath(event.path) === event.path.split("/").map(encodeURIComponent).join("/")),
      `storage path "${event.path}" → "${encodeStoragePath(event.path)}"`,
    );
    check(
      `Slug for "${event.name}" is URL-safe`,
      /^[a-z0-9][a-z0-9-]*$/.test(event.slug),
      event.slug,
    );
  }

  const slugs = events.map((event) => event.slug);
  check("Slugs are unique", new Set(slugs).size === slugs.length);
  check(
    "The `docs` plumbing folder is not offered as an event",
    !events.some((event) => event.name.toLowerCase() === "docs"),
    events.some((event) => event.name.toLowerCase() === "docs")
      ? "it appeared — extend NON_EVENT_FOLDERS in supabaseStorage.js after confirming it is not an event"
      : "hidden by the denylist (or genuinely absent)",
  );
  check(
    "No event folder is the bucket itself",
    events.every((event) => event.name.toLowerCase() !== config.bucket.toLowerCase()),
  );

  // --------------------------------------------------------------- per event
  let totalImages = 0;
  let spacesFolder = null;
  let anySpaceFolder = null;
  let nestedFolder = null;

  for (const event of events) {
    console.log(`\n3) Event: ${event.name}`);
    const eventMedia = await getEventMedia(event.path);
    // Prefer a space-named event that actually has an image to exercise the
    // encoding path; fall back to the first space-named event otherwise.
    if (event.name.includes(" ") && !spacesFolder && eventMedia.images.length > 0) {
      spacesFolder = event;
    }
    if (event.name.includes(" ") && !anySpaceFolder) anySpaceFolder = event;

    let summary;
    try {
      summary = await getEventSummary(event.path);
    } catch (error) {
      check(`Traversal for "${event.name}" succeeded`, false, error.message);
      continue;
    }

    const media = eventMedia;
    totalImages += summary.imageCount;

    check(
      `Traversal for "${event.name}" completed`,
      true,
      `${summary.imageCount} image(s), ${summary.documentCount} document(s)` +
        `${summary.truncated ? " (truncated at cap)" : ""}`,
    );

    if (media.subfolders > 0 && !nestedFolder) nestedFolder = event;

    if (summary.cover) {
      check(
        `Cover chosen for "${event.name}" (shallowest, then A→Z)`,
        true,
        summary.cover.path,
      );
      const candidates = await getMediaCandidates(summary.cover.path);
      check(`Cover URL generated for "${event.name}"`, candidates.length > 0);
      if (candidates.length > 0) {
        check(
          `Cover URL is not double-encoded`,
          !containsDoubleEncoding(candidates[0]),
          candidates[0].slice(0, 110) + "…",
        );
        const loaded = await probeLikeBrowser(summary.cover.path, config);
        check(`Cover image resolves for "${event.name}"`, loaded.ok, loaded.detail);
      }
    } else {
      // Distinguish a genuinely empty folder from one that only holds files the
      // browser cannot render (e.g. .HEIC). The latter is a content-format
      // cause, not a listing/permission failure, so report it precisely.
      const nonRenderable = media.others.map((o) => o.name);
      const hasNonRenderable = nonRenderable.length > 0;
      check(
        `Empty folder "${event.name}" is tolerated`,
        true,
        hasNonRenderable
          ? `${nonRenderable.length} non-renderable file(s) present (${nonRenderable
              .slice(0, 3)
              .map((n) => n.split(".").pop())
              .join(", ")}${nonRenderable.length > 3 ? ", …" : ""}) — excluded by the image filter; browsers cannot decode these natively, so the Gallery shows an empty state`
          : "no images — the Gallery shows a placeholder card and an empty state",
      );
    }

    // Sample a few non-cover images, including one from a nested folder if any.
    const sample = media.images.filter((image) => image !== summary.cover).slice(0, 2);
    const nestedImage = media.images.find(
      (image) => image.path.split("/").length > event.path.split("/").length + 1,
    );
    if (nestedImage && !sample.includes(nestedImage)) sample.push(nestedImage);

    for (const image of sample) {
      const loaded = await probeLikeBrowser(image.path, config);
      check(`Image resolves: ${image.path}`, loaded.ok, loaded.detail);
    }
  }

  console.log(`\n4) Space-containing folder handling`);
  if (spacesFolder) {
    const media = await getEventMedia(spacesFolder.path);
    const image = media.images[0];
    if (image) {
      const url = getPublicObjectUrl(image.path);
      check(
        `Space in path encodes exactly once`,
        url.includes("%20") && !url.includes("%2520"),
        url.slice(0, 120) + "…",
      );
      const loaded = await probeLikeBrowser(image.path, config);
      check(`Space-containing URL resolves`, loaded.ok, loaded.detail);
    } else {
      check(`Space-containing folder "${spacesFolder.name}" has an image to test`, false, "no images inside");
    }
  } else if (anySpaceFolder) {
    // Space-named events exist but none currently hold a raster image (e.g. all
    // empty or holding only non-web formats). The encoding rule is still worth
    // asserting, so test it against the raw URL builder without a network hop,
    // and report the retrieval as skipped rather than failed.
    const url = getPublicObjectUrl(`${anySpaceFolder.name}/probe image.jpg`);
    check(
      `Space in path encodes exactly once (synthetic path)`,
      url.includes("%20") && !url.includes("%2520"),
      url.slice(0, 120) + "…",
    );
    console.log(
      `  [SKIP] no space-named folder currently holds a renderable image, so live retrieval of a space path was skipped (encoding still asserted above)`,
    );
  } else {
    console.log("  [SKIP] no folder with spaces in its name was found");
  }

  console.log(`\n5) Nested folders`);
  if (nestedFolder) {
    console.log(`  [SKIP] nested traversal exercised inside "${nestedFolder.name}" above`);
  } else {
    console.log("  [SKIP] no event folder currently contains sub-folders");
  }

  // ------------------------------------- signed URL generation + delivery
  const delivery = await signedUrlDeliveryProbes(config, events);

  // --------------------------------------------------------------- summary
  console.log(`\nSummary`);
  console.log(`  Event folders : ${events.length}`);
  console.log(`  Images found  : ${totalImages}`);
  console.log(`  Signed URL    : ${delivery.signed}`);
  console.log(`  Image delivery: ${delivery.delivered}`);
  console.log(`  Checks run    : ${checks}`);
  console.log(`  Failures      : ${failures.length}`);

  // Which of the nine outcome categories does this run land in? Computed only
  // from real evidence gathered above — never hardcoded, never optimistic.
  console.log(`\nOutcome classification`);
  for (const line of classifyOutcomes({ raw, events, totalImages, access, delivery })) {
    console.log(`  - ${line}`);
  }

  if (failures.length > 0) {
    console.error(`\nFailed checks:\n  - ${failures.join("\n  - ")}\n`);
    process.exit(1);
  }

  console.log("\nAll checks passed.\n");
}

/** Map the run's real evidence to the nine categories the task distinguishes. */
function classifyOutcomes({ raw, events, totalImages, access, delivery }) {
  const lines = [];
  const seenRows = raw && raw.total > 0;

  // 1. Network/auth failure — no usable listing response at all.
  if (!raw) {
    lines.push("1. NETWORK/AUTH failure: the root listing did not return a usable response (see 2a).");
  }

  // 2. RLS-filtered empty listing vs 3. listing OK but no event folders.
  if (raw && raw.total === 0) {
    if (access && access.listCannotDistinguish) {
      lines.push(
        "2. RLS-FILTERED EMPTY LISTING: HTTP 200 [] but a bogus bucket id answers identically ⇒ anon sees no storage.objects rows (missing SELECT policy).",
      );
    } else {
      lines.push(
        "2/3. Empty listing, but the bogus-id control differs ⇒ bucket id/visibility question, not an obvious anon-wide RLS block (see 2c).",
      );
    }
  } else if (seenRows && events.length === 0) {
    lines.push(
      "3. LISTING OK, NO EVENT FOLDERS: entries are visible but none classify as an event (all files or denylisted).",
    );
  }

  // 4. Event-folder discovery.
  if (events.length > 0) {
    lines.push(`4. EVENT FOLDERS DISCOVERED: ${events.length} (root files and "docs" are never cards).`);
  }

  // 5. Image discovery.
  if (totalImages > 0) {
    lines.push(`5. IMAGE DISCOVERY: ${totalImages} image(s) found across the events.`);
  } else if (events.length > 0) {
    lines.push("5. NO IMAGES discovered inside the discovered events (check uploads/traversal).");
  }

  // 6. Signed URL generation.
  if (delivery.signed === "unverified") {
    lines.push("6. Signed-URL generation: UNVERIFIED — no real object was discoverable to sign (not a pass).");
  } else if (delivery.signed === "denied") {
    lines.push("6. Signed-URL generation: DENIED for a real object (anon lacks SELECT on that path).");
  } else {
    lines.push(`6. Signed-URL generation: OK (${delivery.signed}).`);
  }

  // 7/8. Actual retrieval / expired-or-unauthorized.
  if (delivery.delivered === "ok") {
    lines.push("7. IMAGE RETRIEVAL: genuine — the signed URL served real image bytes.");
  } else if (delivery.delivered === "expired-or-unauthorized") {
    lines.push("8. EXPIRED/UNAUTHORIZED signed URL: HTTP 401/403 on retrieval (signature not valid).");
  } else if (delivery.delivered === "unverified") {
    lines.push("7/8. Image delivery: UNVERIFIED — cannot be tested until a real object is signable (not a pass).");
  } else {
    lines.push(`7/8. Image delivery: not proven (retrieval result: ${delivery.delivered}).`);
  }

  // 9. Unsupported transformations.
  if (access) {
    if (access.transformsPublic) {
      lines.push("9. Transformations: PUBLIC render endpoint is reachable for this bucket (it is public).");
    } else {
      lines.push(
        "9. Transformations: NOT usable — public render route cannot serve this (private) bucket; the Gallery uses signed originals and does not rely on public transforms.",
      );
    }
  }

  if (!seenRows && lines.length) {
    lines.push(
      "NOTE: image delivery remains UNVERIFIED (no real objects discoverable) — this run is NOT a passing end-to-end result.",
    );
  }

  return lines;
}

main().catch((error) => {
  console.error(`\nVerification crashed: ${error.stack || error.message}\n`);
  process.exit(1);
});
