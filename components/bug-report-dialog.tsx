"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024;

export function BugReportDialog({ open, onClose, context }: { open: boolean; onClose: () => void; context: string }) {
  const [email, setEmail] = useState("");
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState<string>();
  const [screenshotName, setScreenshotName] = useState<string>();
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");
  const startedAt = useRef(0);
  const technical = typeof window === "undefined" ? {} : { browser: navigator.userAgent, platform: navigator.platform, page: context, path: location.pathname, viewport: `${window.innerWidth}x${window.innerHeight}`, theme: document.documentElement.dataset.theme || "system", version: process.env.NEXT_PUBLIC_APP_VERSION || "development" };
  useEffect(() => {
    if (!open) return;
    startedAt.current = Date.now();
  }, [context, open]);
  if (!open) return null;

  const payload = () => JSON.stringify({ email, description, screenshot, screenshotName, technical: { ...technical, timestamp: new Date().toISOString() }, startedAt: startedAt.current, website: "" }, null, 2);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setStatus("sending"); setMessage("");
    try {
      const response = await fetch("/api/bug-report", { method: "POST", headers: { "content-type": "application/json" }, body: payload() });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "The report could not be sent.");
      setStatus("sent"); setMessage("Report sent. Thank you for helping improve Studio Recorder.");
    } catch (reason) { setStatus("error"); setMessage(reason instanceof Error ? reason.message : "The report could not be sent."); }
  }
  async function chooseScreenshot(file?: File) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > MAX_SCREENSHOT_BYTES) { setStatus("error"); setMessage("Choose a PNG, JPEG, or WebP screenshot no larger than 2 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => { setScreenshot(String(reader.result)); setScreenshotName(file.name); setStatus("idle"); setMessage(""); };
    reader.readAsDataURL(file);
  }
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="bug-report-dialog" role="dialog" aria-modal="true" aria-labelledby="bug-report-title" onSubmit={submit}>
      <h2 id="bug-report-title">Report a bug</h2><p>Describe what happened. Your recordings and project media are never attached automatically.</p>
      <label className="field-label">Email (optional)<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
      <label className="field-label">What happened?<textarea required minLength={20} maxLength={5000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What did you expect, and what happened instead?" /></label>
      <label className="field-label file-button">Screenshot (optional)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void chooseScreenshot(event.target.files?.[0])} /><span className="secondary">Choose screenshot</span></label>
      {screenshot ? <div className="bug-screenshot"><Image src={screenshot} alt="Screenshot preview" width={150} height={90} unoptimized /><button type="button" className="text-button" onClick={() => { setScreenshot(undefined); setScreenshotName(undefined); }}>Remove</button></div> : null}
      <details><summary>Technical details included</summary><pre>{JSON.stringify(technical, null, 2)}</pre></details>
      {message ? <p className={status === "sent" ? "supported" : "unsupported"} role="status">{message}</p> : null}
      <div className="dialog-actions"><button type="button" className="text-button" onClick={() => void navigator.clipboard.writeText(payload())}>Copy report</button><button type="button" className="secondary" onClick={onClose}>Close</button><button className="primary" disabled={status === "sending" || description.trim().length < 20}>{status === "sending" ? "Sending…" : status === "error" ? "Retry" : "Send report"}</button></div>
    </form>
  </div>;
}
