import { useState } from "react";
import { getEmergencyCandidate } from "../services/supabaseStorage.js";

/** Branded fallback box used whenever a stored file cannot be rendered. */
export function ImagePlaceholder({ label = "Image unavailable", className, ...rest }) {
  return (
    <div
      className={`g-ph${className ? ` ${className}` : ""}`}
      role="img"
      aria-label={label}
      {...rest}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <circle cx="9" cy="10" r="2" />
        <path d="M4 17l4.5-4.5 3 3L15 11l5 5" />
      </svg>
      <span>{label}</span>
    </div>
  );
}

/**
 * Renders one stored file from an ordered list of candidate URLs: cheap
 * thumbnail first, original second, signed URL last. Falls back to a branded
 * placeholder instead of a broken image.
 *
 * Give it a `key={path}` from the parent so candidate changes remount it.
 */
export default function StorageImage({
  srcs,
  path,
  alt = "",
  fallbackLabel = "Image unavailable",
  className,
  ...imgProps
}) {
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [emergencyUrl, setEmergencyUrl] = useState(null);
  const [broken, setBroken] = useState(false);

  const source = emergencyUrl || (srcs && srcs[candidateIndex]) || null;

  const handleError = () => {
    if (!source) {
      setBroken(true);
      return;
    }
    if (srcs && candidateIndex + 1 < srcs.length) {
      setCandidateIndex(candidateIndex + 1);
      return;
    }
    if (!emergencyUrl && path) {
      getEmergencyCandidate(path)
        .then((url) => {
          if (url && url !== source) setEmergencyUrl(url);
          else setBroken(true);
        })
        .catch(() => setBroken(true));
      return;
    }
    setBroken(true);
  };

  if (broken || !source) {
    return <ImagePlaceholder label={fallbackLabel} className={className} />;
  }

  return (
    <img
      key={source}
      src={source}
      alt={alt}
      onError={handleError}
      decoding="async"
      className={className}
      {...imgProps}
    />
  );
}
