import { useEffect, useState } from "react";
import SiteNav from "../components/SiteNav.jsx";
import SiteFooter from "../components/SiteFooter.jsx";
import StorageImage, { ImagePlaceholder } from "../components/StorageImage.jsx";
import StateBlock from "../components/StateBlock.jsx";
import {
  clearStorageCache,
  getEventSummary,
  getMediaCandidates,
  isConfigured,
  listEventFolders,
} from "../services/supabaseStorage.js";
import { eventLabel, formatCount, friendlyStorageMessage } from "../lib/galleryCopy.js";

const PAGE_TITLE = "Gallery | GEOSPATIALS";
const SKELETON_CARDS = 6;

function SkeletonCard() {
  return (
    <article className="g-card g-skel glass" aria-hidden="true">
      <div className="g-card-media">
        <span className="g-sheen" />
      </div>
      <div className="g-card-body">
        <span className="g-skel-line wide" />
        <span className="g-skel-line" />
        <span className="g-skel-line short" />
      </div>
    </article>
  );
}

export default function GalleryPage() {
  const [status, setStatus] = useState(() => (isConfigured() ? "loading" : "unconfigured"));
  const [reloadKey, setReloadKey] = useState(0);
  const [folders, setFolders] = useState([]);
  const [error, setError] = useState(null);
  const [summaries, setSummaries] = useState({});

  useEffect(() => {
    document.title = PAGE_TITLE;
  }, []);

  useEffect(() => {
    if (!isConfigured()) {
      setStatus("unconfigured");
      return undefined;
    }

    let cancelled = false;
    setStatus("loading");
    setError(null);
    setFolders([]);
    setSummaries({});

    listEventFolders()
      .then((result) => {
        if (cancelled) return;
        setFolders(result);
        setStatus("ready");
      })
      .catch((failure) => {
        if (cancelled) return;
        setError(failure);
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Cover image + counts, resolved per card and shared with the event pages.
  useEffect(() => {
    if (status !== "ready") return undefined;

    let cancelled = false;
    folders.forEach((folder) => {
      (async () => {
        try {
          const summary = await getEventSummary(folder.path);
          const coverUrls = summary.cover ? await getMediaCandidates(summary.cover.path) : [];
          if (cancelled) return;
          setSummaries((previous) => ({
            ...previous,
            [folder.slug]: { ...summary, coverUrls, failed: false },
          }));
        } catch {
          if (cancelled) return;
          setSummaries((previous) => ({
            ...previous,
            [folder.slug]: {
              failed: true,
              cover: null,
              coverUrls: [],
              imageCount: null,
              documentCount: 0,
              hasImages: false,
              truncated: false,
            },
          }));
        }
      })();
    });

    return () => {
      cancelled = true;
    };
  }, [status, folders]);

  const retry = () => {
    // Drop memoised listings/results first — otherwise "Refresh" would replay
    // a cached empty listing instead of asking Storage again.
    clearStorageCache();
    setReloadKey((value) => value + 1);
  };

  return (
    <>
      <div className="aur" aria-hidden="true">
        <i />
        <i />
        <i />
        <u className="sd a" />
        <u className="sd b" />
        <u className="sd c" />
        <u className="sd d" />
      </div>

      <SiteNav active="gallery" />

      <main className="gpage">
        <div className="wrap">
          <header className="g-head">
            <div className="eb">
              <b />
              GEOSPATIALS
            </div>
            <h1>Gallery</h1>
            <p className="g-sub">Explore our events, workshops, exhibitions, and field activities.</p>
            {status === "ready" && folders.length > 0 && (
              <p className="g-meta">
                {folders.length} event {folders.length === 1 ? "album" : "albums"}
                {Object.values(summaries).some((entry) => entry && entry.failed)
                  ? " · some albums could not be counted"
                  : ""}
              </p>
            )}
          </header>

          {status === "unconfigured" && (
            <StateBlock
              title="Gallery storage is not configured"
              message="Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the frontend environment, then reload."
              tone="error"
            />
          )}

          {status === "loading" && (
            <div className="g-cards" aria-busy="true" aria-label="Loading event folders">
              {Array.from({ length: SKELETON_CARDS }).map((_, index) => (
                <SkeletonCard key={index} />
              ))}
            </div>
          )}

          {status === "error" && (
            <StateBlock
              tone="error"
              title="We could not load the gallery"
              message={friendlyStorageMessage(error)}
              actionLabel="Try again"
              onAction={retry}
            />
          )}

          {status === "ready" && folders.length === 0 && (
            <StateBlock
              title="No event folders yet"
              message="Event albums will appear here as soon as folders are added to the Supabase Storage bucket."
              actionLabel="Refresh"
              onAction={retry}
            />
          )}

          {status === "ready" && folders.length > 0 && (
            <div className="g-cards">
              {folders.map((folder) => {
                const summary = summaries[folder.slug];
                const count = summary && !summary.failed
                  ? formatCount(summary.imageCount, summary.truncated)
                  : null;
                const hasCover = Boolean(summary && summary.cover && summary.coverUrls.length);

                return (
                  <article className="g-card glass" key={folder.slug}>
                    <a
                      href={`/gallery/${encodeURIComponent(folder.slug)}`}
                      className="g-card-link"
                      aria-label={`View gallery for ${folder.name}`}
                    >
                      <div className="g-card-media">
                        {!summary && <span className="g-sheen" aria-hidden="true" />}
                        {hasCover && (
                          <StorageImage
                            key={summary.cover.path}
                            srcs={summary.coverUrls}
                            path={summary.cover.path}
                            alt={`${folder.name} cover image`}
                            fallbackLabel="Preview unavailable"
                            loading="lazy"
                            decoding="async"
                            width={900}
                            height={563}
                          />
                        )}
                        {summary && !hasCover && (
                          <ImagePlaceholder label="No preview available" />
                        )}
                        <span className="g-card-tag">{eventLabel(folder.name)}</span>
                        {count && <span className="g-card-count">{count}</span>}
                      </div>
                      <div className="g-card-body">
                        <h2>{folder.name}</h2>
                        <span className="g-card-cta">
                          View Gallery <span aria-hidden="true">→</span>
                        </span>
                      </div>
                    </a>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
