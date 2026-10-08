"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

type Theme = "dark" | "light";
const ThemeContext = createContext({ theme: "dark" as Theme, toggle: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const mounted = useRef(false);
  useEffect(() => {
    const saved = localStorage.getItem("studio-theme") as Theme | null;
    const initial = saved ?? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    const frame = requestAnimationFrame(() => setTheme(initial));
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.setAttribute("href", theme === "dark" ? "/favicon-dark.png" : "/favicon-light.png");
    localStorage.setItem("studio-theme", theme);
  }, [theme]);
  const toggle = useCallback(() => setTheme((value) => value === "dark" ? "light" : "dark"), []);
  const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);
  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export const useTheme = () => useContext(ThemeContext);
