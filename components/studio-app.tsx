"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { HugeiconsIcon } from "@hugeicons/react";
import { Bug01Icon, LibraryIcon, Mic02Icon, Moon02Icon, RecordIcon, Settings02Icon, Sun03Icon } from "@hugeicons/core-free-icons";
import { detectCapabilities, type BrowserCapabilities } from "@/lib/media/capabilities";
import { useTheme } from "@/components/theme-provider";
import { LibraryView } from "@/features/library/library-view";
import { RecordingPanel } from "@/features/recording/recording-panel";
import { AudioToolsView } from "@/features/audio-tools/audio-tools-view";
import type { StudioProject } from "@/types/project";
import type { ExportReceipt } from "@/features/export/mp4-export-engine";
import { BugReportDialog } from "@/components/bug-report-dialog";
import { ensureProjectThumbnail, importVideoAsProject } from "@/lib/media/video-import";
import { LocalProjectStore } from "@/lib/storage/project-store";

const EditorView = dynamic(
  () => import("@/features/editor/editor-view").then((module) => module.EditorView),
  { ssr: false, loading: () => <div className="loading-media">Loading editor…</div> },
);

type View = "library" | "record" | "editor" | "audio" | "settings";

export function StudioApp() {
  const [view, setView] = useState<View>("library");
  const [selectedProject, setSelectedProject] = useState<StudioProject>();
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const { theme, toggle } = useTheme();
  const capabilities: BrowserCapabilities | undefined = view === "settings" && typeof window !== "undefined" ? detectCapabilities() : undefined;
  useEffect(() => { document.title = `${view === "library" ? "Library" : view === "record" ? "Record" : view === "editor" ? "Editor" : view === "audio" ? "Audio Tools" : "Settings"} — Studio Recorder`; }, [view]);

  return <div className="app-frame">
    <header className="topbar"><div className="topbar-brand"><span className="browser-dots" aria-hidden="true"><i /><i /><i /></span><Image src={theme === "dark" ? "/favicon-dark.png" : "/favicon-light.png"} width={24} height={24} alt="" /><strong>Studio Recorder</strong></div><span className="view-title">{view === "library" ? "Library" : view === "record" ? "Record" : view === "editor" ? "Editor" : view === "audio" ? "Audio Tools" : "Settings"}</span><div className="top-actions"><span>✓ Saved locally</span><button className="icon-button" onClick={toggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}><HugeiconsIcon icon={theme === "dark" ? Sun03Icon : Moon02Icon} size={17} /></button>{view !== "record" && view !== "editor" ? <button className="primary" onClick={() => setView("record")}>New recording</button> : null}</div></header>
    <aside className="sidebar"><div className="brand"><Image src={theme === "dark" ? "/studio-recorder-logo-dark.png" : "/studio-recorder-logo-light.png"} width={174} height={58} alt="Studio Recorder" priority /></div><nav aria-label="Primary">
      <NavButton icon={LibraryIcon} label="Library" active={view === "library"} onClick={() => setView("library")} />
      <NavButton icon={RecordIcon} label="Record" active={view === "record"} onClick={() => setView("record")} />
      <NavButton icon={Mic02Icon} label="Audio tools" active={view === "audio"} onClick={() => setView("audio")} />
      <NavButton icon={Settings02Icon} label="Settings" active={view === "settings"} onClick={() => setView("settings")} />
    </nav><button className="sidebar-support" onClick={() => setBugReportOpen(true)}><HugeiconsIcon icon={Bug01Icon} size={18} /> Report a bug</button><div className="storage-card"><strong>Local storage</strong><div className="storage-meter"><i /></div><small>Stored in this browser only</small><p>Clearing site data removes local projects. Save finished videos to your computer.</p></div></aside>
    <main>{view === "library" ? <LibraryView onRecord={() => setView("record")} onImport={() => importInput.current?.click()} onOpen={(project) => { setSelectedProject(project); setView("editor"); }} /> : null}{view === "record" ? <RecordingPanel onSaved={(project) => { void ensureProjectThumbnail(project).catch(() => project); setSelectedProject(project); setView("editor"); }} /> : null}{view === "editor" && selectedProject ? <EditorView initialProject={selectedProject} onBack={() => setView("library")} /> : null}{view === "audio" ? <AudioToolsView /> : null}{view === "settings" ? <Settings capabilities={capabilities} /> : null}</main>
    <input ref={importInput} hidden type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; void importVideoAsProject(file, new LocalProjectStore()).then((project) => ensureProjectThumbnail(project)).then((project) => { setSelectedProject(project); setView("editor"); }).catch((reason) => window.alert(reason instanceof Error ? reason.message : "This video could not be imported.")); }} />
    <BugReportDialog open={bugReportOpen} onClose={() => setBugReportOpen(false)} context={view} />
  </div>;
}

function NavButton({ icon, label, active, disabled, onClick }: { icon: typeof LibraryIcon; label: string; active?: boolean; disabled?: boolean; onClick?: () => void }) {
  return <button className={active ? "active" : ""} onClick={onClick} disabled={disabled} title={disabled ? "Coming in a later milestone" : undefined}><HugeiconsIcon icon={icon} size={19} />{label}{disabled && <small>Soon</small>}</button>;
}

function Settings({ capabilities }: { capabilities?: BrowserCapabilities }) {
  const [checking, setChecking] = useState(false);
  const [receipt, setReceipt] = useState<ExportReceipt>();
  const [error, setError] = useState("");
  return <section className="settings-view"><div className="section-heading"><div><h1>Browser compatibility</h1><p>Studio Recorder checks capabilities on this device instead of assuming support.</p></div></div><div className="capability-card">{capabilities ? Object.entries(capabilities).filter(([key]) => key !== "compatibleRecorderMimeType").map(([key, supported]) => <div key={key}><span>{humanize(key)}</span><strong className={supported ? "supported" : "unsupported"}>{supported ? "Supported" : "Unavailable"}</strong></div>) : <p>Checking your browser…</p>}</div><div className="export-check"><div><strong>Compatible MP4 encoder</strong><p>Generates and validates a one-second local H.264 + AAC test. No file is uploaded or saved.</p></div><button className="secondary" disabled={checking} onClick={async () => { setChecking(true); setError(""); setReceipt(undefined); try { const { runMp4SelfTest } = await import("@/features/export/mp4-export-engine"); setReceipt(await runMp4SelfTest()); } catch (reason) { setError(reason instanceof Error ? reason.message : "MP4 check failed"); } finally { setChecking(false); } }}>{checking ? "Checking…" : "Run self-check"}</button>{receipt ? <span className="supported">Validated {receipt.videoCodec.toUpperCase()} + {receipt.audioCodec?.toUpperCase()} · {receipt.sampleRate! / 1000} kHz stereo</span> : null}{error ? <span className="unsupported">{error}</span> : null}</div><div className="notice"><strong>Your media stays here</strong><p>There is no account, upload endpoint, analytics payload, or server-side media processing in this application.</p></div></section>;
}

const humanize = (value: string) => value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
