import { useEffect, useState } from "react";

/**
 * The legacy scripts paint the brand wordmark into `[data-logo]` elements a
 * moment after mount. Gallery navigation and footer mirror whatever they
 * produced so every page shows the identical logo, and fall back to a styled
 * wordmark while it is still unknown (or if the legacy script failed).
 */
export function useSiteLogo() {
  const [logo, setLogo] = useState("");

  useEffect(() => {
    let cancelled = false;

    const sync = () => {
      if (cancelled) return false;
      const source = document.querySelector("#legacy-home [data-logo][src]");
      const value = source ? source.getAttribute("src") : "";
      if (value) {
        setLogo(value);
        return true;
      }
      return false;
    };

    if (sync()) return undefined;
    const timers = [60, 250, 700, 1600].map((delay) => window.setTimeout(sync, delay));
    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  return logo;
}
