import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: { default: "Studio Recorder", template: "%s — Studio Recorder" },
  description: "A private, local-first screen recorder and editor.",
  applicationName: "Studio Recorder",
  icons: {
    icon: [{ url: "/favicon-light.png", type: "image/png" }],
    apple: [{ url: "/favicon-light.png", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body><ThemeProvider>{children}</ThemeProvider><Analytics /></body></html>;
}
