"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ComputerVideoIcon, LibraryIcon, Mic02Icon, Moon02Icon, RecordIcon, Settings02Icon, Sun03Icon, WaveIcon } from "@hugeicons/core-free-icons";
import { detectCapabilities, type BrowserCapabilities } from "@/lib/media/capabilities";
import { useTheme } from "@/components/theme-provider";
import { LibraryView } from "@/features/library/library-view";
import { RecordingPanel } from "@/features/recording/recording-panel";

type View = "library" | "record" | "settings";

export function StudioApp() {
  const [view, setView] = useState<View>("library");
  const { theme, toggle } = useTheme();
  const capabilities: BrowserCapabilities | undefined = view === "settings" && typeof window !== "undefined" ? detectCapabilities() : undefined;

  return <div className="app-frame">
    <header className="topbar"><div className="topbar-brand"><span className="browser-dots" aria-hidden="true"><i /><i /><i /></span><HugeiconsIcon icon={ComputerVideoIcon} size={15} /><strong>Studio Recorder</strong></div><span className="view-title">{view === "library" ? "Library" : view === "record" ? "Record" : "Settings"}</span><div className="top-actions"><span>✓ Saved locally</span><button className="icon-button" onClick={toggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}><HugeiconsIcon icon={theme === "dark" ? Sun03Icon : Moon02Icon} size={17} /></button>{view !== "record" && <button className="primary" onClick={() => setView("record")}>New recording</button>}</div></header>
    <aside className="sidebar"><div className="brand"><span><HugeiconsIcon icon={WaveIcon} size={21} /></span><strong>Studio Recorder</strong></div><nav aria-label="Primary">
      <NavButton icon={LibraryIcon} label="Library" active={view === "library"} onClick={() => setView("library")} />
      <NavButton icon={RecordIcon} label="Record" active={view === "record"} onClick={() => setView("record")} />
      <NavButton icon={Mic02Icon} label="Audio tools" disabled />
      <NavButton icon={Settings02Icon} label="Settings" active={view === "settings"} onClick={() => setView("settings")} />
    </nav><div className="storage-card"><strong>Local storage</strong><div className="storage-meter"><i /></div><small>Stored in this browser only</small><p>Clearing site data removes local projects. Save finished videos to your computer.</p></div></aside>
    <main>{view === "library" && <LibraryView onRecord={() => setView("record")} />}{view === "record" && <RecordingPanel onSaved={() => setView("library")} />}{view === "settings" && <Settings capabilities={capabilities} />}</main>
  </div>;
}

function NavButton({ icon, label, active, disabled, onClick }: { icon: typeof LibraryIcon; label: string; active?: boolean; disabled?: boolean; onClick?: () => void }) {
  return <button className={active ? "active" : ""} onClick={onClick} disabled={disabled} title={disabled ? "Coming in a later milestone" : undefined}><HugeiconsIcon icon={icon} size={19} />{label}{disabled && <small>Soon</small>}</button>;
}

function Settings({ capabilities }: { capabilities?: BrowserCapabilities }) {
  return <section className="settings-view"><div className="section-heading"><div><h1>Browser compatibility</h1><p>Studio Recorder checks capabilities on this device instead of assuming support.</p></div></div><div className="capability-card">{capabilities ? Object.entries(capabilities).filter(([key]) => key !== "compatibleRecorderMimeType").map(([key, supported]) => <div key={key}><span>{humanize(key)}</span><strong className={supported ? "supported" : "unsupported"}>{supported ? "Supported" : "Unavailable"}</strong></div>) : <p>Checking your browser…</p>}</div><div className="notice"><strong>Your media stays here</strong><p>There is no account, upload endpoint, analytics payload, or server-side media processing in this application.</p></div></section>;
}

const humanize = (value: string) => value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
