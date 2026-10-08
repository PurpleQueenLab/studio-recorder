"use client";

import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Camera01Icon, ComputerIcon, Mic01Icon, PauseIcon, PlayIcon, RecordIcon, StopIcon } from "@hugeicons/core-free-icons";
import { CaptureEngine } from "@/lib/media/capture-engine";
import type { CaptureAudioStatus } from "@/lib/media/capture-engine";
import { configureStudioCaptureHandle } from "@/lib/media/pointer-capture";
import { closeCameraMonitor, openCameraMonitor } from "@/lib/media/camera-monitor";
import { DEFAULT_CAPTURE_QUALITY, qualityLabel, RESOLUTION_PRESETS, type QualitySupport } from "@/lib/media/quality";
import { LocalProjectStore } from "@/lib/storage/project-store";
import type { CaptureFrameRate, CaptureQuality, CaptureQualityLevel, CaptureResolution, RecordingMode } from "@/types/project";
import type { StudioProject } from "@/types/project";

type Status = "idle" | "requesting" | "ready" | "recording" | "paused" | "saving" | "stopped";
type CameraPreviewState = "not-requested" | "loading" | "ready" | "denied" | "disconnected";

export function RecordingPanel({ onSaved }: { onSaved: (project: StudioProject) => void }) {
  const [mode, setMode] = useState<RecordingMode>("screen-camera");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [audioStatus, setAudioStatus] = useState<CaptureAudioStatus>();
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [microphoneId, setMicrophoneId] = useState("");
  const [cameraId, setCameraId] = useState("");
  const [cameraPreviewState, setCameraPreviewState] = useState<CameraPreviewState>("not-requested");
  const [pointerDiagnostic, setPointerDiagnostic] = useState<{ count: number; time: number; x: number; y: number }>();
  const [quality, setQuality] = useState<CaptureQuality>({ ...DEFAULT_CAPTURE_QUALITY });
  const [qualityOpen, setQualityOpen] = useState(false);
  const [keepCameraVisible, setKeepCameraVisible] = useState(true);
  const [cameraMonitorMessage, setCameraMonitorMessage] = useState("");
  const [qualitySupport, setQualitySupport] = useState<QualitySupport>({ resolutions: ["1080p"], frameRates: [30], verified: false });
  const previewRef = useRef<HTMLVideoElement>(null);
  const cameraRef = useRef<HTMLVideoElement>(null);
  const [engine] = useState(() => new CaptureEngine(new LocalProjectStore(), {
    onState: setStatus,
    onError: setError,
    onAudioStatus: setAudioStatus,
    onPointerDiagnostic: setPointerDiagnostic,
  }));

  useEffect(() => { configureStudioCaptureHandle(); }, []);
  useEffect(() => () => { void closeCameraMonitor(); engine.dispose(); }, [engine]);
  useEffect(() => { void refreshDevices(); }, []);
  useEffect(() => {
    if (status !== "recording") return;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1_000);
    return () => clearInterval(timer);
  }, [status]);
  useEffect(() => {
    if (cameraPreviewState !== "ready" || !engine.streams.camera) return;
    if (mode === "camera" && previewRef.current) previewRef.current.srcObject = engine.streams.camera;
    if (mode === "screen-camera" && cameraRef.current) cameraRef.current.srcObject = engine.streams.camera;
  }, [cameraPreviewState, engine, mode]);

  async function refreshDevices() {
    try {
      const devices = await navigator.mediaDevices?.enumerateDevices() ?? [];
      setMicrophones(devices.filter((device) => device.kind === "audioinput"));
      setCameras(devices.filter((device) => device.kind === "videoinput"));
    } catch { setMicrophones([]); setCameras([]); }
  }

  async function requestCameraPreview(targetMode = mode, deviceId = cameraId) {
    if (targetMode === "screen") return;
    setCameraPreviewState("loading"); setError("");
    try {
      const stream = await engine.prepareCameraPreview(deviceId || undefined, quality);
      const track = stream.getVideoTracks()[0];
      track.addEventListener("ended", () => setCameraPreviewState("disconnected"), { once: true });
      if (targetMode === "camera" && previewRef.current) previewRef.current.srcObject = stream;
      if (targetMode === "screen-camera" && cameraRef.current) cameraRef.current.srcObject = stream;
      setCameraPreviewState("ready");
      setQualitySupport(engine.qualitySupport);
      await refreshDevices();
    } catch (reason) {
      const denied = reason instanceof DOMException && reason.name === "NotAllowedError";
      setCameraPreviewState(denied ? "denied" : "disconnected");
      setError(denied ? "Camera permission was denied. Allow camera access in the browser and retry." : reason instanceof Error ? reason.message : "The selected camera could not be opened.");
    }
  }

  function selectMode(value: RecordingMode) {
    setMode(value); setError("");
    if (value === "screen") { engine.releaseCameraPreview(); setCameraPreviewState("not-requested"); setQualitySupport({ resolutions: ["1080p"], frameRates: [30], verified: false }); setQuality({ ...DEFAULT_CAPTURE_QUALITY }); if (previewRef.current) previewRef.current.srcObject = null; }
    else void requestCameraPreview(value);
  }

  async function updateQuality(next: CaptureQuality) {
    if (status === "ready") {
      const actual = await engine.updateQuality(next);
      setQuality(actual);
      setQualitySupport(engine.qualitySupport);
    } else {
      setQuality(next);
      if (cameraPreviewState === "ready") await engine.prepareCameraPreview(cameraId || undefined, next);
    }
  }

  async function prepare() {
    setError("");
    setPointerDiagnostic(undefined);
    setElapsed(0);
    try {
      await engine.prepare(mode, true, microphoneId || undefined, cameraId || undefined, quality);
      setQuality(engine.activeQuality);
      setQualitySupport(engine.qualitySupport);
      await refreshDevices();
      if (previewRef.current) previewRef.current.srcObject = engine.streams.screen ?? engine.streams.camera ?? null;
      if (cameraRef.current) cameraRef.current.srcObject = engine.streams.camera ?? null;
    } catch { /* A readable message is set by the engine. */ }
  }

  async function startRecording() {
    setError(""); setCameraMonitorMessage("");
    if (mode === "screen-camera" && keepCameraVisible && cameraRef.current) {
      const result = await openCameraMonitor(cameraRef.current);
      if (result.message) setCameraMonitorMessage(result.message);
    }
    try { await engine.start(); }
    catch (reason) { await closeCameraMonitor(); setError(reason instanceof Error ? reason.message : "Recording could not start."); }
  }

  async function stopRecording() {
    await closeCameraMonitor();
    try { const saved = await engine.stop(); if (saved) onSaved(saved); }
    catch { /* The capture engine exposes a durable-storage error in the panel. */ }
  }

  const time = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  return <section className="recording-workspace" aria-labelledby="record-heading">
    <div className="section-heading">
      <div><p className="eyebrow">Local capture</p><h1 id="record-heading">Create a recording</h1><p>Choose your sources, preview them, then record. Nothing leaves this device.</p></div>
      <span className="privacy-pill"><span /> Saved locally</span>
    </div>

    <div className="mode-tabs" role="radiogroup" aria-label="Recording mode">
      {(["screen", "screen-camera", "camera"] as const).map((value) => <button key={value} role="radio" aria-checked={mode === value} className={mode === value ? "active" : ""} onClick={() => selectMode(value)} disabled={status !== "idle" && status !== "stopped"}>
        <HugeiconsIcon icon={value === "camera" ? Camera01Icon : ComputerIcon} size={18} />
        {value === "screen" ? "Screen" : value === "camera" ? "Camera" : "Screen + camera"}
      </button>)}
    </div>

    <div className="capture-grid">
      <div className="preview-stage">
        <video ref={previewRef} autoPlay muted playsInline />
        {(status === "idle" || status === "stopped") && mode !== "camera" && <div className="preview-empty"><span className="preview-icon"><HugeiconsIcon icon={RecordIcon} size={26} /></span><h2>{mode === "screen-camera" && cameraPreviewState === "ready" ? "Camera ready" : "Ready when you are"}</h2><p>Choose a screen, window, or tab to place behind the camera preview.</p></div>}
        {(status === "idle" || status === "stopped") && mode === "camera" && cameraPreviewState !== "ready" ? <CameraPreviewMessage state={cameraPreviewState} retry={() => void requestCameraPreview("camera")} /> : null}
        {mode === "screen-camera" ? cameraPreviewState === "ready" ? <video className="camera-bubble" ref={cameraRef} autoPlay muted playsInline /> : <div className="camera-bubble camera-preview-state"><span>{cameraPreviewLabel(cameraPreviewState)}</span></div> : null}
        {(status === "recording" || status === "paused") && <div className="recording-hud"><span className="record-dot" /> <strong>{status === "paused" ? "PAUSED" : "REC"}</strong><time>{time}</time></div>}
      </div>

      <aside className="source-panel">
        <h2>Recording setup</h2>
        <SourceRow icon={ComputerIcon} title={mode === "camera" ? "Camera only" : "Screen source"} detail={status === "ready" || status === "recording" ? "Source selected" : "Choose after continuing"} enabled />
        {mode !== "screen" ? <div className="camera-source-control"><SourceRow icon={Camera01Icon} title="Camera" detail={status === "recording" || status === "paused" ? "Camera recording" : cameraPreviewLabel(cameraPreviewState)} enabled={cameraPreviewState === "ready"} />
          <label>Camera<select value={cameraId} onChange={(event) => { const id = event.target.value; setCameraId(id); void requestCameraPreview(mode, id); }} disabled={status !== "idle" && status !== "stopped"}><option value="">System default</option>{cameras.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}</select></label>
          {cameraPreviewState !== "ready" && cameraPreviewState !== "loading" ? <button className="secondary camera-retry" onClick={() => void requestCameraPreview()}>Enable camera preview</button> : null}</div> : null}
        <div className="audio-source-control"><SourceRow icon={Mic01Icon} title="Microphone" detail={audioStatus?.microphone.available ? `${audioStatus.microphone.label || "Microphone"} · live` : status === "idle" || status === "requesting" ? "Checked after permission is granted" : "No live microphone track"} enabled={audioStatus?.microphone.available ?? status === "idle"} />
          <label>Input<select value={microphoneId} onChange={(event) => setMicrophoneId(event.target.value)} disabled={status !== "idle" && status !== "stopped"}><option value="">System default</option>{microphones.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}</select></label>
          <AudioLevelMeter stream={engine.streams.microphone} active={Boolean(audioStatus?.microphone.available)} />
        </div>
        <SourceRow icon={ComputerIcon} title="Computer audio" detail={mode === "camera" ? "Off for camera mode" : audioStatus?.computerAudio.available ? `${audioStatus.computerAudio.label || "Shared audio"} · live` : status === "idle" || status === "requesting" ? "Availability depends on the selected source" : "Computer audio was not shared by the browser"} enabled={mode !== "camera" && Boolean(audioStatus?.computerAudio.available)} />
        {status === "ready" && mode !== "camera" && !audioStatus?.computerAudio.available ? <p className="source-warning">The browser did not provide a system-audio track. Microphone narration will still be recorded.</p> : null}
        {status === "ready" ? <p className="source-diagnostic">{audioStatus?.pointerMetadata ? "Automatic click zoom is available for this Studio Recorder tab capture." : "This source does not expose reliable click coordinates; manual zoom remains available."}</p> : null}
        {mode === "screen-camera" ? <><label className="check-row"><input type="checkbox" checked={keepCameraVisible} onChange={(event) => setKeepCameraVisible(event.target.checked)} disabled={status === "recording" || status === "paused" || status === "saving"} /> Keep camera visible while recording</label><p className="source-warning">Floating camera may appear in an entire-screen recording. Window or tab capture is recommended.</p></> : null}
        {cameraMonitorMessage ? <p className="source-diagnostic" role="status">{cameraMonitorMessage}</p> : null}
        {process.env.NODE_ENV === "development" && pointerDiagnostic ? <p className="source-diagnostic" aria-live="polite">Captured click {pointerDiagnostic.count}: {formatDiagnosticTime(pointerDiagnostic.time)} · x {pointerDiagnostic.x.toFixed(2)} · y {pointerDiagnostic.y.toFixed(2)}</p> : null}
        <div className="quality-row"><span><small>Quality</small><strong>{qualityLabel(quality)}</strong></span><button type="button" aria-expanded={qualityOpen} onClick={() => setQualityOpen((value) => !value)} disabled={status === "requesting" || status === "recording" || status === "paused"}>{qualityOpen ? "Done" : "Change"}</button></div>
        {qualityOpen ? <QualityChooser quality={quality} support={qualitySupport} onChange={(next) => void updateQuality(next)} /> : null}
        {error && <p className="error-message" role="alert">{error}</p>}
        {status === "idle" || status === "stopped" ? <button className="primary wide" onClick={prepare}>Choose sources</button> : status === "requesting" ? <button className="primary wide" disabled>Waiting for browser permission…</button> : status === "saving" ? <button className="primary wide" disabled>Saving recording locally...</button> : status === "ready" ? <button className="primary wide" onClick={() => void startRecording()}>Start recording</button> : <div className="record-actions">
          <button className="secondary" aria-label={status === "paused" ? "Resume" : "Pause"} onClick={() => status === "paused" ? engine.resume() : engine.pause()}><HugeiconsIcon icon={status === "paused" ? PlayIcon : PauseIcon} size={18} /></button>
          <button className="stop-button" onClick={() => void stopRecording()}><HugeiconsIcon icon={StopIcon} size={17} /> Stop</button>
        </div>}
        <p className="storage-note">Recording chunks are written to browser storage every 2 seconds to keep memory bounded.</p>
      </aside>
    </div>
  </section>;
}

function QualityChooser({ quality, support, onChange }: { quality: CaptureQuality; support: QualitySupport; onChange: (quality: CaptureQuality) => void }) {
  const setResolution = (resolution: CaptureResolution) => onChange({ ...quality, resolution, ...RESOLUTION_PRESETS[resolution] });
  return <fieldset className="quality-chooser"><legend>Capture quality</legend>
    <label>Resolution<select aria-label="Capture resolution" value={quality.resolution} onChange={(event) => setResolution(event.target.value as CaptureResolution)}>{support.resolutions.map((resolution) => <option key={resolution} value={resolution}>{RESOLUTION_PRESETS[resolution].label}</option>)}</select></label>
    <label>Frame rate<select aria-label="Capture frame rate" value={quality.frameRate} onChange={(event) => onChange({ ...quality, frameRate: Number(event.target.value) as CaptureFrameRate })}>{support.frameRates.map((frameRate) => <option key={frameRate} value={frameRate}>{frameRate} FPS</option>)}</select></label>
    <label>Profile<select aria-label="Capture quality profile" value={quality.level} onChange={(event) => onChange({ ...quality, level: event.target.value as CaptureQualityLevel })}><option value="optimized">Optimized</option><option value="high">High</option><option value="maximum">Maximum</option></select></label>
    <small>{support.verified ? "Options reflect the active device/source capabilities." : "Higher modes appear only after this browser verifies the active source."}</small>
  </fieldset>;
}

function formatDiagnosticTime(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
}

function SourceRow({ icon, title, detail, enabled }: { icon: typeof ComputerIcon; title: string; detail: string; enabled: boolean }) {
  return <div className="source-row"><span className="source-icon"><HugeiconsIcon icon={icon} size={18} /></span><span><strong>{title}</strong><small>{detail}</small></span><span className={`toggle ${enabled ? "on" : ""}`} aria-label={enabled ? "Enabled" : "Disabled"}><i /></span></div>;
}

function CameraPreviewMessage({ state, retry }: { state: CameraPreviewState; retry: () => void }) {
  return <div className="preview-empty camera-message"><span className="preview-icon"><HugeiconsIcon icon={Camera01Icon} size={26} /></span><h2>{cameraPreviewLabel(state)}</h2><p>{state === "denied" ? "Allow camera access in browser settings, then retry." : state === "disconnected" ? "Reconnect or choose another camera." : "Enable the camera to frame yourself before recording."}</p>{state !== "loading" ? <button className="secondary" onClick={retry}>Retry camera</button> : null}</div>;
}

function cameraPreviewLabel(state: CameraPreviewState): string {
  if (state === "loading") return "Loading camera…";
  if (state === "ready") return "Live preview ready";
  if (state === "denied") return "Camera permission denied";
  if (state === "disconnected") return "Camera disconnected";
  return "Camera permission not requested";
}

function AudioLevelMeter({ stream, active }: { stream?: MediaStream; active: boolean }) {
  const [levels, setLevels] = useState([.08, .08, .08, .08, .08, .08, .08, .08]);
  useEffect(() => {
    if (!stream || !active || !stream.getAudioTracks().length) return;
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    context.createMediaStreamSource(new MediaStream(stream.getAudioTracks())).connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let frame = 0;
    const update = () => {
      analyser.getByteFrequencyData(data);
      const bucket = Math.floor(data.length / 8);
      setLevels(Array.from({ length: 8 }, (_, index) => Math.max(.08, Math.min(1, data.slice(index * bucket, (index + 1) * bucket).reduce((sum, value) => sum + value, 0) / Math.max(1, bucket) / 140))));
      frame = requestAnimationFrame(update);
    };
    void context.resume().then(update);
    return () => { cancelAnimationFrame(frame); void context.close(); };
  }, [active, stream]);
  return <div className="audio-meter" aria-label={active ? "Live microphone level" : "Microphone level unavailable"}>{levels.map((level, index) => <i key={index} style={{ height: `${Math.round(level * 100)}%` }} />)}</div>;
}
