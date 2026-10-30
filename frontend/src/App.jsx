import { useEffect, useRef } from "react";
import legacyMarkup from "./legacyMarkup.html?raw";
import registrationModalMarkup from "./registrationModal.html?raw";
import { RouterProvider, matchRoute, useRoute } from "./lib/router.jsx";
import GalleryPage from "./pages/GalleryPage.jsx";
import EventGalleryPage from "./pages/EventGalleryPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import "./style.css";
import "./institutionPackage.css";
import "./partnerSection.css";
import "./registrationSection.css";
import "./gallery.css";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  "https://geo-spatials-production-2026.onrender.com"
).replace(/\/$/, "");

/** Captured before any route changes the document title. */
const HOME_TITLE = document.title;

function scrollToHash(hash) {
  let target = null;
  try {
    target = hash ? document.querySelector(hash) : null;
  } catch {
    target = null; // malformed selector, treat as a plain scroll to top
  }
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function Site() {
  const { pathname, hash, homeScroll } = useRoute();
  const route = matchRoute(pathname);
  const contentRef = useRef(null);

  // Legacy behaviour is preserved by keeping the classic markup mounted at all
  // times and only hiding it on Gallery routes, so `site.js` and
  // `registration.js` initialize exactly once and the registration modal stays
  // usable from every page.
  useEffect(() => {
    window.GEOSPATIALS_API_BASE = API_BASE_URL.replace(/\/$/, "");

    let siteScript;
    let registrationScript;
    let cancelled = false;

    const loadClassicScript = (src) =>
      new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.async = false;
        script.onload = () => resolve(script);
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.body.appendChild(script);
      });

    const initialize = async () => {
      try {
        siteScript = await loadClassicScript("/legacy/site.js");
        if (cancelled) return;
        registrationScript = await loadClassicScript("/legacy/registration.js");
      } catch (error) {
        console.error("GEOSPATIALS frontend initialization failed:", error);
      }
    };

    initialize();

    return () => {
      cancelled = true;
      siteScript?.remove();
      registrationScript?.remove();
    };
  }, []);

  // Route changes: restore the visitor's position when returning home, scroll
  // to linked sections, otherwise start at the top.
  useEffect(() => {
    if (route.name === "home") {
      if (hash) {
        const timer = window.setTimeout(() => scrollToHash(hash), 90);
        return () => window.clearTimeout(timer);
      }
      const saved = homeScroll.current || 0;
      const frame = requestAnimationFrame(() => {
        window.scrollTo({ top: saved, behavior: "instant" });
      });
      return () => cancelAnimationFrame(frame);
    }

    const frame = requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname, hash]);

  // Only the home page owns the document title here; Gallery routes set their
  // own titles inside their components.
  useEffect(() => {
    if (route.name === "home") document.title = HOME_TITLE;
  }, [route.name]);

  return (
    <>
      <div
        id="legacy-home"
        ref={contentRef}
        style={route.name === "home" ? undefined : { display: "none" }}
        dangerouslySetInnerHTML={{ __html: legacyMarkup }}
      />

      {/* Always mounted so Register works from every route. */}
      <div
        id="legacy-registration-modal"
        dangerouslySetInnerHTML={{ __html: registrationModalMarkup }}
      />

      {route.name === "gallery" && <GalleryPage />}
      {route.name === "event" && <EventGalleryPage slug={route.slug} />}
      {route.name === "not-found" && <NotFoundPage />}
    </>
  );
}

export default function App() {
  return (
    <RouterProvider>
      <Site />
    </RouterProvider>
  );
}
