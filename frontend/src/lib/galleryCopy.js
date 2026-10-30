/** Small copy helpers shared by the Gallery routes. */

const LABEL_RULES = [
  [/workshop|training|bootcamp|class/, "Workshop"],
  [/expo|exhibition|show|summit/, "Expo"],
  [/university|college|campus|academia|school|institute/, "Campus"],
  [/field|survey|site|project/, "Field activity"],
  [/industry|partner|enterprise|organisation|organization/, "Industry event"],
  [/drone|uav|mapping/, "Drone programme"],
  [/government|govt|policy/, "Government"],
];

/** Short visual label derived from the folder name (no hard-coded catalogue). */
export function eventLabel(name) {
  const lower = String(name || "").toLowerCase();
  for (const [pattern, label] of LABEL_RULES) {
    if (pattern.test(lower)) return label;
  }
  return "Event";
}

export function friendlyStorageMessage(error) {
  if (!error) return "Something went wrong while loading the gallery.";
  if (error.code === "not-configured") {
    return "Gallery storage is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the frontend environment.";
  }
  if (error.code === "network") {
    return "We could not reach Supabase Storage. Check your connection and try again.";
  }
  if (error.code === "forbidden") {
    return "Storage access was denied. Check the bucket policies for the public anon key.";
  }
  if (error.code === "not-found") {
    return "The storage bucket could not be found.";
  }
  return error.message || "Something went wrong while loading the gallery.";
}

export function formatCount(count, truncated) {
  if (count === null || count === undefined) return null;
  if (count === 0) return "No photos";
  return `${count}${truncated ? "+" : ""} ${count === 1 ? "photo" : "photos"}`;
}
