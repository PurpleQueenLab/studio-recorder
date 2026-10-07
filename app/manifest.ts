import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Studio Recorder",
    short_name: "Recorder",
    description: "A private, local-first browser screen recorder and editor.",
    start_url: "/",
    display: "standalone",
    background_color: "#08090d",
    theme_color: "#8d7bff",
    icons: [
      { src: "/studio-recorder-brand.png", sizes: "36x36", type: "image/png" },
    ],
  };
}
