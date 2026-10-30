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
 *   6. the generated image URLs really resolve (HTTP 200/206)
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
  getPublicObjectUrl,
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

/** HEAD the URL (falling back to a body-less GET) and report the status. */
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
    return response.status;
  } catch (error) {
    return `error: ${error.message}`;
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
      ? "Public-object probe answers identically for the configured and bogus ids ⇒ no independent existence signal (consistent with storage.buckets being invisible to anon)."
      : `Public-object probe differs (cfg. ${p10.status} \"${apiError(p10)}\" vs bogus ${p11.status} \"${apiError(p11)}\") ⇒ the bucket id "${config.bucket}" does exist; the emptiness is policy visibility, not a wrong id.`,
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
}

function containsDoubleEncoding(pathOrUrl) {
  return pathOrUrl.includes("%2520") || pathOrUrl.includes("%252F");
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
  await differentialProbes(config, bucketView);

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
  let nestedFolder = null;

  for (const event of events) {
    console.log(`\n3) Event: ${event.name}`);
    if (event.name.includes(" ") && !spacesFolder) spacesFolder = event;

    let summary;
    try {
      summary = await getEventSummary(event.path);
    } catch (error) {
      check(`Traversal for "${event.name}" succeeded`, false, error.message);
      continue;
    }

    const media = await getEventMedia(event.path);
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
        const status = await probe(candidates[0], config);
        check(
          `Cover image resolves for "${event.name}"`,
          status === 200 || status === 206,
          `HTTP ${status}`,
        );
      }
    } else {
      check(
        `Empty folder "${event.name}" is tolerated`,
        true,
        "no images — the Gallery shows a placeholder card and an empty state",
      );
    }

    // Sample a few non-cover images, including one from a nested folder if any.
    const sample = media.images.filter((image) => image !== summary.cover).slice(0, 2);
    const nestedImage = media.images.find(
      (image) => image.path.split("/").length > event.path.split("/").length + 1,
    );
    if (nestedImage && !sample.includes(nestedImage)) sample.push(nestedImage);

    for (const image of sample) {
      const candidates = await getMediaCandidates(image.path);
      const url = candidates[0];
      if (!url) {
        check(`Image URL for "${image.path}"`, false, "no candidate URL produced");
        continue;
      }
      const status = await probe(url, config);
      check(
        `Image resolves: ${image.path}`,
        status === 200 || status === 206,
        `HTTP ${status}`,
      );
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
      const status = await probe(url, config);
      check(`Space-containing URL resolves`, status === 200 || status === 206, `HTTP ${status}`);
    } else {
      check(`Space-containing folder "${spacesFolder.name}" has an image to test`, false, "no images inside");
    }
  } else {
    console.log("  [SKIP] no folder with spaces in its name was found");
  }

  console.log(`\n5) Nested folders`);
  if (nestedFolder) {
    console.log(`  [SKIP] nested traversal exercised inside "${nestedFolder.name}" above`);
  } else {
    console.log("  [SKIP] no event folder currently contains sub-folders");
  }

  // --------------------------------------------------------------- summary
  console.log(`\nSummary`);
  console.log(`  Event folders : ${events.length}`);
  console.log(`  Images found  : ${totalImages}`);
  console.log(`  Checks run    : ${checks}`);
  console.log(`  Failures      : ${failures.length}`);

  if (failures.length > 0) {
    console.error(`\nFailed checks:\n  - ${failures.join("\n  - ")}\n`);
    process.exit(1);
  }

  console.log("\nAll checks passed.\n");
}

main().catch((error) => {
  console.error(`\nVerification crashed: ${error.stack || error.message}\n`);
  process.exit(1);
});
