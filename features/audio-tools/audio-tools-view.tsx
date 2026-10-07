"use client";

import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { MusicNote02Icon, PauseIcon, PlayIcon, Upload01Icon } from "@hugeicons/core-free-icons";
import { createWaveform } from "@/lib/media/audio-mixer";

export function AudioToolsView() {
  const [audio, setAudio] = useState<{ name: string; url: string; duration: number; waveform: number[] }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [volume, setVolume] = useState(1);
  const [fadeIn, setFadeIn] = useState(0);
  const [fadeOut, setFadeOut] = useState(0);
  const elementRef = useRef<HTMLAudioElement>(null);

  useEffect(() => () => { if (audio?.url) URL.revokeObjectURL(audio.url); }, [audio?.url]);
  useEffect(() => {
    if (!playing || !audio || !elementRef.current) return;
    let frame = 0;
    const update = () => {
      const element = elementRef.current;
      if (!element) return;
      if (element.currentTime >= trimEnd) { element.pause(); element.currentTime = trimStart; setPlaying(false); return; }
      const elapsed = element.currentTime - trimStart;
      const remaining = trimEnd - element.currentTime;
      const fadeGain = Math.min(1, fadeIn > 0 ? elapsed / fadeIn : 1, fadeOut > 0 ? remaining / fadeOut : 1);
      element.volume = Math.max(0, Math.min(1, volume * fadeGain));
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [audio, fadeIn, fadeOut, playing, trimEnd, trimStart, volume]);

  async function importAudio(file?: File) {
    if (!file) return;
    setLoading(true); setError(""); setPlaying(false);
    try {
      const [duration, waveform] = await Promise.all([readAudioDuration(file), createWaveform(file, 160)]);
      if (audio?.url) URL.revokeObjectURL(audio.url);
      const url = URL.createObjectURL(file);
      setAudio({ name: file.name, url, duration, waveform });
      setTrimStart(0); setTrimEnd(duration); setVolume(1); setFadeIn(0); setFadeOut(0);
    } catch { setError("This audio file could not be decoded. Try MP3, WAV, M4A, AAC, or WebM audio."); }
    finally { setLoading(false); }
  }

  async function togglePreview() {
    const element = elementRef.current;
    if (!element || !audio) return;
    if (element.paused) { if (element.currentTime < trimStart || element.currentTime >= trimEnd) element.currentTime = trimStart; await element.play(); setPlaying(true); }
    else { element.pause(); setPlaying(false); }
  }

  return <section className="audio-tools-view" aria-labelledby="audio-tools-heading"><div className="section-heading"><div><h1 id="audio-tools-heading">Audio tools</h1><p>Preview and refine a local audio file. Nothing is uploaded.</p></div><label className="primary file-button"><HugeiconsIcon icon={Upload01Icon} size={16} /> {loading ? "Reading audio…" : "Import local audio"}<input type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.webm" disabled={loading} onChange={(event) => { void importAudio(event.target.files?.[0]); event.target.value = ""; }} /></label></div>
    {error ? <p className="error-message" role="alert">{error}</p> : null}
    {!audio ? <div className="audio-tools-empty"><span><HugeiconsIcon icon={MusicNote02Icon} size={28} /></span><h2>Choose an audio file</h2><p>You can preview its waveform, trim range, volume, and fades locally.</p></div> : <div className="audio-tools-card"><div className="audio-file-heading"><span><HugeiconsIcon icon={MusicNote02Icon} size={20} /></span><div><strong>{audio.name}</strong><small>{formatTime(audio.duration)} · Local file</small></div><button className="transport-play" onClick={() => void togglePreview()} aria-label={playing ? "Pause audio preview" : "Play audio preview"}><HugeiconsIcon icon={playing ? PauseIcon : PlayIcon} size={18} /></button></div><audio ref={elementRef} src={audio.url} preload="metadata" onEnded={() => setPlaying(false)} />
      <div className="audio-tool-waveform" aria-label="Audio waveform">{audio.waveform.map((value, index) => <i key={index} style={{ height: `${Math.max(8, value * 100)}%` }} />)}<span className="trim-window" style={{ left: `${trimStart / audio.duration * 100}%`, right: `${100 - trimEnd / audio.duration * 100}%` }} /></div>
      <div className="audio-tool-grid"><AudioControl label="Trim start" value={trimStart} min={0} max={Math.max(0, trimEnd - .1)} step={.05} suffix="s" onChange={setTrimStart} /><AudioControl label="Trim end" value={trimEnd} min={Math.min(audio.duration, trimStart + .1)} max={audio.duration} step={.05} suffix="s" onChange={setTrimEnd} /><AudioControl label="Volume" value={volume} min={0} max={1} step={.05} onChange={setVolume} /><AudioControl label="Fade in" value={fadeIn} min={0} max={Math.min(5, trimEnd - trimStart)} step={.1} suffix="s" onChange={setFadeIn} /><AudioControl label="Fade out" value={fadeOut} min={0} max={Math.min(5, trimEnd - trimStart)} step={.1} suffix="s" onChange={setFadeOut} /></div>
      <p className="audio-tools-note">These controls are a non-destructive preview. Add the file to a recording from the Editor’s Music track to include it in an MP4 export.</p></div>}
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

const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
