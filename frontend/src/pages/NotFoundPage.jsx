import { useEffect } from "react";
import SiteNav from "../components/SiteNav.jsx";
import SiteFooter from "../components/SiteFooter.jsx";

/** Rendered for any path the site does not serve (SPA fallback). */
export default function NotFoundPage() {
  useEffect(() => {
    document.title = "Page not found | GEOSPATIALS";
  }, []);

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

      <SiteNav />

      <main className="gpage">
        <div className="wrap">
          <div className="g-state glass">
            <span className="g-state-icon" aria-hidden="true">
              ◎
            </span>
            <h3>Page not found</h3>
            <p>
              The page you are looking for does not exist or has been moved.
              Use the navigation above to find your way around GEOSPATIALS.
            </p>
            <div className="g-state-actions">
              <a className="btn sm" href="/">
                Go to home
              </a>
              <a className="btn o sm" href="/gallery">
                Open Gallery
              </a>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
