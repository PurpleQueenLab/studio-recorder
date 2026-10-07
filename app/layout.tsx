import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: { default: "Studio Recorder", template: "%s — Studio Recorder" },
  description: "A private, local-first screen recorder and editor.",
  applicationName: "Studio Recorder",
  icons: {
    icon: [{ url: "/studio-recorder-logo.png", type: "image/png", sizes: "17x17" }],
    apple: [{ url: "/studio-recorder-brand.png", type: "image/png", sizes: "36x36" }],
  },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body><ThemeProvider>{children}</ThemeProvider></body></html>;
}
