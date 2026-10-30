import { useEffect, useState } from "react";
import { useRoute } from "../lib/router.jsx";
import { openRegistrationModal } from "../lib/registrationTrigger.js";
import { useSiteLogo } from "../lib/useSiteLogo.js";

/** Same links, order and wording as the legacy navigation bar. */
const NAV_LINKS = [
  { label: "About", href: "/#about" },
  { label: "Information", href: "/#info" },
  { label: "Technologies", href: "/#tech" },
  { label: "Who can join", href: "/#who" },
  { label: "Package", href: "/#package" },
  { label: "Academia", href: "/#academia" },
  { label: "Contact", href: "/#contact" },
  { label: "Gallery", href: "/gallery" },
];

export default function SiteNav({ active } = {}) {
  const { pathname } = useRoute();
  const [open, setOpen] = useState(false);
  const logo = useSiteLogo();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isActive = (href) => href === "/gallery" && active === "gallery";

  const handleRegister = (event) => {
    setOpen(false);
    if (openRegistrationModal()) event.preventDefault();
  };

  return (
    <nav>
      <div className="bar glass">
        <a href="/" aria-label="GEOSPATIALS home">
          {logo ? (
            <img data-logo src={logo} alt="GEOSPATIALS" />
          ) : (
            <span className="g-wordmark">GEOSPATIALS</span>
          )}
        </a>

        <div className={`links${open ? " open" : ""}`} id="g-nav-links">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={isActive(link.href) ? "on" : undefined}
              aria-current={isActive(link.href) ? "page" : undefined}
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="g-nav-actions">
          <a className="btn sm" href="/#register" onClick={handleRegister}>
            Register ↗
          </a>
          <button
            className="mt"
            id="g-nav-toggle"
            type="button"
            aria-expanded={open}
            aria-controls="g-nav-links"
            aria-label="Menu"
            onClick={() => setOpen((value) => !value)}
          >
            Menu ☰
          </button>
        </div>
      </div>
    </nav>
  );
}
