import type { StudioProject } from "@/types/project";

export interface ZoomTransform {
  scale: number;
  x: number;
  y: number;
  amount: number;
}

export interface SourceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function zoomTransformAt(project: StudioProject, time: number): ZoomTransform | null {
  const event = project.zoomEvents.find((item) => item.enabled !== false && time >= item.time && time <= item.time + item.duration);
  if (!event) return null;
  const local = time - event.time;
  const easeInEnd = .3;
  const easeOutDuration = .4;
  const easeOutStart = Math.max(easeInEnd, event.duration - easeOutDuration);
  let amount = 1;
  if (local < easeInEnd) amount = ease(Math.max(0, local / easeInEnd));
  else if (local > easeOutStart) amount = 1 - ease(Math.min(1, (local - easeOutStart) / easeOutDuration));
  amount = clamp(amount, 0, 1);
  return { scale: 1 + (event.scale - 1) * amount, x: clamp(event.x, 0, 1), y: clamp(event.y, 0, 1), amount };
}

export function zoomSourceRect(project: StudioProject, time: number): SourceRect {
  const crop = project.crop;
  const zoom = zoomTransformAt(project, time);
  const scale = zoom?.scale ?? 1;
  const width = crop.width / scale;
  const height = crop.height / scale;
  const focusX = clamp(zoom?.x ?? crop.x + crop.width / 2, crop.x, crop.x + crop.width);
  const focusY = clamp(zoom?.y ?? crop.y + crop.height / 2, crop.y, crop.y + crop.height);
  return {
    x: clamp(focusX - width / 2, crop.x, crop.x + crop.width - width),
    y: clamp(focusY - height / 2, crop.y, crop.y + crop.height - height),
    width,
    height,
  };
}

export function previewZoomStyle(project: StudioProject, time: number): { left: string; top: string; width: string; height: string } {
  const source = zoomSourceRect(project, time);
  return {
    left: `${-source.x / source.width * 100}%`,
    top: `${-source.y / source.height * 100}%`,
    width: `${100 / source.width}%`,
    height: `${100 / source.height}%`,
  };
}

export function sourcePointFromPreview(project: StudioProject, time: number, x: number, y: number): { x: number; y: number } {
  const source = zoomSourceRect(project, time);
  return { x: clamp(source.x + clamp(x, 0, 1) * source.width, 0, 1), y: clamp(source.y + clamp(y, 0, 1) * source.height, 0, 1) };
}

export function previewPointFromSource(project: StudioProject, time: number, x: number, y: number): { x: number; y: number } {
  const source = zoomSourceRect(project, time);
  return { x: clamp((x - source.x) / source.width, 0, 1), y: clamp((y - source.y) / source.height, 0, 1) };
}

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
const ease = (value: number) => 1 - Math.pow(1 - value, 3);
