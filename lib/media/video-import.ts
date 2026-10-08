import { createProject, normalizeVideoClips } from "@/lib/project";
import { LocalProjectStore } from "@/lib/storage/project-store";
import type { ProjectAsset, StudioProject, VideoClip } from "@/types/project";

export type VideoMetadata = { duration: number; width: number; height: number };

export async function readVideoMetadata(blob: Blob): Promise<VideoMetadata> {
  const url = URL.createObjectURL(blob);
  try {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("This video cannot be decoded by this browser."));
    });
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error("This video has no usable duration.");
    return { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
  } finally { URL.revokeObjectURL(url); }
}

export async function importVideoAsProject(file: File, store = new LocalProjectStore()): Promise<StudioProject> {
  const metadata = await readVideoMetadata(file);
  const project = createProject("screen");
  project.title = file.name.replace(/\.[^.]+$/, "") || project.title;
  const asset: ProjectAsset = { id: crypto.randomUUID(), kind: "video", name: file.name, mimeType: file.type || "video/mp4", chunkCount: 1, duration: metadata.duration };
  const clip: VideoClip = { id: crypto.randomUUID(), sourceId: asset.id, name: file.name, timelineStart: 0, sourceIn: 0, sourceOut: metadata.duration };
  project.assets = [asset];
  project.videoClips = [clip];
  project.duration = metadata.duration;
  project.sources = [{ kind: "screen", chunkCount: 0, mimeType: asset.mimeType, width: metadata.width, height: metadata.height }];
  await store.putChunk(project.id, asset.id, 0, file);
  await store.putProject(project);
  return project;
}

export async function appendVideoToProject(project: StudioProject, file: File, store = new LocalProjectStore()): Promise<StudioProject> {
  const metadata = await readVideoMetadata(file);
  const asset: ProjectAsset = { id: crypto.randomUUID(), kind: "video", name: file.name, mimeType: file.type || "video/mp4", chunkCount: 1, duration: metadata.duration };
  const clip: VideoClip = { id: crypto.randomUUID(), sourceId: asset.id, name: file.name, timelineStart: project.duration, sourceIn: 0, sourceOut: metadata.duration };
  await store.putChunk(project.id, asset.id, 0, file);
  const videoClips = normalizeVideoClips([...project.videoClips, clip]);
  return { ...project, assets: [...project.assets, asset], videoClips, duration: videoClips.reduce((sum, item) => sum + item.sourceOut - item.sourceIn, 0), trim: { start: 0, end: null } };
}

export async function generateThumbnail(blob: Blob, at = .5): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const video = document.createElement("video");
    video.muted = true; video.playsInline = true; video.preload = "auto"; video.src = url;
    await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error("Thumbnail source cannot be decoded.")); });
    video.currentTime = Math.min(Math.max(.25, at), Math.max(.25, video.duration - .05));
    await new Promise<void>((resolve, reject) => { video.onseeked = () => resolve(); video.onerror = () => reject(new Error("Thumbnail frame cannot be read.")); });
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(960, video.videoWidth || 960); canvas.height = Math.round(canvas.width * (video.videoHeight || 540) / (video.videoWidth || 960));
    canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Thumbnail could not be encoded.")), "image/jpeg", .82));
  } finally { URL.revokeObjectURL(url); }
}

export async function ensureProjectThumbnail(project: StudioProject, store = new LocalProjectStore()): Promise<StudioProject> {
  if (project.thumbnailAssetId) return project;
  const first = project.videoClips[0];
  if (!first) return project;
  const asset = project.assets.find((item) => item.id === first.sourceId);
  const chunks = await store.getChunks(project.id, first.sourceId);
  if (!chunks.length) return project;
  const thumbnail = await generateThumbnail(new Blob(chunks, { type: asset?.mimeType || project.sources.find((source) => source.kind === first.sourceId)?.mimeType || "video/webm" }));
  const thumbnailAsset: ProjectAsset = { id: crypto.randomUUID(), kind: "thumbnail", name: `${project.title} thumbnail`, mimeType: thumbnail.type, chunkCount: 1 };
  await store.putChunk(project.id, thumbnailAsset.id, 0, thumbnail);
  const updated = { ...project, assets: [...project.assets, thumbnailAsset], thumbnailAssetId: thumbnailAsset.id };
  await store.putProject(updated);
  return updated;
}
