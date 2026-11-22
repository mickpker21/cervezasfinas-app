import React, { useMemo, useState } from "react";

const isSupabasePublic = (url) => {
  try {
    const u = new URL(url, window.location.origin);
    return u.hostname.includes(".supabase.co") && u.pathname.includes("/storage/v1/object/public/");
  } catch {
    return false;
  }
};

export default function SafeImg({
  src,
  alt = "",
  className = "",
  style,
  // ya creaste /public/brands/default.png
  fallback = "/brands/default.png",
  ...rest
}) {
  const [currentSrc, setCurrentSrc] = useState(src);
  const allowCORS = useMemo(() => isSupabasePublic(currentSrc), [currentSrc]);

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={className}
      style={style}
      {...(allowCORS ? { crossOrigin: "anonymous" } : {})}
      referrerPolicy="no-referrer"
      onError={() => { if (currentSrc !== fallback) setCurrentSrc(fallback); }}
      {...rest}
    />
  );
}
