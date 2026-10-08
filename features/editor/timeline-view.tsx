"use client";

import { useRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Mic01Icon, MusicNote02Icon, VolumeMute01Icon, VolumeHighIcon } from "@hugeicons/core-free-icons";
import { adjustAudioClip, adjustZoomEvent, timelineTimeFromPosition } from "@/lib/editor/timeline";
import { reorderVideoClip, trimVideoClip, videoClipDuration } from "@/lib/project";
import { audioTrackLabel } from "@/features/editor/use-audio-preview";
import type { AudioClip, AudioTrackType, StudioProject } from "@/types/project";

type Commit = (update: (value: StudioProject) => StudioProject) => void;

export function TimelineView({ project, currentTime, seek, commit, selectedClipId, onSelectClip, selectedVideoClipId, onSelectVideoClip, selectedZoomId, onSelectZoom, markIn, markOut }: {
  project: StudioProject;
  currentTime: number;
  seek: (time: number) => void;
  commit: Commit;
  selectedClipId?: string;
  onSelectClip: (id?: string) => void;
  selectedVideoClipId?: string;
  onSelectVideoClip: (id?: string) => void;
  selectedZoomId?: string;
  onSelectZoom: (id: string) => void;
  markIn: number;
  markOut: number;
}) {
  const lanesRef = useRef<HTMLDivElement>(null);
  const duration = Math.max(.1, project.duration);
  const seekFromPointer = (event: React.PointerEvent) => {
    const lanes = lanesRef.current;
    if (!lanes) return;
    const bounds = lanes.getBoundingClientRect();
    seek(timelineTimeFromPosition(event.clientX, bounds.left, bounds.width, project.duration));
  };
  const startScrub = (event: React.PointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    seekFromPointer(event);
  };

  return <div className="timeline-shell">
    <div className="timeline-label-column"><span>Tracks</span>{["Screen", "Camera", "Original narration", "Computer audio", "Voiceover", "Music", "Zoom", "Cursor"].map((label) => <span key={label}>{label}</span>)}</div>
    <div className="timeline-lanes" ref={lanesRef} onPointerDown={startScrub} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) seekFromPointer(event); }}>
      <div className="time-ruler">{Array.from({ length: 9 }, (_, index) => <span key={index} style={{ left: `${index / 8 * 100}%` }}>{formatPrecise(project.duration * index / 8)}</span>)}</div>
      <VideoLane project={project} duration={duration} commit={commit} selectedId={selectedVideoClipId} onSelect={onSelectVideoClip} />
      <SimpleLane className="camera" hidden={project.mode === "screen"} />
      <AudioLane type="microphone" project={project} duration={duration} commit={commit} />
      <AudioLane type="computer-audio" project={project} duration={duration} commit={commit} />
      <AudioLane type="voiceover" project={project} duration={duration} commit={commit} selectedClipId={selectedClipId} onSelectClip={onSelectClip} />
      <AudioLane type="music" project={project} duration={duration} commit={commit} selectedClipId={selectedClipId} onSelectClip={onSelectClip} />
      <div className="track-lane zoom">{project.zoomEvents.map((zoom) => <ZoomBlock key={zoom.id} zoom={zoom} duration={duration} selected={selectedZoomId === zoom.id} commit={commit} onSelect={() => onSelectZoom(zoom.id)} />)}</div>
      <div className="track-lane cursor">{project.pointerEvents.map((pointer) => <i key={pointer.id} className="cursor-event" style={{ left: `${pointer.time / duration * 100}%` }} title={`Click at ${formatPrecise(pointer.time)}`} />)}</div>
      <div className="range-selection" style={{ left: `${markIn / duration * 100}%`, width: `${Math.max(0, markOut - markIn) / duration * 100}%` }} aria-label={`Selected range ${formatPrecise(markIn)} to ${formatPrecise(markOut)}`}><i className="range-handle in" /><i className="range-handle out" /></div>
      <button className="playhead-hit" style={{ left: `${currentTime / duration * 100}%` }} onPointerDown={(event) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); seekFromPointer(event); }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) seekFromPointer(event); }} aria-label={`Playhead at ${formatPrecise(currentTime)}`}><i /><span>{formatPrecise(currentTime)}</span></button>
    </div>
  </div>;
}

function VideoLane({ project, duration, commit, selectedId, onSelect }: { project: StudioProject; duration: number; commit: Commit; selectedId?: string; onSelect: (id?: string) => void }) {
  return <div className="track-lane video-lane">{project.videoClips.map((clip, index) => <VideoClipBlock key={clip.id} clip={clip} index={index} count={project.videoClips.length} duration={duration} selected={selectedId === clip.id} commit={commit} onSelect={() => onSelect(clip.id)} />)}</div>;
}

function VideoClipBlock({ clip, index, count, duration, selected, commit, onSelect }: { clip: StudioProject["videoClips"][number]; index: number; count: number; duration: number; selected: boolean; commit: Commit; onSelect: () => void }) {
  const drag = useRef<{ x: number; mode: "move" | "start" | "end" } | undefined>(undefined);
  const start = (event: React.PointerEvent, mode: "move" | "start" | "end") => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, mode }; onSelect(); };
  const move = (event: React.PointerEvent) => {
    if (!drag.current) return;
    const lane = event.currentTarget.parentElement!;
    const delta = (event.clientX - drag.current.x) / lane.getBoundingClientRect().width * duration;
    if (drag.current.mode === "move") {
      const target = Math.min(count - 1, Math.max(0, Math.floor(event.clientX - lane.getBoundingClientRect().left) / lane.getBoundingClientRect().width * count));
      if (target !== index) commit((project) => ({ ...project, videoClips: reorderVideoClip(project.videoClips, clip.id, target) }));
    } else commit((project) => { const edge = drag.current!.mode === "start" ? "start" : "end"; const videoClips = trimVideoClip(project.videoClips, clip.id, edge, delta); return { ...project, videoClips, duration: videoClips.reduce((sum, item) => sum + videoClipDuration(item), 0) }; });
    drag.current.x = event.clientX;
  };
  return <button className={`timeline-clip video-clip ${selected ? "selected" : ""}`} style={{ left: `${clip.timelineStart / duration * 100}%`, width: `${videoClipDuration(clip) / duration * 100}%` }} onPointerDown={(event) => start(event, "move")} onPointerMove={move} onPointerUp={() => { drag.current = undefined; }} title={`${clip.name} · ${formatPrecise(videoClipDuration(clip))}`}><i className="clip-handle start" onPointerDown={(event) => start(event, "start")} /><span>{clip.name}</span><i className="clip-handle end" onPointerDown={(event) => start(event, "end")} /></button>;
}

function SimpleLane({ className, hidden }: { className: string; hidden?: boolean }) {
  return <div className={`track-lane ${className} ${hidden ? "track-unavailable" : ""}`}><i /></div>;
}

function AudioLane({ type, project, duration, commit, selectedClipId, onSelectClip }: {
  type: AudioTrackType;
  project: StudioProject;
  duration: number;
  commit: Commit;
  selectedClipId?: string;
  onSelectClip?: (id?: string) => void;
}) {
  const track = project.audio.tracks[type];
  const sourceAvailable = type === "microphone" || type === "computer-audio" ? project.sources.some((source) => source.kind === type) : true;
  const waveform = project.audio.waveforms[type] ?? [];
  const clips = type === "voiceover" || type === "music" ? project.audio.clips.filter((clip) => clip.trackType === type) : [];
  const Icon = type === "microphone" || type === "voiceover" ? Mic01Icon : type === "music" ? MusicNote02Icon : VolumeHighIcon;
  return <div className={`track-lane audio-lane ${type} ${sourceAvailable ? "" : "track-unavailable"}`}>
    <div className="audio-track-controls" onPointerDown={(event) => event.stopPropagation()}><HugeiconsIcon icon={Icon} size={13} /><button className={track.muted ? "active" : ""} onClick={() => commit((value) => ({ ...value, audio: { ...value.audio, tracks: { ...value.audio.tracks, [type]: { ...value.audio.tracks[type], muted: !value.audio.tracks[type].muted } } } }))} aria-label={`${track.muted ? "Unmute" : "Mute"} ${audioTrackLabel(type)}`}><HugeiconsIcon icon={track.muted ? VolumeMute01Icon : VolumeHighIcon} size={12} /></button><button className={track.solo ? "active" : ""} onClick={() => commit((value) => ({ ...value, audio: { ...value.audio, tracks: { ...value.audio.tracks, [type]: { ...value.audio.tracks[type], solo: !value.audio.tracks[type].solo } } } }))} aria-label={`Solo ${audioTrackLabel(type)}`}>S</button></div>
    {clips.length ? clips.map((clip) => <AudioClipBlock key={clip.id} clip={clip} duration={duration} selected={selectedClipId === clip.id} commit={commit} onSelect={() => onSelectClip?.(clip.id)} />) : <Waveform values={waveform} />}
  </div>;
}

function AudioClipBlock({ clip, duration, selected, commit, onSelect }: { clip: AudioClip; duration: number; selected: boolean; commit: Commit; onSelect: () => void }) {
  const drag = useRef<{ clientX: number; clip: AudioClip; mode: "move" | "start" | "end" } | undefined>(undefined);
  const start = (event: React.PointerEvent, mode: "move" | "start" | "end") => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { clientX: event.clientX, clip, mode };
    onSelect();
  };
  const move = (event: React.PointerEvent) => {
    if (!drag.current) return;
    const lane = event.currentTarget.parentElement!;
    const delta = (event.clientX - drag.current.clientX) / lane.getBoundingClientRect().width * duration;
    const original = drag.current.clip;
    commit((project) => ({ ...project, audio: { ...project.audio, clips: project.audio.clips.map((item) => item.id !== original.id ? item : adjustAudioClip(original, drag.current!.mode, delta, duration)) } }));
  };
  return <button className={`timeline-clip audio-clip ${selected ? "selected" : ""}`} style={{ left: `${clip.startTime / duration * 100}%`, width: `${Math.max(.1, clip.sourceOut - clip.sourceIn) / duration * 100}%` }} onPointerDown={(event) => start(event, "move")} onPointerMove={move} onPointerUp={() => { drag.current = undefined; }} title={`${audioTrackLabel(clip.trackType)} clip`}><i className="clip-handle start" onPointerDown={(event) => start(event, "start")} /><Waveform values={clip.waveform ?? []} /><i className="clip-handle end" onPointerDown={(event) => start(event, "end")} /></button>;
}

function ZoomBlock({ zoom, duration, selected, commit, onSelect }: { zoom: StudioProject["zoomEvents"][number]; duration: number; selected: boolean; commit: Commit; onSelect: () => void }) {
  const drag = useRef<{ clientX: number; zoom: typeof zoom; mode: "move" | "start" | "end" } | undefined>(undefined);
  const start = (event: React.PointerEvent, mode: "move" | "start" | "end") => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { clientX: event.clientX, zoom, mode }; onSelect(); };
  const move = (event: React.PointerEvent) => { if (!drag.current) return; const lane = event.currentTarget.parentElement!; const delta = (event.clientX - drag.current.clientX) / lane.getBoundingClientRect().width * duration; const original = drag.current.zoom; commit((project) => ({ ...project, zoomEvents: project.zoomEvents.map((item) => item.id === original.id ? adjustZoomEvent(original, drag.current!.mode, delta, duration) : item) })); };
  return <button className={`timeline-clip zoom-clip ${zoom.enabled === false ? "disabled" : ""} ${selected ? "selected" : ""}`} style={{ left: `${zoom.time / duration * 100}%`, width: `${Math.max(.1, zoom.duration) / duration * 100}%` }} onPointerDown={(event) => start(event, "move")} onPointerMove={move} onPointerUp={() => { drag.current = undefined; }} title={`${zoom.source === "automatic" ? "Automatic" : "Manual"} zoom at ${formatPrecise(zoom.time)}`}><i className="clip-handle start" onPointerDown={(event) => start(event, "start")} /><span>{zoom.source === "automatic" ? "Auto" : "Zoom"}</span><i className="clip-handle end" onPointerDown={(event) => start(event, "end")} /></button>;
}

function Waveform({ values }: { values: number[] }) {
  const bars = values.length ? values : Array.from({ length: 48 }, (_, index) => .18 + Math.abs(Math.sin(index * .72)) * .38);
  return <span className="waveform" aria-hidden="true">{bars.map((value, index) => <i key={index} style={{ height: `${Math.max(10, value * 100)}%` }} />)}</span>;
}

const formatPrecise = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
