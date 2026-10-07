"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Cursor01Icon, Delete02Icon, Download04Icon, ImageCropIcon, PauseIcon, PlayIcon, Redo02Icon, ScissorIcon, Undo02Icon, ZoomInAreaIcon } from "@hugeicons/core-free-icons";
import type { ExportReceipt } from "@/features/export/mp4-export-engine";
import { clampRect, cropAspect, cropPreset } from "@/lib/project";
import { LocalProjectStore } from "@/lib/storage/project-store";
import type { CursorStyle, NormalizedRect, StudioProject } from "@/types/project";

type Tool = "crop" | "zoom" | "cursor";

export function EditorView({ initialProject, onBack }: { initialProject: StudioProject; onBack: () => void }) {
  const [project, setProject] = useState(initialProject);
  const [history, setHistory] = useState<StudioProject[]>([]);
  const [future, setFuture] = useState<StudioProject[]>([]);
  const [tool, setTool] = useState<Tool>("crop");
  const [videoUrl, setVideoUrl] = useState<string>();
  const [cameraUrl, setCameraUrl] = useState<string>();
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [markIn, setMarkIn] = useState(0);
  const [markOut, setMarkOut] = useState(Math.max(0, project.duration));
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [receipt, setReceipt] = useState<ExportReceipt>();
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraRef = useRef<HTMLVideoElement>(null);
  const store = useMemo(() => new LocalProjectStore(), []);

  useEffect(() => {
    let screenUrl: string | undefined;
    let bubbleUrl: string | undefined;
    void Promise.all([
      buildSourceUrl(store, initialProject, initialProject.mode === "camera" ? "camera" : "screen"),
      initialProject.mode === "screen-camera" ? buildSourceUrl(store, initialProject, "camera") : Promise.resolve(undefined),
    ]).then(([screen, camera]) => { screenUrl = screen; bubbleUrl = camera; setVideoUrl(screen); setCameraUrl(camera); });
    return () => { if (screenUrl) URL.revokeObjectURL(screenUrl); if (bubbleUrl) URL.revokeObjectURL(bubbleUrl); };
  }, [initialProject, store]);

  useEffect(() => {
    const timer = setTimeout(() => void store.putProject({ ...project, updatedAt: new Date().toISOString() }), 250);
    return () => clearTimeout(timer);
  }, [project, store]);

  const commit = useCallback((update: (value: StudioProject) => StudioProject) => {
    setProject((current) => { setHistory((items) => [...items.slice(-39), current]); setFuture([]); return update(current); });
  }, []);
  const undo = () => setHistory((items) => {
    const previous = items.at(-1); if (!previous) return items;
    setFuture((values) => [project, ...values]); setProject(previous); return items.slice(0, -1);
  });
  const redo = () => setFuture((items) => {
    const next = items[0]; if (!next) return items;
    setHistory((values) => [...values, project]); setProject(next); return items.slice(1);
  });

  const togglePlayback = async () => {
    const video = videoRef.current; if (!video) return;
    if (video.paused) { await video.play(); setPlaying(true); } else { video.pause(); setPlaying(false); }
  };
  const seek = (time: number) => {
    setCurrentTime(time);
    if (videoRef.current) videoRef.current.currentTime = time;
    if (cameraRef.current) cameraRef.current.currentTime = time;
  };

  const addZoom = () => commit((value) => ({ ...value, zoomEvents: [...value.zoomEvents, { id: crypto.randomUUID(), time: currentTime, x: .5, y: .5, scale: 1.5, duration: 1.4 }] }));
  const selectedZoom = project.zoomEvents.find((event) => currentTime >= event.time - .15 && currentTime <= event.time + event.duration) ?? project.zoomEvents.at(-1);

  async function runExport() {
    setError(""); setReceipt(undefined); setExportProgress(0);
    try { const { exportCompatibleMp4 } = await import("@/features/export/mp4-export-engine"); setReceipt(await exportCompatibleMp4(project, setExportProgress)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Export failed."); }
    finally { setExportProgress(null); }
  }

  return <section className="editor" aria-label={`Editing ${project.title}`}>
    <header className="editor-header">
      <button className="text-button" onClick={onBack}>← Library</button>
      <input aria-label="Recording title" value={project.title} onChange={(event) => setProject((value) => ({ ...value, title: event.target.value }))} />
      <div className="editor-actions"><button className="icon-button" onClick={undo} disabled={!history.length} aria-label="Undo"><HugeiconsIcon icon={Undo02Icon} size={17} /></button><button className="icon-button" onClick={redo} disabled={!future.length} aria-label="Redo"><HugeiconsIcon icon={Redo02Icon} size={17} /></button><button className="primary" onClick={runExport} disabled={exportProgress !== null}><HugeiconsIcon icon={Download04Icon} size={16} /> {exportProgress === null ? "Export MP4" : `${Math.round(exportProgress * 100)}%`}</button></div>
    </header>

    <div className="editor-body">
      <nav className="tool-rail" aria-label="Editor tools"><ToolButton icon={ImageCropIcon} label="Crop" active={tool === "crop"} onClick={() => setTool("crop")} /><ToolButton icon={ZoomInAreaIcon} label="Zoom" active={tool === "zoom"} onClick={() => setTool("zoom")} /><ToolButton icon={Cursor01Icon} label="Cursor" active={tool === "cursor"} onClick={() => setTool("cursor")} /></nav>
      <div className="editor-stage-wrap">
        <div className={`editor-stage aspect-${project.canvas.aspectRatio.replace(":", "-")}`} style={{ background: project.canvas.background }} onClick={(event) => {
          if (tool !== "zoom" || !selectedZoom) return;
          const rect = event.currentTarget.getBoundingClientRect();
          commit((value) => ({ ...value, zoomEvents: value.zoomEvents.map((zoom) => zoom.id === selectedZoom.id ? { ...zoom, x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height } : zoom) }));
        }}>
          <div className="video-frame" style={{ width: `${project.canvas.scale * 100}%`, height: `${project.canvas.scale * 100}%` }}>
            {videoUrl ? <video ref={videoRef} src={videoUrl} playsInline onTimeUpdate={(event) => { setCurrentTime(event.currentTarget.currentTime); if (cameraRef.current && Math.abs(cameraRef.current.currentTime - event.currentTarget.currentTime) > .15) cameraRef.current.currentTime = event.currentTarget.currentTime; }} onEnded={() => setPlaying(false)} /> : <div className="loading-media">Loading local media…</div>}
            {cameraUrl && project.camera.visible ? <video ref={cameraRef} className={`editor-camera ${project.camera.shape}`} src={cameraUrl} muted playsInline style={{ left: `${project.camera.rect.x * 100}%`, top: `${project.camera.rect.y * 100}%`, width: `${project.camera.rect.width * 100}%`, height: `${project.camera.rect.height * 100}%` }} /> : null}
            {tool === "crop" ? <CropOverlay rect={project.crop} onChange={(crop) => commit((value) => ({ ...value, crop }))} /> : null}
            {tool === "zoom" && selectedZoom ? <span className="zoom-focal" style={{ left: `${selectedZoom.x * 100}%`, top: `${selectedZoom.y * 100}%` }}>{selectedZoom.scale.toFixed(1)}×</span> : null}
          </div>
        </div>
        <div className="transport"><button className="transport-play" onClick={togglePlayback} aria-label={playing ? "Pause" : "Play"}><HugeiconsIcon icon={playing ? PauseIcon : PlayIcon} size={19} /></button><time>{formatTime(currentTime)}</time><input aria-label="Playhead" type="range" min={0} max={Math.max(.1, project.duration)} step="0.01" value={currentTime} onChange={(event) => seek(Number(event.target.value))} /><time>{formatTime(project.duration)}</time></div>
      </div>
      <aside className="inspector">{tool === "crop" ? <CropInspector project={project} commit={commit} /> : tool === "zoom" ? <ZoomInspector project={project} selected={selectedZoom} add={addZoom} commit={commit} /> : <CursorInspector project={project} commit={commit} />}</aside>
    </div>

    <div className="timeline-panel">
      <div className="timeline-toolbar"><strong>Timeline</strong><button onClick={() => commit((value) => ({ ...value, edits: [...value.edits, { type: "split", start: currentTime, end: currentTime }] }))}><HugeiconsIcon icon={ScissorIcon} size={15} /> Split</button><button onClick={() => { if (markOut > markIn) commit((value) => ({ ...value, edits: [...value.edits, { type: "delete", start: markIn, end: markOut }] })); }}><HugeiconsIcon icon={Delete02Icon} size={15} /> Delete range</button><button onClick={() => setMarkIn(currentTime)}>Set in</button><button onClick={() => setMarkOut(currentTime)}>Set out</button><span>{formatTime(markIn)} — {formatTime(markOut)}</span></div>
      <div className="timeline" style={{ "--playhead": `${project.duration ? currentTime / project.duration * 100 : 0}%` } as React.CSSProperties}>
        {(["Screen", "Camera", "Microphone", "Computer Audio", "Zoom", "Cursor"] as const).map((track) => <div className="track" key={track}><span>{track}</span><div className={`track-lane ${track.toLowerCase().replace(" ", "-")}`}>{track === "Zoom" ? project.zoomEvents.map((zoom) => <i key={zoom.id} style={{ left: `${zoom.time / Math.max(project.duration, 1) * 100}%`, width: `${zoom.duration / Math.max(project.duration, 1) * 100}%` }} />) : <i />}</div></div>)}
        <b className="playhead" />
      </div>
      <div className="trim-controls"><label>Trim start <input type="range" min={0} max={Math.max(project.duration, .1)} step=".1" value={project.trim.start} onChange={(event) => commit((value) => ({ ...value, trim: { ...value.trim, start: Math.min(Number(event.target.value), (value.trim.end ?? value.duration) - .1) } }))} /></label><label>Trim end <input type="range" min={0} max={Math.max(project.duration, .1)} step=".1" value={project.trim.end ?? project.duration} onChange={(event) => commit((value) => ({ ...value, trim: { ...value.trim, end: Math.max(Number(event.target.value), value.trim.start + .1) } }))} /></label></div>
    </div>
    {error ? <p className="editor-toast error-message" role="alert">{error}</p> : null}
    {receipt ? <p className="editor-toast success-message" role="status">Validated {receipt.videoCodec.toUpperCase()}{receipt.audioCodec ? ` + ${receipt.audioCodec.toUpperCase()} ${receipt.sampleRate! / 1000} kHz stereo` : ""} · {formatBytes(receipt.size)}</p> : null}
  </section>;
}

function ToolButton({ icon, label, active, onClick }: { icon: typeof ImageCropIcon; label: string; active: boolean; onClick: () => void }) { return <button className={active ? "active" : ""} onClick={onClick}><HugeiconsIcon icon={icon} size={19} /><span>{label}</span></button>; }

function CropOverlay({ rect, onChange }: { rect: NormalizedRect; onChange: (value: NormalizedRect) => void }) {
  const drag = useRef<{ x: number; y: number; rect: NormalizedRect; resize: boolean } | undefined>(undefined);
  const start = (event: React.PointerEvent, resize: boolean) => { event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, rect, resize }; event.stopPropagation(); };
  const move = (event: React.PointerEvent) => { if (!drag.current) return; const bounds = event.currentTarget.parentElement!.getBoundingClientRect(); const dx = (event.clientX - drag.current.x) / bounds.width; const dy = (event.clientY - drag.current.y) / bounds.height; const base = drag.current.rect; onChange(clampRect(drag.current.resize ? { ...base, width: base.width + dx, height: base.height + dy } : { ...base, x: base.x + dx, y: base.y + dy })); };
  return <div className="crop-overlay" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }} onPointerDown={(event) => start(event, false)} onPointerMove={move} onPointerUp={() => { drag.current = undefined; }}><i onPointerDown={(event) => start(event, true)} /></div>;
}

type Commit = (update: (value: StudioProject) => StudioProject) => void;
function CropInspector({ project, commit }: { project: StudioProject; commit: Commit }) { return <><h2>Crop & canvas</h2><p>Drag the crop region or its lower-right handle. Source media remains untouched.</p><span className="inspector-label">Position</span><div className="preset-grid">{(["top", "bottom", "left", "right", "centre"] as const).map((preset) => <button key={preset} onClick={() => commit((value) => ({ ...value, crop: cropPreset(preset) }))}>{preset}</button>)}</div><span className="inspector-label">Crop ratio</span><div className="preset-grid"><button onClick={() => commit((value) => ({ ...value, crop: { x: 0, y: 0, width: 1, height: 1 } }))}>Free</button>{(["16:9", "9:16", "1:1", "4:5"] as const).map((ratio) => <button key={ratio} onClick={() => commit((value) => ({ ...value, crop: cropAspect(ratio) }))}>{ratio}</button>)}</div><button className="secondary wide" onClick={() => commit((value) => ({ ...value, crop: { x: 0, y: 0, width: 1, height: 1 } }))}>Reset crop</button><Control label="Canvas scale" value={project.canvas.scale} min={.55} max={1} step={.01} onChange={(scale) => commit((value) => ({ ...value, canvas: { ...value.canvas, scale } }))} /><label className="field-label">Canvas ratio<select value={project.canvas.aspectRatio} onChange={(event) => commit((value) => ({ ...value, canvas: { ...value.canvas, aspectRatio: event.target.value as StudioProject["canvas"]["aspectRatio"] } }))}><option>16:9</option><option>9:16</option><option>1:1</option><option>4:5</option><option value="original">Original</option></select></label><label className="field-label">Fit<select value={project.canvas.fit} onChange={(event) => commit((value) => ({ ...value, canvas: { ...value.canvas, fit: event.target.value as StudioProject["canvas"]["fit"] } }))}><option value="fit">Fit</option><option value="fill">Fill</option></select></label><label className="field-label">Background<input type="color" value={project.canvas.background} onChange={(event) => commit((value) => ({ ...value, canvas: { ...value.canvas, background: event.target.value } }))} /></label>{project.mode === "screen-camera" ? <><span className="inspector-label">Camera bubble</span><label className="check-row"><input type="checkbox" checked={project.camera.visible} onChange={(event) => commit((value) => ({ ...value, camera: { ...value.camera, visible: event.target.checked } }))} /> Visible</label><label className="field-label">Shape<select value={project.camera.shape} onChange={(event) => commit((value) => ({ ...value, camera: { ...value.camera, shape: event.target.value as StudioProject["camera"]["shape"] } }))}><option value="circle">Circle</option><option value="rounded">Rounded</option><option value="square">Square</option></select></label><Control label="Horizontal" value={project.camera.rect.x} min={0} max={Math.max(0, 1 - project.camera.rect.width)} step={.01} onChange={(x) => commit((value) => ({ ...value, camera: { ...value.camera, rect: { ...value.camera.rect, x } } }))} /><Control label="Vertical" value={project.camera.rect.y} min={0} max={Math.max(0, 1 - project.camera.rect.height)} step={.01} onChange={(y) => commit((value) => ({ ...value, camera: { ...value.camera, rect: { ...value.camera.rect, y } } }))} /><Control label="Size" value={project.camera.rect.width} min={.12} max={.4} step={.01} onChange={(width) => commit((value) => ({ ...value, camera: { ...value.camera, rect: clampRect({ ...value.camera.rect, width, height: width * 1.35 }) } }))} /></> : null}</>; }

function ZoomInspector({ project, selected, add, commit }: { project: StudioProject; selected?: StudioProject["zoomEvents"][number]; add: () => void; commit: Commit }) { return <><h2>Automatic zoom</h2><p>Add a zoom at the playhead, then click the preview to move its focal point.</p><button className="primary wide" onClick={add}><HugeiconsIcon icon={Add01Icon} size={16} /> Add zoom</button>{selected ? <><Control label="Scale" value={selected.scale} min={1.1} max={2.5} step={.1} onChange={(scale) => commit((value) => ({ ...value, zoomEvents: value.zoomEvents.map((zoom) => zoom.id === selected.id ? { ...zoom, scale } : zoom) }))} /><Control label="Duration" value={selected.duration} min={.7} max={4} step={.1} onChange={(duration) => commit((value) => ({ ...value, zoomEvents: value.zoomEvents.map((zoom) => zoom.id === selected.id ? { ...zoom, duration } : zoom) }))} /><button className="danger-link" onClick={() => commit((value) => ({ ...value, zoomEvents: value.zoomEvents.filter((zoom) => zoom.id !== selected.id) }))}>Delete zoom</button></> : <div className="empty-inspector">No zoom events yet.</div>}<div className="event-list">{project.zoomEvents.map((zoom) => <button key={zoom.id}>{formatTime(zoom.time)} · {zoom.scale.toFixed(1)}×</button>)}</div></>; }

function CursorInspector({ project, commit }: { project: StudioProject; commit: Commit }) { return <><h2>Cursor</h2><p>Cursor styling is rendered non-destructively during compatible export.</p><label className="field-label">Style<select value={project.cursor.style} onChange={(event) => commit((value) => ({ ...value, cursor: { ...value.cursor, style: event.target.value as CursorStyle } }))}>{["system", "arrow", "dot", "large-dot", "circle", "hidden"].map((style) => <option key={style} value={style}>{style}</option>)}</select></label><Control label="Size" value={project.cursor.size} min={.5} max={2.5} step={.1} onChange={(size) => commit((value) => ({ ...value, cursor: { ...value.cursor, size } }))} /><Control label="Opacity" value={project.cursor.opacity} min={.1} max={1} step={.05} onChange={(opacity) => commit((value) => ({ ...value, cursor: { ...value.cursor, opacity } }))} /><label className="check-row"><input type="checkbox" checked={project.cursor.shadow} onChange={(event) => commit((value) => ({ ...value, cursor: { ...value.cursor, shadow: event.target.checked } }))} /> Shadow</label></>; }
function Control({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) { return <label className="control"><span>{label}<output>{value.toFixed(step < .1 ? 2 : 1)}</output></span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>; }

async function buildSourceUrl(store: LocalProjectStore, project: StudioProject, kind: string): Promise<string | undefined> { const source = project.sources.find((item) => item.kind === kind); if (!source) return; const chunks = await store.getChunks(project.id, kind); return chunks.length ? URL.createObjectURL(new Blob(chunks, { type: source.mimeType })) : undefined; }
const formatTime = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const formatBytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
