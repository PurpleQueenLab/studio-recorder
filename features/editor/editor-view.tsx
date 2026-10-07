"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Cursor01Icon, Delete02Icon, Download04Icon, ImageCropIcon, ImageUploadIcon, Mic01Icon, MusicNote02Icon, PaintBrush01Icon, PauseIcon, PlayIcon, Redo02Icon, ScissorIcon, Undo02Icon, VolumeHighIcon, ZoomInAreaIcon } from "@hugeicons/core-free-icons";
import type { ExportReceipt, ExportStage } from "@/features/export/mp4-export-engine";
import { TimelineView } from "@/features/editor/timeline-view";
import { audioTrackLabel, useAudioPreview } from "@/features/editor/use-audio-preview";
import { previewPointFromSource, previewZoomStyle, sourcePointFromPreview, zoomTransformAt } from "@/lib/editor/composition";
import { clampTimelineTime } from "@/lib/editor/timeline";
import { createWaveform } from "@/lib/media/audio-mixer";
import { clampRect, cropAspect, cropPreset, formatExportFallback, FULL_FRAME, primaryVideoSourceKind } from "@/lib/project";
import { LocalProjectStore } from "@/lib/storage/project-store";
import type { AudioClip, AudioTrackType, CursorStyle, NormalizedRect, ProjectAsset, StudioProject } from "@/types/project";

type Tool = "crop" | "presentation" | "background" | "zoom" | "cursor" | "audio";
type Commit = (update: (value: StudioProject) => StudioProject) => void;
type VoiceoverState = "idle" | "countdown" | "recording";

export function EditorView({ initialProject, onBack }: { initialProject: StudioProject; onBack: () => void }) {
  const [project, setProject] = useState(initialProject);
  const [history, setHistory] = useState<StudioProject[]>([]);
  const [future, setFuture] = useState<StudioProject[]>([]);
  const [tool, setTool] = useState<Tool>("crop");
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [mediaState, setMediaState] = useState<"loading" | "ready" | "error">("loading");
  const [mediaRetry, setMediaRetry] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [markIn, setMarkIn] = useState(0);
  const [markOut, setMarkOut] = useState(Math.max(0, project.duration));
  const [selectedZoomId, setSelectedZoomId] = useState<string>();
  const [selectedClipId, setSelectedClipId] = useState<string>();
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<AudioTrackType>("microphone");
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [exportStage, setExportStage] = useState<ExportStage>("Preparing video");
  const [receipt, setReceipt] = useState<ExportReceipt>();
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportName, setExportName] = useState(project.title || formatExportFallback());
  const [error, setError] = useState("");
  const [voiceoverState, setVoiceoverState] = useState<VoiceoverState>("idle");
  const [countdown, setCountdown] = useState(3);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [voiceoverDevice, setVoiceoverDevice] = useState("");
  const [monitorOriginal, setMonitorOriginal] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraRef = useRef<HTMLVideoElement>(null);
  const backgroundVideoRef = useRef<HTMLVideoElement>(null);
  const voiceoverRecorder = useRef<MediaRecorder | undefined>(undefined);
  const voiceoverStream = useRef<MediaStream | undefined>(undefined);
  const voiceoverChunks = useRef<Blob[]>([]);
  const voiceoverTimelineStart = useRef(0);
  const waveformJobs = useRef(new Set<string>());
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);
  const store = useMemo(() => new LocalProjectStore(), []);
  const { sync: syncAudio, pause: pauseAudio } = useAudioPreview(project, mediaUrls);
  const selectedZoom = project.zoomEvents.find((zoom) => zoom.id === selectedZoomId) ?? project.zoomEvents.find((event) => currentTime >= event.time && currentTime <= event.time + event.duration) ?? project.zoomEvents.at(-1);
  const selectedClip = project.audio.clips.find((clip) => clip.id === selectedClipId);

  const commit = useCallback((update: (value: StudioProject) => StudioProject) => {
    setProject((current) => { setHistory((items) => [...items.slice(-39), current]); setFuture([]); return update(current); });
  }, []);

  useEffect(() => {
    let disposed = false;
    void buildMediaUrls(store, project.id, project.mode, project.sources, project.assets).then((next) => {
      if (disposed) { Object.values(next).forEach(URL.revokeObjectURL); return; }
      if (!next.video) throw new Error("The primary local video source is missing or unreadable.");
      setMediaUrls((current) => { Object.values(current).forEach(URL.revokeObjectURL); return next; });
      setMediaState("ready");
    }).catch((reason) => { if (!disposed) { setMediaState("error"); setError(reason instanceof Error ? reason.message : "Local media could not be opened."); } });
    return () => { disposed = true; };
  }, [mediaRetry, project.id, project.mode, project.assets, project.sources, store]);

  useEffect(() => () => { setMediaUrls((current) => { Object.values(current).forEach(URL.revokeObjectURL); return {}; }); }, []);
  useEffect(() => { const timer = setTimeout(() => void store.putProject({ ...project, updatedAt: new Date().toISOString() }), 250); return () => clearTimeout(timer); }, [project, store]);
  useEffect(() => { void navigator.mediaDevices?.enumerateDevices().then((devices) => setMicrophones(devices.filter((device) => device.kind === "audioinput"))).catch(() => setMicrophones([])); }, []);

  useEffect(() => {
    for (const type of ["microphone", "computer-audio"] as const) {
      if (project.audio.waveforms[type]?.length || waveformJobs.current.has(type)) continue;
      const descriptor = project.sources.find((source) => source.kind === type);
      if (!descriptor) continue;
      waveformJobs.current.add(type);
      void store.getChunks(project.id, type).then((chunks) => chunks.length ? createWaveform(new Blob(chunks, { type: descriptor.mimeType })) : []).then((waveform) => {
        if (waveform.length) setProject((current) => ({ ...current, audio: { ...current.audio, waveforms: { ...current.audio.waveforms, [type]: waveform } } }));
      }).finally(() => waveformJobs.current.delete(type));
    }
  }, [project.audio.waveforms, project.id, project.sources, store]);

  const seek = useCallback((time: number) => {
    const next = clampTimelineTime(time, project.duration);
    setCurrentTime(next);
    if (videoRef.current) videoRef.current.currentTime = next;
    if (cameraRef.current) cameraRef.current.currentTime = next;
    if (backgroundVideoRef.current) backgroundVideoRef.current.currentTime = next;
    syncAudio(next, playing);
  }, [playing, project.duration, syncAudio]);

  const togglePlayback = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      await video.play();
      void cameraRef.current?.play().catch(() => undefined);
      void backgroundVideoRef.current?.play().catch(() => undefined);
      setPlaying(true); syncAudio(video.currentTime, true);
    } else {
      video.pause(); cameraRef.current?.pause(); backgroundVideoRef.current?.pause(); pauseAudio(); setPlaying(false);
    }
  }, [pauseAudio, syncAudio]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable=true]")) return;
      if (event.code === "Space") { event.preventDefault(); void togglePlayback(); }
      if (event.key === "ArrowLeft") { event.preventDefault(); seek(currentTime - (event.shiftKey ? 5 : .25)); }
      if (event.key === "ArrowRight") { event.preventDefault(); seek(currentTime + (event.shiftKey ? 5 : .25)); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [currentTime, seek, togglePlayback]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const followPlayback = () => {
      if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
      frame = requestAnimationFrame(followPlayback);
    };
    frame = requestAnimationFrame(followPlayback);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  useEffect(() => () => { voiceoverRecorder.current?.stop(); voiceoverStream.current?.getTracks().forEach((track) => track.stop()); }, []);

  const undo = () => setHistory((items) => { const previous = items.at(-1); if (!previous) return items; setFuture((values) => [project, ...values]); setProject(previous); return items.slice(0, -1); });
  const redo = () => setFuture((items) => { const next = items[0]; if (!next) return items; setHistory((values) => [...values, project]); setProject(next); return items.slice(1); });
  const addZoom = () => { const id = crypto.randomUUID(); commit((value) => ({ ...value, zoomEvents: [...value.zoomEvents, { id, time: currentTime, x: .5, y: .5, scale: 1.5, duration: 1.4, enabled: true, source: "manual" }] })); setSelectedZoomId(id); };

  async function runExport(name: string) {
    setShowExportDialog(false);
    setError(""); setReceipt(undefined); setExportProgress(0); setExportStage("Preparing video");
    try { const { exportCompatibleMp4 } = await import("@/features/export/mp4-export-engine"); setReceipt(await exportCompatibleMp4(project, (progress, stage) => { setExportProgress(progress); setExportStage(stage); }, name)); }
    catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : "Export failed.");
    }
    finally { setExportProgress(null); }
  }

  async function importMusic(file?: File) {
    if (!file) return;
    setError("");
    try {
      const duration = await audioDuration(file);
      const waveform = await createWaveform(file);
      const asset: ProjectAsset = { id: crypto.randomUUID(), kind: "music", name: file.name, mimeType: file.type || "audio/mpeg", chunkCount: 1, duration };
      await store.putChunk(project.id, asset.id, 0, file);
      const clip: AudioClip = { id: crypto.randomUUID(), sourceId: asset.id, trackType: "music", startTime: currentTime, sourceIn: 0, sourceOut: duration, volume: 1, muted: false, fadeIn: .25, fadeOut: .5, waveform };
      commit((value) => ({ ...value, assets: [...value.assets, asset], audio: { ...value.audio, clips: [...value.audio.clips, clip] } }));
      setSelectedClipId(clip.id); setSelectedAudioTrack("music"); setTool("audio");
    } catch { setError("This audio file could not be decoded by the browser. Try MP3, WAV, M4A, or AAC."); }
  }

  async function importBackground(file?: File) {
    if (!file) return;
    const asset: ProjectAsset = { id: crypto.randomUUID(), kind: "background-image", name: file.name, mimeType: file.type || "image/jpeg", chunkCount: 1 };
    await store.putChunk(project.id, asset.id, 0, file);
    commit((value) => ({ ...value, assets: [...value.assets.filter((item) => item.kind !== "background-image"), asset], background: { ...value.background, type: "image", assetId: asset.id, value: "" } }));
  }

  async function startVoiceover() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: voiceoverDevice ? { deviceId: { exact: voiceoverDevice } } : true, video: false });
      const track = stream.getAudioTracks()[0];
      if (!track || track.readyState !== "live" || !track.enabled) throw new Error("The selected microphone did not provide a live audio track.");
      voiceoverStream.current = stream; setVoiceoverState("countdown");
      for (let count = 3; count > 0; count -= 1) { setCountdown(count); await delay(700); }
      const mimeType = ["audio/webm;codecs=opus", "audio/webm"].find(MediaRecorder.isTypeSupported);
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 192_000 } : undefined);
      voiceoverChunks.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) voiceoverChunks.current.push(event.data); };
      recorder.onstop = () => { void finishVoiceover(recorder.mimeType); };
      voiceoverTimelineStart.current = currentTime; voiceoverRecorder.current = recorder;
      recorder.start(500); setVoiceoverState("recording");
      if (monitorOriginal && videoRef.current?.paused) await togglePlayback();
    } catch (reason) {
      voiceoverStream.current?.getTracks().forEach((item) => item.stop()); voiceoverStream.current = undefined; setVoiceoverState("idle");
      setError(reason instanceof Error ? reason.message : "Microphone permission is required to record a voiceover.");
    }
  }

  function stopVoiceover() { if (voiceoverRecorder.current?.state !== "inactive") voiceoverRecorder.current?.stop(); }

  async function finishVoiceover(mimeType: string) {
    voiceoverStream.current?.getTracks().forEach((track) => track.stop()); voiceoverStream.current = undefined;
    const blob = new Blob(voiceoverChunks.current, { type: mimeType });
    setVoiceoverState("idle");
    if (!blob.size) { setError("No audible voiceover data was captured."); return; }
    try {
      const duration = await audioDuration(blob);
      const waveform = await createWaveform(blob);
      const asset: ProjectAsset = { id: crypto.randomUUID(), kind: "voiceover", name: `Voiceover ${project.audio.clips.filter((clip) => clip.trackType === "voiceover").length + 1}`, mimeType, chunkCount: 1, duration };
      await store.putChunk(project.id, asset.id, 0, blob);
      const clip: AudioClip = { id: crypto.randomUUID(), sourceId: asset.id, trackType: "voiceover", startTime: voiceoverTimelineStart.current, sourceIn: 0, sourceOut: duration, volume: 1, muted: false, fadeIn: .05, fadeOut: .1, waveform };
      commit((value) => ({ ...value, assets: [...value.assets, asset], audio: { ...value.audio, clips: [...value.audio.clips, clip] } }));
      setSelectedClipId(clip.id); setSelectedAudioTrack("voiceover"); setTool("audio");
    } catch { setError("The voiceover was captured but could not be decoded. Please try again."); }
  }

  function splitAtPlayhead() {
    if (selectedClip && currentTime > selectedClip.startTime && currentTime < selectedClip.startTime + selectedClip.sourceOut - selectedClip.sourceIn) {
      const splitOffset = currentTime - selectedClip.startTime;
      const second: AudioClip = { ...selectedClip, id: crypto.randomUUID(), startTime: currentTime, sourceIn: selectedClip.sourceIn + splitOffset };
      commit((value) => ({ ...value, audio: { ...value.audio, clips: value.audio.clips.flatMap((clip) => clip.id === selectedClip.id ? [{ ...clip, sourceOut: clip.sourceIn + splitOffset }, second] : [clip]) } }));
      setSelectedClipId(second.id); return;
    }
    commit((value) => ({ ...value, edits: [...value.edits, { type: "split", start: currentTime, end: currentTime }] }));
  }

  const presentationScale = project.presentation.scale * (1 - project.presentation.padding * 2);
  const screenStyle = { left: `${(1 - presentationScale) * project.presentation.x * 100}%`, top: `${(1 - presentationScale) * project.presentation.y * 100}%`, width: `${presentationScale * 100}%`, height: `${presentationScale * 100}%`, borderRadius: `${project.presentation.cornerRadius}px`, boxShadow: `0 ${16 * project.presentation.shadow}px ${54 * project.presentation.shadow}px rgba(0,0,0,.42)` };
  const backgroundStyle = project.background.type === "image" ? { backgroundImage: `url(${mediaUrls[project.background.assetId ?? ""] ?? ""})`, backgroundSize: project.background.fit === "fill" ? "cover" : "contain", backgroundPosition: "center", backgroundRepeat: "no-repeat", filter: `brightness(${project.background.brightness}) blur(${project.background.blur}px)` } : { background: project.background.value || project.canvas.background, filter: `brightness(${project.background.brightness})` };
  const cursorPosition = zoomTransformAt(project, currentTime);
  const cursorPreviewPoint = cursorPosition ? previewPointFromSource(project, currentTime, cursorPosition.x, cursorPosition.y) : null;
  const focalMarker = selectedZoom ? previewPointFromSource(project, currentTime, selectedZoom.x, selectedZoom.y) : null;
  const previewProject = tool === "crop" && !playing ? { ...project, crop: FULL_FRAME } : project;

  return <section className="editor" aria-label={`Editing ${project.title}`}>
    <header className="editor-header"><button className="text-button" onClick={onBack}>← Library</button><input aria-label="Recording title" value={project.title} onChange={(event) => setProject((value) => ({ ...value, title: event.target.value }))} /><div className="editor-actions"><button className="icon-button" onClick={undo} disabled={!history.length} aria-label="Undo"><HugeiconsIcon icon={Undo02Icon} size={17} /></button><button className="icon-button" onClick={redo} disabled={!future.length} aria-label="Redo"><HugeiconsIcon icon={Redo02Icon} size={17} /></button><button className="primary" onClick={() => { setExportName(project.title || formatExportFallback()); setShowExportDialog(true); }} disabled={exportProgress !== null}><HugeiconsIcon icon={Download04Icon} size={16} /> {exportProgress === null ? "Export MP4" : `${exportStage} ${Math.round(exportProgress * 100)}%`}</button></div></header>
    <div className="editor-workspace">
      <nav className="tool-rail" aria-label="Editor tools"><ToolButton icon={ImageCropIcon} label="Crop" active={tool === "crop"} onClick={() => setTool("crop")} /><ToolButton icon={PaintBrush01Icon} label="Present" active={tool === "presentation"} onClick={() => setTool("presentation")} /><ToolButton icon={ImageUploadIcon} label="Background" active={tool === "background"} onClick={() => setTool("background")} /><ToolButton icon={ZoomInAreaIcon} label="Zoom" active={tool === "zoom"} onClick={() => setTool("zoom")} /><ToolButton icon={Cursor01Icon} label="Cursor" active={tool === "cursor"} onClick={() => setTool("cursor")} /><ToolButton icon={VolumeHighIcon} label="Audio" active={tool === "audio"} onClick={() => setTool("audio")} /></nav>
      <div className="editor-stage-wrap">
        <div className={`editor-stage aspect-${project.canvas.aspectRatio.replace(":", "-")} background-${project.background.type}`} onClick={(event) => { if (tool !== "zoom" || !selectedZoom) return; const frame = event.currentTarget.querySelector<HTMLElement>(".video-frame"); const rect = frame?.getBoundingClientRect(); if (!rect || event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return; const point = sourcePointFromPreview(project, currentTime, (event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height); commit((value) => ({ ...value, zoomEvents: value.zoomEvents.map((zoom) => zoom.id === selectedZoom.id ? { ...zoom, ...point } : zoom) })); }}>
          <div className="editor-background" style={backgroundStyle} />
          {project.background.type === "blurred-source" && mediaUrls.video ? <video ref={backgroundVideoRef} className="blurred-source-background" src={mediaUrls.video} muted playsInline style={{ filter: `blur(${project.background.blur}px) brightness(${project.background.brightness})` }} /> : null}
          <div className={`video-frame frame-${project.presentation.frame}`} style={screenStyle}>
            {project.presentation.frame === "browser" || project.presentation.frame === "macos" ? <div className="window-frame-bar"><i /><i /><i /></div> : null}
            {mediaState === "ready" && mediaUrls.video ? <video ref={videoRef} src={mediaUrls.video} muted playsInline style={previewZoomStyle(previewProject, currentTime)} onError={() => { setMediaState("error"); setError("The primary local video could not be decoded by this browser."); }} onTimeUpdate={(event) => { const time = event.currentTarget.currentTime; setCurrentTime(time); syncAudio(time, !event.currentTarget.paused); if (cameraRef.current && Math.abs(cameraRef.current.currentTime - time) > .15) cameraRef.current.currentTime = time; if (backgroundVideoRef.current && Math.abs(backgroundVideoRef.current.currentTime - time) > .15) backgroundVideoRef.current.currentTime = time; }} onEnded={() => { setPlaying(false); pauseAudio(); }} /> : mediaState === "error" ? <div className="media-error"><strong>Local media could not be opened</strong><p>The recording may be missing from browser storage or use an unsupported format.</p><div><button className="secondary" onClick={() => { setError(""); setMediaState("loading"); setMediaRetry((value) => value + 1); }}>Retry</button><button className="text-button" onClick={onBack}>Return to Library</button></div></div> : <div className="loading-media">Loading local media…</div>}
            {mediaUrls.camera && project.camera.visible ? <CameraOverlay videoRef={cameraRef} src={mediaUrls.camera} project={project} commit={commit} /> : null}
            {tool === "crop" && !playing ? <CropOverlay rect={project.crop} onChange={(crop) => commit((value) => ({ ...value, crop }))} /> : null}
            {tool === "zoom" && selectedZoom && focalMarker ? <span className="zoom-focal" style={{ left: `${focalMarker.x * 100}%`, top: `${focalMarker.y * 100}%` }}>{selectedZoom.scale.toFixed(1)}×</span> : null}
          </div>
          {cursorPosition && cursorPreviewPoint && project.cursor.style !== "hidden" ? <span className={`editor-cursor cursor-${project.cursor.style}`} style={{ left: `${((1 - presentationScale) * project.presentation.x + presentationScale * cursorPreviewPoint.x) * 100}%`, top: `${((1 - presentationScale) * project.presentation.y + presentationScale * cursorPreviewPoint.y) * 100}%`, opacity: project.cursor.opacity, transform: `translate(-50%,-50%) scale(${project.cursor.size})`, filter: project.cursor.shadow ? "drop-shadow(0 3px 4px rgba(0,0,0,.55))" : "none" }} /> : null}
          {voiceoverState !== "idle" ? <div className="voiceover-overlay"><HugeiconsIcon icon={Mic01Icon} size={22} />{voiceoverState === "countdown" ? <strong>{countdown}</strong> : <><strong>Recording voiceover</strong><button onClick={stopVoiceover}>Stop</button></>}</div> : null}
        </div>
        <div className="transport"><button className="transport-play" onClick={togglePlayback} aria-label={playing ? "Pause" : "Play"}><HugeiconsIcon icon={playing ? PauseIcon : PlayIcon} size={19} /></button><time>{formatPrecise(currentTime)}</time><input aria-label="Playback position" type="range" min={0} max={Math.max(.1, project.duration)} step="0.01" value={currentTime} onChange={(event) => seek(Number(event.target.value))} /><time>{formatPrecise(project.duration)}</time></div>
      </div>
      <aside className="inspector" aria-label={`${tool} inspector`}><div className="inspector-scroll">{tool === "crop" ? <CropInspector project={project} commit={commit} /> : tool === "presentation" ? <PresentationInspector project={project} commit={commit} /> : tool === "background" ? <BackgroundInspector project={project} commit={commit} onChooseImage={() => backgroundInputRef.current?.click()} /> : tool === "zoom" ? <ZoomInspector project={project} selected={selectedZoom} add={addZoom} select={(id) => { setSelectedZoomId(id); const zoom = project.zoomEvents.find((item) => item.id === id); if (zoom) seek(zoom.time); }} commit={commit} /> : tool === "cursor" ? <CursorInspector project={project} commit={commit} /> : <AudioInspector project={project} trackType={selectedClip?.trackType ?? selectedAudioTrack} selectedClip={selectedClip} commit={commit} onSelectTrack={(type) => { setSelectedAudioTrack(type); setSelectedClipId(undefined); }} onRecord={voiceoverState === "idle" ? startVoiceover : stopVoiceover} recording={voiceoverState !== "idle"} microphones={microphones} microphoneId={voiceoverDevice} setMicrophoneId={setVoiceoverDevice} monitorOriginal={monitorOriginal} setMonitorOriginal={setMonitorOriginal} onImport={() => musicInputRef.current?.click()} onDeleteClip={() => { if (!selectedClip) return; commit((value) => ({ ...value, audio: { ...value.audio, clips: value.audio.clips.filter((clip) => clip.id !== selectedClip.id) } })); setSelectedClipId(undefined); }} onDuplicateClip={() => { if (!selectedClip) return; const duplicate = { ...selectedClip, id: crypto.randomUUID(), startTime: Math.min(project.duration, selectedClip.startTime + .5) }; commit((value) => ({ ...value, audio: { ...value.audio, clips: [...value.audio.clips, duplicate] } })); setSelectedClipId(duplicate.id); }} />}</div></aside>
    </div>
    <div className="timeline-panel"><div className="timeline-toolbar"><strong>Timeline</strong><button onClick={splitAtPlayhead}><HugeiconsIcon icon={ScissorIcon} size={15} /> Split</button><button onClick={() => { if (markOut > markIn) commit((value) => ({ ...value, edits: [...value.edits, { type: "delete", start: markIn, end: markOut }] })); }}><HugeiconsIcon icon={Delete02Icon} size={15} /> Delete range</button><button onClick={() => setMarkIn(currentTime)}>Set in</button><button onClick={() => setMarkOut(currentTime)}>Set out</button><span>{formatPrecise(markIn)} — {formatPrecise(markOut)}</span></div><TimelineView project={project} currentTime={currentTime} seek={seek} commit={commit} selectedClipId={selectedClipId} onSelectClip={(id) => { setSelectedClipId(id); if (id) { const clip = project.audio.clips.find((item) => item.id === id); if (clip) setSelectedAudioTrack(clip.trackType); setTool("audio"); } }} selectedZoomId={selectedZoomId} onSelectZoom={(id) => { setSelectedZoomId(id); setTool("zoom"); }} /><div className="trim-controls"><label>Trim start <input type="range" min={0} max={Math.max(project.duration, .1)} step=".1" value={project.trim.start} onChange={(event) => commit((value) => ({ ...value, trim: { ...value.trim, start: Math.min(Number(event.target.value), (value.trim.end ?? value.duration) - .1) } }))} /></label><label>Trim end <input type="range" min={0} max={Math.max(project.duration, .1)} step=".1" value={project.trim.end ?? project.duration} onChange={(event) => commit((value) => ({ ...value, trim: { ...value.trim, end: Math.max(Number(event.target.value), value.trim.start + .1) } }))} /></label></div></div>
    <input ref={backgroundInputRef} hidden type="file" accept="image/*" onChange={(event) => { void importBackground(event.target.files?.[0]); event.target.value = ""; }} /><input ref={musicInputRef} hidden type="file" accept="audio/*,.mp3,.wav,.m4a,.aac" onChange={(event) => { void importMusic(event.target.files?.[0]); event.target.value = ""; }} />
    {showExportDialog ? <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowExportDialog(false); }}><form className="export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title" onSubmit={(event) => { event.preventDefault(); void runExport(exportName); }}><h2 id="export-title">Export MP4</h2><p>Name the recording before choosing where to save it.</p><label className="field-label">File name<input autoFocus value={exportName} onChange={(event) => setExportName(event.target.value)} placeholder={formatExportFallback()} /></label><small>.mp4 is added automatically. Invalid filename characters are replaced.</small><div className="dialog-actions"><button type="button" className="secondary" onClick={() => setShowExportDialog(false)}>Cancel</button><button className="primary" type="submit">Choose save location</button></div></form></div> : null}
    {error ? <p className="editor-toast error-message" role="alert">{error}</p> : null}{receipt ? <p className="editor-toast success-message" role="status">Validated {receipt.videoCodec.toUpperCase()}{receipt.audioCodec ? ` + ${receipt.audioCodec.toUpperCase()} ${receipt.sampleRate! / 1000} kHz stereo` : ""} · {receipt.width}×{receipt.height} · {formatBytes(receipt.size)}</p> : null}
  </section>;
}

function ToolButton({ icon, label, active, onClick }: { icon: typeof ImageCropIcon; label: string; active: boolean; onClick: () => void }) { return <button className={active ? "active" : ""} onClick={onClick}><HugeiconsIcon icon={icon} size={19} /><span>{label}</span></button>; }
function CropOverlay({ rect, onChange }: { rect: NormalizedRect; onChange: (value: NormalizedRect) => void }) { const drag = useRef<{ x: number; y: number; rect: NormalizedRect; resize: boolean } | undefined>(undefined); const start = (event: React.PointerEvent, resize: boolean) => { event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, rect, resize }; event.stopPropagation(); }; const move = (event: React.PointerEvent) => { if (!drag.current) return; const bounds = event.currentTarget.parentElement!.getBoundingClientRect(); const dx = (event.clientX - drag.current.x) / bounds.width; const dy = (event.clientY - drag.current.y) / bounds.height; const base = drag.current.rect; onChange(clampRect(drag.current.resize ? { ...base, width: base.width + dx, height: base.height + dy } : { ...base, x: base.x + dx, y: base.y + dy })); }; return <div className="crop-overlay" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }} onPointerDown={(event) => start(event, false)} onPointerMove={move} onPointerUp={() => { drag.current = undefined; }}><i onPointerDown={(event) => start(event, true)} /></div>; }
function CameraOverlay({ videoRef, src, project, commit }: { videoRef: React.RefObject<HTMLVideoElement | null>; src: string; project: StudioProject; commit: Commit }) { const drag = useRef<{ x: number; y: number; rect: NormalizedRect; resize: boolean } | undefined>(undefined); const start = (event: React.PointerEvent, resize: boolean) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, rect: project.camera.rect, resize }; }; const move = (event: React.PointerEvent) => { if (!drag.current) return; const bounds = event.currentTarget.parentElement!.getBoundingClientRect(); const dx = (event.clientX - drag.current.x) / bounds.width; const dy = (event.clientY - drag.current.y) / bounds.height; const base = drag.current.rect; const rect = clampRect(drag.current.resize ? { ...base, width: base.width + dx, height: base.height + dy } : { ...base, x: base.x + dx, y: base.y + dy }); commit((value) => ({ ...value, camera: { ...value.camera, rect } })); }; return <div className={`editor-camera ${project.camera.shape}`} style={{ left: `${project.camera.rect.x * 100}%`, top: `${project.camera.rect.y * 100}%`, width: `${project.camera.rect.width * 100}%`, height: `${project.camera.rect.height * 100}%` }} onPointerDown={(event) => start(event, false)} onPointerMove={move} onPointerUp={() => { drag.current = undefined; }}><video ref={videoRef} src={src} muted playsInline /><i onPointerDown={(event) => start(event, true)} /></div>; }

function CropInspector({ project, commit }: { project: StudioProject; commit: Commit }) { return <><h2>Crop & canvas</h2><p>Drag the crop region or its lower-right handle. Source media remains untouched.</p><span className="inspector-label">Position</span><div className="preset-grid">{(["top", "bottom", "left", "right", "centre"] as const).map((preset) => <button key={preset} onClick={() => commit((value) => ({ ...value, crop: cropPreset(preset) }))}>{preset}</button>)}</div><span className="inspector-label">Crop ratio</span><div className="preset-grid"><button onClick={() => commit((value) => ({ ...value, crop: { x: 0, y: 0, width: 1, height: 1 } }))}>Free</button>{(["16:9", "9:16", "1:1", "4:5"] as const).map((ratio) => <button key={ratio} onClick={() => commit((value) => ({ ...value, crop: cropAspect(ratio) }))}>{ratio}</button>)}</div><label className="field-label">Canvas ratio<select value={project.canvas.aspectRatio} onChange={(event) => commit((value) => ({ ...value, canvas: { ...value.canvas, aspectRatio: event.target.value as StudioProject["canvas"]["aspectRatio"] } }))}><option>16:9</option><option>9:16</option><option>1:1</option><option>4:5</option><option value="original">Original</option></select></label><label className="field-label">Source fit<select value={project.canvas.fit} onChange={(event) => commit((value) => ({ ...value, canvas: { ...value.canvas, fit: event.target.value as StudioProject["canvas"]["fit"] } }))}><option value="fit">Fit</option><option value="fill">Fill</option></select></label><button className="secondary wide reset-crop" onClick={() => commit((value) => ({ ...value, crop: { x: 0, y: 0, width: 1, height: 1 } }))}>Reset crop</button>{project.mode === "screen-camera" ? <CameraControls project={project} commit={commit} /> : null}</>; }
function CameraControls({ project, commit }: { project: StudioProject; commit: Commit }) { return <><span className="inspector-label">Camera bubble</span><label className="check-row"><input type="checkbox" checked={project.camera.visible} onChange={(event) => commit((value) => ({ ...value, camera: { ...value.camera, visible: event.target.checked } }))} /> Visible</label><label className="field-label">Shape<select value={project.camera.shape} onChange={(event) => commit((value) => ({ ...value, camera: { ...value.camera, shape: event.target.value as StudioProject["camera"]["shape"] } }))}><option value="circle">Circle</option><option value="rounded">Rounded rectangle</option><option value="square">Square</option></select></label><Control label="Horizontal" value={project.camera.rect.x} min={0} max={Math.max(0, 1 - project.camera.rect.width)} step={.01} onChange={(x) => commit((value) => ({ ...value, camera: { ...value.camera, rect: { ...value.camera.rect, x } } }))} /><Control label="Vertical" value={project.camera.rect.y} min={0} max={Math.max(0, 1 - project.camera.rect.height)} step={.01} onChange={(y) => commit((value) => ({ ...value, camera: { ...value.camera, rect: { ...value.camera.rect, y } } }))} /><Control label="Size" value={project.camera.rect.width} min={.12} max={.4} step={.01} onChange={(width) => commit((value) => ({ ...value, camera: { ...value.camera, rect: clampRect({ ...value.camera.rect, width, height: width }) } }))} /></>; }
function PresentationInspector({ project, commit }: { project: StudioProject; commit: Commit }) { return <><h2>Presentation</h2><p>Place the recording inside a polished, non-destructive screen card.</p><button className="primary wide" onClick={() => commit((value) => ({ ...value, presentation: { scale: .86, x: .5, y: .5, padding: .06, cornerRadius: 18, shadow: .72, frame: "floating" } }))}>Auto presentation</button><label className="field-label">Frame<select value={project.presentation.frame} onChange={(event) => commit((value) => ({ ...value, presentation: { ...value.presentation, frame: event.target.value as StudioProject["presentation"]["frame"] } }))}><option value="none">None</option><option value="browser">Browser</option><option value="macos">macOS-style window</option><option value="floating">Floating window</option></select></label><Control label="Scale" value={project.presentation.scale} min={.5} max={1} step={.01} onChange={(scale) => commit((value) => ({ ...value, presentation: { ...value.presentation, scale } }))} /><Control label="Horizontal" value={project.presentation.x} min={0} max={1} step={.01} onChange={(x) => commit((value) => ({ ...value, presentation: { ...value.presentation, x } }))} /><Control label="Vertical" value={project.presentation.y} min={0} max={1} step={.01} onChange={(y) => commit((value) => ({ ...value, presentation: { ...value.presentation, y } }))} /><Control label="Padding" value={project.presentation.padding} min={0} max={.2} step={.01} onChange={(padding) => commit((value) => ({ ...value, presentation: { ...value.presentation, padding } }))} /><Control label="Corner radius" value={project.presentation.cornerRadius} min={0} max={48} step={1} onChange={(cornerRadius) => commit((value) => ({ ...value, presentation: { ...value.presentation, cornerRadius } }))} /><Control label="Shadow" value={project.presentation.shadow} min={0} max={1} step={.05} onChange={(shadow) => commit((value) => ({ ...value, presentation: { ...value.presentation, shadow } }))} /></>; }

const BACKGROUNDS = [{ name: "Violet dusk", type: "gradient", value: "linear-gradient(135deg, #7563ea 0%, #2b1d65 100%)" }, { name: "Ocean mesh", type: "wallpaper", value: "linear-gradient(135deg, #0c7289 0%, #193258 100%)" }, { name: "Sunset paper", type: "wallpaper", value: "linear-gradient(135deg, #d66d75 0%, #7452a6 100%)" }, { name: "Midnight", type: "color", value: "#161824" }] as const;
function BackgroundInspector({ project, commit, onChooseImage }: { project: StudioProject; commit: Commit; onChooseImage: () => void }) { return <><h2>Background</h2><p>Backgrounds and local images remain inside this browser project.</p><div className="background-presets">{BACKGROUNDS.map((preset) => <button key={preset.name} className={project.background.value === preset.value ? "active" : ""} style={{ background: preset.value }} onClick={() => commit((value) => ({ ...value, background: { ...value.background, type: preset.type, value: preset.value, assetId: undefined } }))}><span>{preset.name}</span></button>)}</div><button className="secondary wide" onClick={onChooseImage}><HugeiconsIcon icon={ImageUploadIcon} size={15} /> Choose local image</button><button className="secondary wide" onClick={() => commit((value) => ({ ...value, background: { ...value.background, type: "blurred-source", assetId: undefined } }))}>Use blurred source</button><label className="field-label">Type<select value={project.background.type} onChange={(event) => commit((value) => ({ ...value, background: { ...value.background, type: event.target.value as StudioProject["background"]["type"] } }))}><option value="color">Solid colour</option><option value="gradient">Gradient</option><option value="wallpaper">Graphic wallpaper</option><option value="image">Local image</option><option value="blurred-source">Blurred source</option></select></label>{project.background.type === "color" ? <label className="field-label">Colour<input type="color" value={project.background.value.startsWith("#") ? project.background.value : "#7563ea"} onChange={(event) => commit((value) => ({ ...value, background: { ...value.background, value: event.target.value } }))} /></label> : null}{project.background.type === "image" ? <label className="field-label">Image fit<select value={project.background.fit} onChange={(event) => commit((value) => ({ ...value, background: { ...value.background, fit: event.target.value as "fit" | "fill" } }))}><option value="fit">Fit</option><option value="fill">Fill</option></select></label> : null}<Control label="Blur" value={project.background.blur} min={0} max={60} step={1} onChange={(blur) => commit((value) => ({ ...value, background: { ...value.background, blur } }))} /><Control label="Brightness" value={project.background.brightness} min={.25} max={1.25} step={.05} onChange={(brightness) => commit((value) => ({ ...value, background: { ...value.background, brightness } }))} /></>; }
function ZoomInspector({ project, selected, add, select, commit }: { project: StudioProject; selected?: StudioProject["zoomEvents"][number]; add: () => void; select: (id: string) => void; commit: Commit }) { return <><h2>Zoom events</h2><p>Automatic click zooms appear when the captured Studio Recorder tab exposes reliable pointer coordinates. Manual zoom remains available.</p><button className="primary wide" onClick={add}><HugeiconsIcon icon={Add01Icon} size={16} /> Add manual zoom</button>{selected ? <><label className="check-row"><input type="checkbox" checked={selected.enabled !== false} onChange={(event) => commit((value) => ({ ...value, zoomEvents: value.zoomEvents.map((zoom) => zoom.id === selected.id ? { ...zoom, enabled: event.target.checked } : zoom) }))} /> Enabled</label><Control label="Start" value={selected.time} min={0} max={project.duration} step={.05} onChange={(time) => commit((value) => ({ ...value, zoomEvents: value.zoomEvents.map((zoom) => zoom.id === selected.id ? { ...zoom, time } : zoom) }))} /><Control label="Scale" value={selected.scale} min={1.1} max={2.5} step={.1} onChange={(scale) => commit((value) => ({ ...value, zoomEvents: value.zoomEvents.map((zoom) => zoom.id === selected.id ? { ...zoom, scale } : zoom) }))} /><Control label="Duration" value={selected.duration} min={.7} max={4} step={.1} onChange={(duration) => commit((value) => ({ ...value, zoomEvents: value.zoomEvents.map((zoom) => zoom.id === selected.id ? { ...zoom, duration } : zoom) }))} /><button className="secondary wide" onClick={() => { const duplicate = { ...selected, id: crypto.randomUUID(), time: Math.min(project.duration, selected.time + selected.duration) }; commit((value) => ({ ...value, zoomEvents: [...value.zoomEvents, duplicate] })); select(duplicate.id); }}>Duplicate zoom</button><button className="danger-link" onClick={() => commit((value) => ({ ...value, zoomEvents: value.zoomEvents.filter((zoom) => zoom.id !== selected.id) }))}>Delete zoom</button></> : <div className="empty-inspector">No zoom events yet.</div>}<div className="event-list">{project.zoomEvents.map((zoom) => <button key={zoom.id} onClick={() => select(zoom.id)}>{formatPrecise(zoom.time)} · {zoom.scale.toFixed(1)}× · {zoom.source === "automatic" ? "Auto" : "Manual"}</button>)}</div></>; }
function CursorInspector({ project, commit }: { project: StudioProject; commit: Commit }) { return <><h2>Cursor</h2><p>Cursor styling shares the zoom event timing used by preview and export.</p><label className="field-label">Style<select value={project.cursor.style} onChange={(event) => commit((value) => ({ ...value, cursor: { ...value.cursor, style: event.target.value as CursorStyle } }))}>{["system", "arrow", "dot", "large-dot", "circle", "hidden"].map((style) => <option key={style} value={style}>{style}</option>)}</select></label><Control label="Size" value={project.cursor.size} min={.5} max={2.5} step={.1} onChange={(size) => commit((value) => ({ ...value, cursor: { ...value.cursor, size } }))} /><Control label="Opacity" value={project.cursor.opacity} min={.1} max={1} step={.05} onChange={(opacity) => commit((value) => ({ ...value, cursor: { ...value.cursor, opacity } }))} /><Control label="Smoothing" value={project.cursor.smoothing} min={0} max={1} step={.05} onChange={(smoothing) => commit((value) => ({ ...value, cursor: { ...value.cursor, smoothing } }))} /><label className="check-row"><input type="checkbox" checked={project.cursor.shadow} onChange={(event) => commit((value) => ({ ...value, cursor: { ...value.cursor, shadow: event.target.checked } }))} /> Shadow</label></>; }
function AudioInspector({ project, trackType, selectedClip, commit, onSelectTrack, onRecord, recording, microphones, microphoneId, setMicrophoneId, monitorOriginal, setMonitorOriginal, onImport, onDeleteClip, onDuplicateClip }: { project: StudioProject; trackType: AudioTrackType; selectedClip?: AudioClip; commit: Commit; onSelectTrack: (type: AudioTrackType) => void; onRecord: () => void; recording: boolean; microphones: MediaDeviceInfo[]; microphoneId: string; setMicrophoneId: (id: string) => void; monitorOriginal: boolean; setMonitorOriginal: (value: boolean) => void; onImport: () => void; onDeleteClip: () => void; onDuplicateClip: () => void }) { const track = project.audio.tracks[trackType]; const updateTrack = (update: Partial<typeof track>) => commit((value) => ({ ...value, audio: { ...value.audio, tracks: { ...value.audio.tracks, [trackType]: { ...value.audio.tracks[trackType], ...update } } } })); const updateClip = (update: Partial<AudioClip>) => { if (!selectedClip) return; commit((value) => ({ ...value, audio: { ...value.audio, clips: value.audio.clips.map((clip) => clip.id === selectedClip.id ? { ...clip, ...update } : clip) } })); }; return <><h2>Audio mixer</h2><p>Original narration, computer audio, voiceovers, and music stay independent until export.</p><div className="audio-track-tabs">{(["microphone", "computer-audio", "voiceover", "music"] as const).map((type) => <button key={type} className={trackType === type ? "active" : ""} onClick={() => onSelectTrack(type)}>{audioTrackLabel(type)}</button>)}</div>{trackType === "voiceover" ? <><label className="field-label">Voiceover microphone<select value={microphoneId} onChange={(event) => setMicrophoneId(event.target.value)}><option value="">System default</option>{microphones.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}</select></label><label className="check-row"><input type="checkbox" checked={monitorOriginal} onChange={(event) => setMonitorOriginal(event.target.checked)} /> Hear existing audio while recording (headphones recommended)</label><button className={recording ? "stop-button wide" : "primary wide"} onClick={onRecord}><HugeiconsIcon icon={Mic01Icon} size={16} /> {recording ? "Stop voiceover" : "Record voiceover at playhead"}</button></> : null}{trackType === "music" ? <><button className="secondary wide" onClick={onImport}><HugeiconsIcon icon={MusicNote02Icon} size={16} /> Import local audio</button><label className="check-row"><input type="checkbox" checked={project.audio.ducking.enabled} onChange={(event) => commit((value) => ({ ...value, audio: { ...value.audio, ducking: { ...value.audio.ducking, enabled: event.target.checked } } }))} /> Auto duck music under narration</label><label className="field-label">Ducking amount<select value={project.audio.ducking.amount} onChange={(event) => commit((value) => ({ ...value, audio: { ...value.audio, ducking: { ...value.audio.ducking, amount: event.target.value as "light" | "medium" | "strong" } } }))}><option value="light">Light</option><option value="medium">Medium</option><option value="strong">Strong</option></select></label></> : null}<span className="inspector-label">{audioTrackLabel(trackType)} track</span><label className="check-row"><input type="checkbox" checked={track.muted} onChange={(event) => updateTrack({ muted: event.target.checked })} /> Mute</label><label className="check-row"><input type="checkbox" checked={track.solo} onChange={(event) => updateTrack({ solo: event.target.checked })} /> Solo</label><Control label="Track volume" value={track.volume} min={0} max={1.5} step={.05} onChange={(volume) => updateTrack({ volume })} /><Control label="Track fade in" value={track.fadeIn} min={0} max={5} step={.1} onChange={(fadeIn) => updateTrack({ fadeIn })} /><Control label="Track fade out" value={track.fadeOut} min={0} max={5} step={.1} onChange={(fadeOut) => updateTrack({ fadeOut })} />{selectedClip ? <><span className="inspector-label">Selected clip</span><Control label="Start time" value={selectedClip.startTime} min={0} max={project.duration} step={.05} onChange={(startTime) => updateClip({ startTime })} /><Control label="Clip volume" value={selectedClip.volume} min={0} max={1.5} step={.05} onChange={(volume) => updateClip({ volume })} /><Control label="Fade in" value={selectedClip.fadeIn} min={0} max={5} step={.1} onChange={(fadeIn) => updateClip({ fadeIn })} /><Control label="Fade out" value={selectedClip.fadeOut} min={0} max={5} step={.1} onChange={(fadeOut) => updateClip({ fadeOut })} /><button className="secondary wide" onClick={onDuplicateClip}>Duplicate clip</button><button className="danger-link" onClick={onDeleteClip}>Delete clip</button></> : null}</>; }
function Control({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) { return <label className="control"><span>{label}<output>{value.toFixed(step < .1 ? 2 : 1)}</output></span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>; }

async function buildMediaUrls(store: LocalProjectStore, projectId: string, mode: StudioProject["mode"], sources: StudioProject["sources"], assets: StudioProject["assets"]): Promise<Record<string, string>> { const output: Record<string, string> = {}; const videoKind = primaryVideoSourceKind(mode); const kinds = [videoKind, ...(videoKind === "camera" ? [] : ["camera"]), "microphone", "computer-audio"] as const; for (const kind of kinds) { const descriptor = sources.find((source) => source.kind === kind); if (!descriptor) continue; const chunks = await store.getChunks(projectId, kind); if (chunks.length) output[kind === videoKind ? "video" : kind] = URL.createObjectURL(new Blob(chunks, { type: descriptor.mimeType })); } for (const asset of assets) { const chunks = await store.getChunks(projectId, asset.id); if (chunks.length) output[asset.id] = URL.createObjectURL(new Blob(chunks, { type: asset.mimeType })); } return output; }
async function audioDuration(blob: Blob): Promise<number> { const context = new AudioContext(); try { return (await context.decodeAudioData(await blob.arrayBuffer())).duration; } finally { await context.close(); } }
const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const formatPrecise = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
const formatBytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
