"use client";

import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Camera01Icon, ComputerIcon, Mic01Icon, PauseIcon, PlayIcon, RecordIcon, StopIcon } from "@hugeicons/core-free-icons";
import { CaptureEngine } from "@/lib/media/capture-engine";
import { LocalProjectStore } from "@/lib/storage/project-store";
import type { RecordingMode } from "@/types/project";

type Status = "idle" | "requesting" | "ready" | "recording" | "paused" | "stopped";

export function RecordingPanel({ onSaved }: { onSaved: () => void }) {
  const [mode, setMode] = useState<RecordingMode>("screen-camera");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const previewRef = useRef<HTMLVideoElement>(null);
  const cameraRef = useRef<HTMLVideoElement>(null);
  const [engine] = useState(() => new CaptureEngine(new LocalProjectStore(), {
    onState: setStatus,
    onError: setError,
  }));

  useEffect(() => () => engine.dispose(), [engine]);
  useEffect(() => {
    if (status !== "recording") return;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1_000);
    return () => clearInterval(timer);
  }, [status]);

  async function prepare() {
    setError("");
    setElapsed(0);
    try {
      await engine.prepare(mode);
      if (previewRef.current) previewRef.current.srcObject = engine.streams.screen ?? engine.streams.camera ?? null;
      if (cameraRef.current) cameraRef.current.srcObject = engine.streams.camera ?? null;
    } catch { /* A readable message is set by the engine. */ }
  }

  const time = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  return <section className="recording-workspace" aria-labelledby="record-heading">
    <div className="section-heading">
      <div><p className="eyebrow">Local capture</p><h1 id="record-heading">Create a recording</h1><p>Choose your sources, preview them, then record. Nothing leaves this device.</p></div>
      <span className="privacy-pill"><span /> Saved locally</span>
    </div>

    <div className="mode-tabs" role="radiogroup" aria-label="Recording mode">
      {(["screen", "screen-camera", "camera"] as const).map((value) => <button key={value} role="radio" aria-checked={mode === value} className={mode === value ? "active" : ""} onClick={() => setMode(value)} disabled={status !== "idle" && status !== "stopped"}>
        <HugeiconsIcon icon={value === "camera" ? Camera01Icon : ComputerIcon} size={18} />
        {value === "screen" ? "Screen" : value === "camera" ? "Camera" : "Screen + camera"}
      </button>)}
    </div>

    <div className="capture-grid">
      <div className="preview-stage">
        <video ref={previewRef} autoPlay muted playsInline />
        {(status === "idle" || status === "stopped") && <div className="preview-empty"><span className="preview-icon"><HugeiconsIcon icon={RecordIcon} size={26} /></span><h2>Ready when you are</h2><p>Your browser will ask which screen, window, or tab to share.</p></div>}
        {mode === "screen-camera" && <video className="camera-bubble" ref={cameraRef} autoPlay muted playsInline />}
        {(status === "recording" || status === "paused") && <div className="recording-hud"><span className="record-dot" /> <strong>{status === "paused" ? "PAUSED" : "REC"}</strong><time>{time}</time></div>}
      </div>

      <aside className="source-panel">
        <h2>Recording setup</h2>
        <SourceRow icon={ComputerIcon} title={mode === "camera" ? "Camera only" : "Screen source"} detail={status === "ready" || status === "recording" ? "Source selected" : "Choose after continuing"} enabled />
        {mode !== "screen" && <SourceRow icon={Camera01Icon} title="Camera" detail="Default camera" enabled />}
        <SourceRow icon={Mic01Icon} title="Microphone" detail="System default" enabled />
        <SourceRow icon={ComputerIcon} title="Computer audio" detail={mode === "camera" ? "Off for camera mode" : "Available when shared by browser"} enabled={mode !== "camera"} />
        <div className="quality-row"><span><small>Quality</small><strong>1080p · 30 FPS</strong></span><button type="button">Change</button></div>
        {error && <p className="error-message" role="alert">{error}</p>}
        {status === "idle" || status === "stopped" ? <button className="primary wide" onClick={prepare}>Choose sources</button> : status === "ready" ? <button className="primary wide" onClick={() => engine.start()}>Start recording</button> : <div className="record-actions">
          <button className="secondary" aria-label={status === "paused" ? "Resume" : "Pause"} onClick={() => status === "paused" ? engine.resume() : engine.pause()}><HugeiconsIcon icon={status === "paused" ? PlayIcon : PauseIcon} size={18} /></button>
          <button className="stop-button" onClick={async () => { await engine.stop(); onSaved(); }}><HugeiconsIcon icon={StopIcon} size={17} /> Stop</button>
        </div>}
        <p className="storage-note">Recording chunks are written to browser storage every 2 seconds to keep memory bounded.</p>
      </aside>
    </div>
  </section>;
}

function SourceRow({ icon, title, detail, enabled }: { icon: typeof ComputerIcon; title: string; detail: string; enabled: boolean }) {
  return <div className="source-row"><span className="source-icon"><HugeiconsIcon icon={icon} size={18} /></span><span><strong>{title}</strong><small>{detail}</small></span><span className={`toggle ${enabled ? "on" : ""}`} aria-label={enabled ? "Enabled" : "Disabled"}><i /></span></div>;
}
