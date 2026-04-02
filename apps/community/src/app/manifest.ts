import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Igbo Community Platform",
    short_name: "Igbo",
    description: "A platform connecting the Igbo community worldwide",
    start_url: "/en",
    display: "standalone",
    orientation: "portrait-primary",
    theme_color: "#2D5A27",
    background_color: "#FAF8F5",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
