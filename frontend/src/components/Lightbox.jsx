import { useCallback, useEffect, useRef, useState } from "react";
import StorageImage from "./StorageImage.jsx";

function Chevron({ direction }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" data-direction={direction}>
      {direction === "prev" ? <path d="M15 5l-7 7 7 7" /> : <path d="M9 5l7 7-7 7" />}
    </svg>
  );
}

function focusableIn(node) {
  if (!node) return [];
  return Array.from(
    node.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
  ).filter((element) => !element.hasAttribute("disabled") && element.offsetParent !== null);
}

/**
 * Full screen image preview: keyboard navigation (Esc / arrows / Home / End),
 * focus trap, background scroll lock, swipe support and previous/next controls.
 */
export default function Lightbox({ images, index, onIndexChange, onClose, title }) {
  const dialogRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const touchStartRef = useRef(null);
  const [loaded, setLoaded] = useState(false);

  const count = images.length;
  const image = images[index];
  const primaryUrl = image && (image.fullUrl || (image.urls && image.urls[image.urls.length - 1]));
  const srcs = primaryUrl ? [primaryUrl] : [];

  const goTo = useCallback(
    (nextIndex) => {
      if (count < 1) return;
      onIndexChange(((nextIndex % count) + count) % count);
    },
    [count, onIndexChange],
  );

  useEffect(() => {
    setLoaded(false);
  }, [index]);

  // Lock background scrolling and keep focus inside the dialog.
  useEffect(() => {
    restoreFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const frame = requestAnimationFrame(() => {
      const closeButton = dialogRef.current && dialogRef.current.querySelector("[data-lightbox-close]");
      if (closeButton) closeButton.focus();
    });

    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      const previous = restoreFocusRef.current;
      if (previous && typeof previous.focus === "function" && document.contains(previous)) {
        previous.focus();
      }
    };
  }, []);

  // Keyboard controls + focus trap.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goTo(index + 1);
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goTo(index - 1);
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        onIndexChange(0);
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        onIndexChange(count - 1);
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusableIn(dialogRef.current);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = dialogRef.current.contains(active);

      if (event.shiftKey && (!inside || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [count, index, goTo, onIndexChange, onClose]);

  // Warm up the neighbours so previous/next feels instant.
  useEffect(() => {
    if (count < 2) return;
    [index - 1, index + 1].forEach((neighbour) => {
      const neighbourImage = images[((neighbour % count) + count) % count];
      const url = neighbourImage && (neighbourImage.fullUrl || neighbourImage.urls);
      const first = Array.isArray(url) ? url[url.length - 1] : url;
      if (first) {
        const preloader = new Image();
        preloader.src = first;
      }
    });
  }, [index, count, images]);

  if (!image) return null;

  const handleTouchStart = (event) => {
    touchStartRef.current = event.changedTouches[0].clientX;
  };

  const handleTouchEnd = (event) => {
    if (touchStartRef.current === null || count < 2) return;
    const delta = event.changedTouches[0].clientX - touchStartRef.current;
    touchStartRef.current = null;
    if (Math.abs(delta) < 50) return;
    goTo(delta < 0 ? index + 1 : index - 1);
  };

  const dialogLabel = count > 1
    ? `${title} — image ${index + 1} of ${count}`
    : `${title} — image preview`;

  return (
    <div
      className="g-lb"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="g-lb-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={dialogLabel}
        tabIndex={-1}
        ref={dialogRef}
      >
        <header className="g-lb-bar">
          <p className="g-lb-title">{title}</p>
          {count > 1 && (
            <p className="g-lb-count" aria-live="polite">
              {index + 1} / {count}
            </p>
          )}
          <button
            type="button"
            className="g-lb-close"
            data-lightbox-close
            onClick={onClose}
            aria-label="Close image preview"
          >
            ✕
          </button>
        </header>

        <div
          className="g-lb-stage"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {count > 1 && (
            <button
              type="button"
              className="g-lb-nav prev"
              onClick={() => goTo(index - 1)}
              aria-label="Previous image"
            >
              <Chevron direction="prev" />
            </button>
          )}

          <figure className="g-lb-figure">
            {!loaded && <span className="g-lb-loading" aria-hidden="true" />}
            <StorageImage
              key={image.path || index}
              srcs={srcs}
              path={image.path}
              alt={image.name ? image.name.replace(/\.[^.]+$/, "") : "Gallery image"}
              fallbackLabel="This image could not be loaded"
              className="g-lb-img"
              onLoad={() => setLoaded(true)}
            />
            {image.name && <figcaption>{image.name}</figcaption>}
          </figure>

          {count > 1 && (
            <button
              type="button"
              className="g-lb-nav next"
              onClick={() => goTo(index + 1)}
              aria-label="Next image"
            >
              <Chevron direction="next" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
