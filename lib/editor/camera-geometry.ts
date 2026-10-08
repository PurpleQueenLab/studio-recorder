import type { CameraShape, NormalizedRect } from "@/types/project";

export function cameraPixelRect(rect: NormalizedRect, shape: CameraShape, width: number, height: number) {
  let pixelWidth = rect.width * width;
  let pixelHeight = rect.height * height;
  if (shape === "circle" || shape === "square") pixelHeight = pixelWidth = Math.min(pixelWidth, height);
  return {
    x: clamp(rect.x * width, 0, Math.max(0, width - pixelWidth)),
    y: clamp(rect.y * height, 0, Math.max(0, height - pixelHeight)),
    width: pixelWidth,
    height: pixelHeight,
  };
}

export function coverSourceRect(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number) {
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;
  if (sourceRatio > targetRatio) {
    const width = sourceHeight * targetRatio;
    return { x: (sourceWidth - width) / 2, y: 0, width, height: sourceHeight };
  }
  const height = sourceWidth / targetRatio;
  return { x: 0, y: (sourceHeight - height) / 2, width: sourceWidth, height };
}

export function squareNormalizedRect(rect: NormalizedRect, stageWidth: number, stageHeight: number): NormalizedRect {
  const height = rect.width * stageWidth / Math.max(1, stageHeight);
  return { ...rect, y: Math.min(rect.y, Math.max(0, 1 - height)), height };
}

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
