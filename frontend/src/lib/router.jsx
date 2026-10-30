/**
 * Minimal History API router.
 *
 * The project ships without a routing library, so this module adds the two
 * things the Gallery needs: a pathname to render on, and client-side
 * navigation for same-origin links (including the legacy navigation markup).
 * Hash links (`#about`), external links and mail/telephone links are left to
 * the browser so the existing one-page behaviour is untouched.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const RouterContext = createContext(null);

function readPathname() {
  return window.location.pathname || "/";
}

function isModifiedEvent(event) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

export function RouterProvider({ children }) {
  const [pathname, setPathname] = useState(readPathname);
  const [hash, setHash] = useState(() => window.location.hash);
  const pathnameRef = useRef(pathname);
  const homeScrollRef = useRef(0);

  pathnameRef.current = pathname;

  const rememberScroll = useCallback(() => {
    if (pathnameRef.current === "/") homeScrollRef.current = window.scrollY;
  }, []);

  useEffect(() => {
    const onPopState = () => {
      rememberScroll();
      setPathname(readPathname());
      setHash(window.location.hash);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [rememberScroll]);

  const navigate = useCallback(
    (to, { replace = false } = {}) => {
      let url;
      try {
        url = new URL(to, window.location.origin);
      } catch {
        window.location.href = to;
        return;
      }

      if (url.origin !== window.location.origin) {
        window.location.href = to;
        return;
      }

      const next = `${url.pathname}${url.search}${url.hash}`;
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (next === current) return;

      rememberScroll();

      if (replace) window.history.replaceState({}, "", next);
      else window.history.pushState({}, "", next);

      setPathname(url.pathname);
      setHash(url.hash);
    },
    [rememberScroll],
  );

  // Intercept same-origin links so the Gallery never triggers a full reload.
  useEffect(() => {
    const onClick = (event) => {
      if (event.defaultPrevented || isModifiedEvent(event)) return;

      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download") || anchor.dataset.native === "true") return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (/^(mailto:|tel:|javascript:)/i.test(href)) return;
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return; // absolute URL to another origin
      if (href.startsWith("//")) return;
      if (!href.startsWith("/")) return;

      event.preventDefault();
      navigate(href);
    };

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [navigate]);

  const value = useMemo(
    () => ({ pathname, hash, navigate, homeScroll: homeScrollRef }),
    [pathname, hash, navigate],
  );

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRoute() {
  const context = useContext(RouterContext);
  if (!context) throw new Error("useRoute must be used inside <RouterProvider>");
  return context;
}

/** Match a pathname against the routes this site serves. */
export function matchRoute(pathname) {
  const path = pathname.replace(/\/+$/, "") || "/";

  if (path === "/") return { name: "home" };
  if (path === "/gallery") return { name: "gallery" };

  const eventMatch = path.match(/^\/gallery\/([^/]+)$/);
  if (eventMatch) {
    try {
      return { name: "event", slug: decodeURIComponent(eventMatch[1]) };
    } catch {
      return { name: "event", slug: eventMatch[1] };
    }
  }

  return { name: "not-found" };
}
