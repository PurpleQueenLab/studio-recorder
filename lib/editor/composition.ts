import type { StudioProject } from "@/types/project";

export interface ZoomTransform {
  scale: number;
  x: number;
  y: number;
  amount: number;
}

export function zoomTransformAt(project: StudioProject, time: number): ZoomTransform | null {
  const event = project.zoomEvents.find((item) => item.enabled !== false && time >= item.time - .15 && time <= item.time + item.duration);
  if (!event) return null;
  const local = time - (event.time - .15);
  const easeInEnd = .38;
  const easeOutDuration = .42;
  const easeOutStart = Math.max(easeInEnd, event.duration - easeOutDuration);
  let amount = 1;
  if (local < easeInEnd) amount = ease(Math.max(0, local / easeInEnd));
  else if (local > easeOutStart) amount = 1 - ease(Math.min(1, (local - easeOutStart) / easeOutDuration));
  amount = clamp(amount, 0, 1);
  return { scale: 1 + (event.scale - 1) * amount, x: clamp(event.x, 0, 1), y: clamp(event.y, 0, 1), amount };
}

export function previewZoomStyle(project: StudioProject, time: number): { transform: string; transformOrigin: string } {
  const zoom = zoomTransformAt(project, time);
  if (!zoom) return { transform: "scale(1)", transformOrigin: "50% 50%" };
  return { transform: `scale(${zoom.scale})`, transformOrigin: `${zoom.x * 100}% ${zoom.y * 100}%` };
}

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
const ease = (value: number) => 1 - Math.pow(1 - value, 3);
