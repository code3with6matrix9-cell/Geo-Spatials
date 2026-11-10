/** Mirrors the legacy footer so Gallery routes keep the same page ending. */
export default function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer>
      <div className="wrap">
        <img src="/updated_image.png" alt="GEOSPATIALS" />
        <span>Connecting Learners · Experts · Industry</span>
        <span>
          © {year} <strong className="gs">GEOSPATIALS</strong>
        </span>
      </div>
    </footer>
  );
}
