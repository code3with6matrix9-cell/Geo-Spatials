import { useEffect, useRef } from "react";
import legacyMarkup from "./legacyMarkup.html?raw";
import "./style.css";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  "https://geo-spatials-production-2026.onrender.com"
).replace(/\/$/, "");

export default function App() {
  const contentRef = useRef(null);

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

  return <div ref={contentRef} dangerouslySetInnerHTML={{ __html: legacyMarkup }} />;
}
