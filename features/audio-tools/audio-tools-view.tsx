"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Download04Icon, MusicNote02Icon, PauseIcon, PlayIcon, Upload01Icon } from "@hugeicons/core-free-icons";
import { audioToolsExportFilename, audioToolsGainAt, renderAudioToolsWav } from "@/lib/media/audio-tools";
import { createWaveform } from "@/lib/media/audio-mixer";
import { LocalProjectStore } from "@/lib/storage/project-store";
import type { AudioToolsProject } from "@/types/project";

type AudioToolsWindow = Window & {
  showSaveFilePicker?: (options: { suggestedName: string; types: Array<{ description: string; accept: Record<string, string[]> }> }) => Promise<FileSystemFileHandle>;
};

export function AudioToolsView() {
  const store = useMemo(() => new LocalProjectStore(), []);
  const [project, setProject] = useState<AudioToolsProject>();
  const [url, setUrl] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const elementRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    let disposed = false;
    void store.getAudioToolsProject().then((saved) => {
      if (disposed || !saved) return;
      setProject(saved);
      setPosition(saved.trimStart);
      setUrl(URL.createObjectURL(saved.blob));
      setStatus("Restored from local browser storage.");
    }).catch((reason) => {
      if (!disposed) setError(storageError(reason, "The saved audio workspace could not be opened."));
    }).finally(() => { if (!disposed) setHydrated(true); });
    return () => { disposed = true; };
  }, [store]);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  useEffect(() => {
    if (!hydrated || !project) return;
    const timer = window.setTimeout(() => {
      void store.putAudioToolsProject({ ...project, updatedAt: new Date().toISOString() })
        .then(() => setStatus("Saved locally."))
        .catch((reason) => setError(storageError(reason, "Audio changes could not be saved locally.")));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [hydrated, project, store]);

  useEffect(() => {
    if (!playing || !project || !elementRef.current) return;
    let frame = 0;
    const updatePosition = () => {
      const element = elementRef.current;
      if (!element) return;
      if (element.currentTime >= project.trimEnd) {
        element.pause();
        element.currentTime = project.trimStart;
        setPosition(project.trimStart);
        setPlaying(false);
        return;
      }
      element.volume = Math.min(1, audioToolsGainAt(project, element.currentTime));
      setPosition(element.currentTime);
      frame = requestAnimationFrame(updatePosition);
    };
    frame = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(frame);
  }, [playing, project]);

  async function importAudio(file?: File) {
    if (!file) return;
    setLoading(true); setError(""); setStatus(""); setPlaying(false);
    try {
      const [duration, waveform] = await Promise.all([readAudioDuration(file), createWaveform(file, 160)]);
      const next: AudioToolsProject = {
        id: "current", name: file.name, exportName: file.name.replace(/\.[^.]+$/, ""), mimeType: file.type || "application/octet-stream", blob: file,
        duration, waveform, trimStart: 0, trimEnd: duration, volume: 1, fadeIn: 0, fadeOut: 0, updatedAt: new Date().toISOString(),
      };
      await store.putAudioToolsProject(next);
      if (url) URL.revokeObjectURL(url);
      setUrl(URL.createObjectURL(file));
      setProject(next);
      setPosition(0);
      setStatus("Imported and saved locally.");
    } catch (reason) {
      setError(reason instanceof DOMException && reason.name === "QuotaExceededError"
        ? "Browser storage is full. The audio file was not saved. Free storage space and try again."
        : "This audio file could not be decoded or saved. Try MP3, WAV, M4A, AAC, or WebM audio.");
    } finally { setLoading(false); }
  }

  async function togglePreview() {
    const element = elementRef.current;
    if (!element || !project) return;
    if (element.paused) {
      if (element.currentTime < project.trimStart || element.currentTime >= project.trimEnd) element.currentTime = project.trimStart;
      try { await element.play(); setPlaying(true); }
      catch { setError("This browser could not play the selected local audio file."); }
    } else { element.pause(); setPlaying(false); }
  }

  function seek(next: number) {
    if (!project) return;
    const value = Math.max(project.trimStart, Math.min(project.trimEnd, next));
    setPosition(value);
    if (elementRef.current) elementRef.current.currentTime = value;
  }

  async function exportWav() {
    if (!project) return;
    setExporting(true); setError(""); setStatus("");
    try {
      const blob = await renderAudioToolsWav(project);
      const filename = audioToolsExportFilename(project.exportName);
      const saveWindow = window as AudioToolsWindow;
      if (saveWindow.showSaveFilePicker) {
        try {
          const handle = await saveWindow.showSaveFilePicker({ suggestedName: filename, types: [{ description: "WAV audio", accept: { "audio/wav": [".wav"] } }] });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          setStatus(`Exported ${filename}.`);
          return;
        } catch (reason) {
          if (reason instanceof DOMException && reason.name === "AbortError") return;
        }
      }
      downloadBlob(blob, filename);
      setStatus(`Downloaded ${filename}.`);
    } catch { setError("The edited WAV could not be rendered. The original local audio is unchanged."); }
    finally { setExporting(false); }
  }

  const update = (change: Partial<AudioToolsProject>) => setProject((current) => current ? { ...current, ...change } : current);
  const duration = project?.duration ?? 0;

  return <section className="audio-tools-view" aria-labelledby="audio-tools-heading"><div className="section-heading"><div><h1 id="audio-tools-heading">Audio tools</h1><p>Trim, preview, and export a local audio file. Nothing is uploaded.</p></div><label className="primary file-button"><HugeiconsIcon icon={Upload01Icon} size={16} /> {loading ? "Reading audio…" : "Import local audio"}<input type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.webm" disabled={loading} onChange={(event) => { void importAudio(event.target.files?.[0]); event.target.value = ""; }} /></label></div>
    {error ? <p className="error-message" role="alert">{error}</p> : null}
    {status ? <p className="audio-tools-status" role="status">{status}</p> : null}
    {!hydrated ? <div className="audio-tools-empty"><p>Opening local audio workspace…</p></div> : !project ? <div className="audio-tools-empty"><span><HugeiconsIcon icon={MusicNote02Icon} size={28} /></span><h2>Choose an audio file</h2><p>You can preview its waveform, trim range, volume, fades, and export a WAV locally.</p></div> : <div className="audio-tools-card"><div className="audio-file-heading"><span><HugeiconsIcon icon={MusicNote02Icon} size={20} /></span><div><strong>{project.name}</strong><small>{formatTime(project.duration)} · Saved in this browser</small></div><button className="transport-play" onClick={() => void togglePreview()} aria-label={playing ? "Pause audio preview" : "Play audio preview"}><HugeiconsIcon icon={playing ? PauseIcon : PlayIcon} size={18} /></button></div><audio ref={elementRef} src={url} preload="metadata" onEnded={() => setPlaying(false)} />
      <div className="audio-tool-waveform" aria-label="Audio waveform">{project.waveform.map((value, index) => <i key={index} style={{ height: `${Math.max(8, value * 100)}%` }} />)}<span className="trim-window" style={{ left: `${project.trimStart / duration * 100}%`, right: `${100 - project.trimEnd / duration * 100}%` }} /></div>
      <div className="audio-tool-transport"><time>{formatPrecise(position)}</time><input aria-label="Audio playback position" type="range" min={project.trimStart} max={project.trimEnd} step=".01" value={position} onChange={(event) => seek(Number(event.target.value))} /><time>{formatPrecise(project.trimEnd)}</time></div>
      <div className="audio-tool-grid"><AudioControl label="Trim start" value={project.trimStart} min={0} max={Math.max(0, project.trimEnd - .1)} step={.05} suffix="s" onChange={(trimStart) => { update({ trimStart }); if (position < trimStart) seek(trimStart); }} /><AudioControl label="Trim end" value={project.trimEnd} min={Math.min(duration, project.trimStart + .1)} max={duration} step={.05} suffix="s" onChange={(trimEnd) => { update({ trimEnd }); if (position > trimEnd) seek(trimEnd); }} /><AudioControl label="Volume" value={project.volume} min={0} max={1} step={.05} onChange={(volume) => update({ volume })} /><AudioControl label="Fade in" value={project.fadeIn} min={0} max={Math.min(5, project.trimEnd - project.trimStart)} step={.1} suffix="s" onChange={(fadeIn) => update({ fadeIn })} /><AudioControl label="Fade out" value={project.fadeOut} min={0} max={Math.min(5, project.trimEnd - project.trimStart)} step={.1} suffix="s" onChange={(fadeOut) => update({ fadeOut })} /></div>
      <div className="audio-tools-export"><label className="field-label">Export name<input value={project.exportName} onChange={(event) => update({ exportName: event.target.value })} /></label><button className="primary" disabled={exporting} onClick={() => void exportWav()}><HugeiconsIcon icon={Download04Icon} size={16} /> {exporting ? "Rendering WAV…" : "Export WAV"}</button></div>
      <p className="audio-tools-note">Edits and source audio stay in this browser. WAV export applies the selected trim, volume, and fades without changing the original.</p></div>}
  </section>;
}

function AudioControl({ label, value, min, max, step, suffix = "", onChange }: { label: string; value: number; min: number; max: number; step: number; suffix?: string; onChange: (value: number) => void }) {
  return <label className="control"><span>{label}<output>{value.toFixed(step < .1 ? 2 : 1)}{suffix}</output></span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

async function readAudioDuration(blob: Blob): Promise<number> {
  const context = new AudioContext();
  try { return (await context.decodeAudioData(await blob.arrayBuffer())).duration; }
  finally { await context.close(); }
}

function downloadBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 30_000);
}

function storageError(reason: unknown, fallback: string) {
  return reason instanceof DOMException && reason.name === "QuotaExceededError" ? "Browser storage is full. Audio changes could not be saved locally." : fallback;
}

const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const formatPrecise = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
