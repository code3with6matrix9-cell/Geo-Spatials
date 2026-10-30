/**
 * Neutral or error message block used by the Gallery routes for loading
 * failures, empty folders and missing configuration.
 */
export default function StateBlock({
  title,
  message,
  tone = "neutral",
  actionLabel,
  onAction,
  secondaryLabel,
  secondaryHref,
}) {
  return (
    <div
      className={`g-state glass${tone === "error" ? " error" : ""}`}
      role={tone === "error" ? "alert" : undefined}
    >
      <span className="g-state-icon" aria-hidden="true">
        {tone === "error" ? "!" : "◎"}
      </span>
      <h3>{title}</h3>
      <p>{message}</p>
      <div className="g-state-actions">
        {actionLabel && onAction && (
          <button type="button" className="btn sm" onClick={onAction}>
            {actionLabel}
          </button>
        )}
        {secondaryLabel && secondaryHref && (
          <a className="btn o sm" href={secondaryHref}>
            {secondaryLabel}
          </a>
        )}
      </div>
    </div>
  );
}
