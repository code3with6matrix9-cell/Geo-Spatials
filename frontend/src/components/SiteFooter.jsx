import { useSiteLogo } from "../lib/useSiteLogo.js";

/** Mirrors the legacy footer so Gallery routes keep the same page ending. */
export default function SiteFooter() {
  const logo = useSiteLogo();
  const year = new Date().getFullYear();

  return (
    <footer>
      <div className="wrap">
        {logo ? (
          <img src={logo} alt="GEOSPATIALS" />
        ) : (
          <span className="g-wordmark">GEOSPATIALS</span>
        )}
        <span>Connecting Learners · Experts · Industry</span>
        <span>
          © {year} <strong className="gs">GEOSPATIALS</strong>
        </span>
      </div>
    </footer>
  );
}
