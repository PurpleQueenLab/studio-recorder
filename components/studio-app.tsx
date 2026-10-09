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
import { canAttemptChunkReload, isChunkLoadFailure } from "@/lib/chunk-recovery";

const EditorView = dynamic(
  () => import("@/features/editor/editor-view").then((module) => module.EditorView),
  { ssr: false, loading: () => <div className="loading-media">Loading editor…</div> },
);

type View = "library" | "record" | "editor" | "audio" | "settings";

export function StudioApp() {
  const [view, setView] = useState<View>("library");
  const [selectedProject, setSelectedProject] = useState<StudioProject>();
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("");
  const [projectStore] = useState(() => new LocalProjectStore());
  const importInput = useRef<HTMLInputElement>(null);
  const { theme, toggle } = useTheme();
  const capabilities: BrowserCapabilities | undefined = view === "settings" && typeof window !== "undefined" ? detectCapabilities() : undefined;
  useEffect(() => { document.title = `${view === "library" ? "Library" : view === "record" ? "Record" : view === "editor" ? "Editor" : view === "audio" ? "Audio Tools" : "Settings"} — Studio Recorder`; }, [view]);
  useEffect(() => {
    let reloadTimer = 0;
    const recover = (reason: unknown) => {
      if (!isChunkLoadFailure(reason)) return;
      if (canAttemptChunkReload(sessionStorage)) {
        setUpdateMessage("Studio Recorder was updated. Refreshing to load the latest version. Your locally saved projects will remain available.");
        reloadTimer = window.setTimeout(() => location.reload(), 1_200);
      } else {
        setUpdateMessage("Studio Recorder was updated, but the latest files could not be loaded. Refresh this page manually. Your locally saved projects will remain available.");
      }
    };
    const onError = (event: ErrorEvent) => recover(event.error ?? event.message);
    const onRejection = (event: PromiseRejectionEvent) => recover(event);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onRejection); clearTimeout(reloadTimer); };
  }, []);

  async function importStandaloneVideo(file?: File) {
    if (!file) return;
    try {
      const project = await importVideoAsProject(file, projectStore);
      setSelectedProject(project);
      setView("editor");
      void ensureProjectThumbnail(project, projectStore).then((updated) => {
        setSelectedProject((current) => current?.id === updated.id ? updated : current);
      }).catch(() => undefined);
    } catch (reason) {
      window.alert(reason instanceof Error ? reason.message : "This video could not be imported.");
    }
  }

  return <div className="app-frame">
    <aside className="sidebar"><div className="brand"><Image className="brand-lockup" src={theme === "dark" ? "/studio-recorder-logo-dark.png" : "/studio-recorder-logo-light.png"} width={174} height={58} alt="Studio Recorder" priority /><Image className="brand-mark" src={theme === "dark" ? "/favicon-dark.png" : "/favicon-light.png"} width={32} height={32} alt="Studio Recorder" /></div><nav aria-label="Primary">
      <NavButton icon={LibraryIcon} label="Library" active={view === "library"} onClick={() => setView("library")} />
      <NavButton icon={RecordIcon} label="Record" active={view === "record"} onClick={() => setView("record")} />
      <NavButton icon={Mic02Icon} label="Audio tools" active={view === "audio"} onClick={() => setView("audio")} />
      <NavButton icon={Settings02Icon} label="Settings" active={view === "settings"} onClick={() => setView("settings")} />
    </nav><div className="sidebar-lower"><button className="sidebar-theme" onClick={toggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}><HugeiconsIcon icon={theme === "dark" ? Moon02Icon : Sun03Icon} size={18} /><span>{theme === "dark" ? "Dark mode" : "Light mode"}</span><small>{theme === "dark" ? "Light" : "Dark"}</small></button><button className="sidebar-support" aria-label="Report a bug" onClick={() => setBugReportOpen(true)}><HugeiconsIcon icon={Bug01Icon} size={18} /><span>Report a bug</span></button></div></aside>
    <main>{view === "library" ? <LibraryView onRecord={() => setView("record")} onImport={() => importInput.current?.click()} onOpen={(project) => { setSelectedProject(project); setView("editor"); }} /> : null}{view === "record" ? <RecordingPanel onSaved={(project) => { void ensureProjectThumbnail(project).catch(() => project); setSelectedProject(project); setView("editor"); }} /> : null}{view === "editor" && selectedProject ? <EditorView initialProject={selectedProject} onBack={() => setView("library")} onDelete={async (project) => { await projectStore.deleteProject(project.id); setSelectedProject(undefined); setView("library"); }} /> : null}{view === "audio" ? <AudioToolsView /> : null}{view === "settings" ? <Settings capabilities={capabilities} /> : null}</main>
    <input ref={importInput} hidden type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void importStandaloneVideo(file); }} />
    <BugReportDialog open={bugReportOpen} onClose={() => setBugReportOpen(false)} context={view} />
    {updateMessage ? <p className="editor-toast error-message" role="alert">{updateMessage}</p> : null}
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
