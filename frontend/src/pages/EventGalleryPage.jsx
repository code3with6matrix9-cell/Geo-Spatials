import { useEffect, useMemo, useState } from "react";
import SiteNav from "../components/SiteNav.jsx";
import SiteFooter from "../components/SiteFooter.jsx";
import StorageImage from "../components/StorageImage.jsx";
import Lightbox from "../components/Lightbox.jsx";
import StateBlock from "../components/StateBlock.jsx";
import {
  clearStorageCache,
  getEventBySlug,
  getEventMedia,
  getMediaCandidates,
  isConfigured,
} from "../services/supabaseStorage.js";
import { friendlyStorageMessage } from "../lib/galleryCopy.js";

function titleFromSlug(slug) {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function SkeletonGrid({ count = 8 }) {
  return (
    <div className="g-shots" aria-busy="true" aria-label="Loading images">
      {Array.from({ length: count }).map((_, index) => (
        <div className="g-shot g-skel" key={index} aria-hidden="true">
          <span className="g-sheen" />
        </div>
      ))}
    </div>
  );
}

export default function EventGalleryPage({ slug }) {
  const [reloadKey, setReloadKey] = useState(0);
  const [status, setStatus] = useState(() => (isConfigured() ? "loading" : "unconfigured"));
  const [folder, setFolder] = useState(null);
  const [media, setMedia] = useState(null);
  const [error, setError] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(null);

  const fallbackTitle = useMemo(() => titleFromSlug(slug), [slug]);
  const title = folder ? folder.name : fallbackTitle;

  useEffect(() => {
    if (!isConfigured()) {
      setStatus("unconfigured");
      return undefined;
    }

    let cancelled = false;
    setStatus("loading");
    setFolder(null);
    setMedia(null);
    setError(null);
    setLightboxIndex(null);

    (async () => {
      try {
        const found = await getEventBySlug(slug);
        if (cancelled) return;

        if (!found) {
          setStatus("not-found");
          return;
        }

        setFolder(found);
        setStatus("loading-media");

        const collected = await getEventMedia(found.path);
        const images = await Promise.all(
          collected.images.map(async (image) => {
            const urls = await getMediaCandidates(image.path);
            return { ...image, urls, fullUrl: urls[urls.length - 1] || null };
          }),
        );

        if (cancelled) return;
        setMedia({ ...collected, images });
        setStatus("ready");
      } catch (failure) {
        if (cancelled) return;
        setError(failure);
        setStatus(failure && failure.code === "not-configured" ? "unconfigured" : "error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, reloadKey]);

  useEffect(() => {
    if (status === "ready" || status === "loading-media") {
      document.title = `${title} Gallery | GEOSPATIALS`;
    } else if (status === "not-found") {
      document.title = "Event not found | GEOSPATIALS";
    } else if (status === "error" || status === "unconfigured") {
      document.title = "Gallery unavailable | GEOSPATIALS";
    } else {
      document.title = "Gallery | GEOSPATIALS";
    }
  }, [status, title]);

  const retry = () => {
    // A retry must really retry: drop memoised listings, traversals and any
    // paused signing state so a fixed policy takes effect immediately.
    clearStorageCache();
    setReloadKey((value) => value + 1);
  };
  const images = media ? media.images : [];

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
          <nav className="g-crumb" aria-label="Breadcrumb">
            <a href="/">Home</a>
            <span aria-hidden="true">›</span>
            <a href="/gallery">Gallery</a>
            <span aria-hidden="true">›</span>
            <span aria-current="page">{title}</span>
          </nav>

          <div className="g-event-head">
            <div className="g-event-title">
              <div className="eb">
                <b />
                {status === "ready"
                  ? `${images.length} ${images.length === 1 ? "image" : "images"}`
                  : "Event gallery"}
              </div>
              <h1>{title}</h1>
            </div>
            <a className="btn o sm g-back" href="/gallery">
              <span aria-hidden="true">←</span> Back to Gallery
            </a>
          </div>

          {status === "unconfigured" && (
            <StateBlock
              tone="error"
              title="Gallery storage is not configured"
              message="Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the frontend environment, then reload."
              secondaryLabel="Back to Gallery"
              secondaryHref="/gallery"
            />
          )}

          {(status === "loading" || status === "loading-media") && <SkeletonGrid />}

          {status === "not-found" && (
            <StateBlock
              title="Event not found"
              message={`We could not find an event folder for “${title}”. It may have been renamed or removed.`}
              secondaryLabel="Back to Gallery"
              secondaryHref="/gallery"
            />
          )}

          {status === "error" && (
            <StateBlock
              tone="error"
              title="We could not load this gallery"
              message={friendlyStorageMessage(error)}
              actionLabel="Try again"
              onAction={retry}
              secondaryLabel="Back to Gallery"
              secondaryHref="/gallery"
            />
          )}

          {status === "ready" && images.length === 0 && (
            <StateBlock
              title="No images in this event yet"
              message={
                media && media.documents.length > 0
                  ? `This folder contains ${media.documents.length} document${media.documents.length === 1 ? "" : "s"} (for example PDFs), which are not shown in the photo gallery. Images will appear here once they are uploaded.`
                  : "This folder does not contain any supported images yet. Photos will appear here once they are uploaded to Supabase Storage."
              }
              secondaryLabel="Back to Gallery"
              secondaryHref="/gallery"
            />
          )}

          {status === "ready" && images.length > 0 && (
            <>
              {images.every((image) => !image.urls || image.urls.length === 0) && (
                <p className="g-note" role="status">
                  The photos in this event exist, but Storage access is currently
                  restricted, so they cannot be signed for display. Site
                  administrators: apply the Gallery SELECT policy described in the
                  README, then use Try again.
                </p>
              )}
              <div className="g-shots">
                {images.map((image, index) => (
                  <button
                    type="button"
                    className="g-shot"
                    key={image.path || index}
                    onClick={() => setLightboxIndex(index)}
                    aria-label={`Open image ${index + 1} of ${images.length}${
                      image.name ? `: ${image.name}` : ""
                    }`}
                  >
                    <StorageImage
                      key={image.path || index}
                      srcs={image.urls}
                      path={image.path}
                      alt={`${title} image ${index + 1}`}
                      fallbackLabel="Unavailable"
                      loading={index < 8 ? "eager" : "lazy"}
                      decoding="async"
                      width={800}
                      height={600}
                    />
                  </button>
                ))}
              </div>

              {media && media.documents.length > 0 && (
                <p className="g-note">
                  {media.documents.length} document
                  {media.documents.length === 1 ? "" : "s"} in this folder (PDF and other files)
                  {" "}are not part of the photo gallery.
                </p>
              )}
              {media && media.truncated && (
                <p className="g-note">Showing the first {images.length} images in this folder.</p>
              )}
            </>
          )}
        </div>
      </main>

      {lightboxIndex !== null && images.length > 0 && (
        <Lightbox
          images={images}
          index={Math.min(lightboxIndex, images.length - 1)}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
          title={title}
        />
      )}

      <SiteFooter />
    </>
  );
}
