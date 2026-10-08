import type { CaptureFrameRate, CaptureQuality, CaptureQualityLevel, CaptureResolution } from "@/types/project";

export const RESOLUTION_PRESETS: Record<CaptureResolution, { width: number; height: number; label: string }> = {
  "1080p": { width: 1920, height: 1080, label: "1080p" },
  "1440p": { width: 2560, height: 1440, label: "1440p" },
  "2160p": { width: 3840, height: 2160, label: "4K" },
};

export const DEFAULT_CAPTURE_QUALITY: CaptureQuality = { resolution: "1080p", frameRate: 30, level: "high", width: 1920, height: 1080 };

export type QualitySupport = { resolutions: CaptureResolution[]; frameRates: CaptureFrameRate[]; verified: boolean };

export function supportFromTrack(track?: MediaStreamTrack): QualitySupport {
  if (!track) return { resolutions: ["1080p"], frameRates: [30], verified: false };
  const settings = track.getSettings();
  const capabilities = track.getCapabilities?.();
  const maximumWidth = numericMaximum(capabilities?.width) ?? settings.width ?? 0;
  const maximumHeight = numericMaximum(capabilities?.height) ?? settings.height ?? 0;
  const maximumFrameRate = numericMaximum(capabilities?.frameRate) ?? settings.frameRate ?? 0;
  const resolutions = (Object.keys(RESOLUTION_PRESETS) as CaptureResolution[]).filter((key) => {
    const preset = RESOLUTION_PRESETS[key];
    return maximumWidth >= preset.width && maximumHeight >= preset.height;
  });
  return {
    resolutions: resolutions.length ? resolutions : ["1080p"],
    frameRates: maximumFrameRate >= 59 ? [30, 60] : [30],
    verified: Boolean(maximumWidth && maximumHeight),
  };
}

export function videoConstraints(quality: CaptureQuality, deviceId?: string): MediaTrackConstraints {
  return {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    width: { ideal: quality.width, max: quality.width },
    height: { ideal: quality.height, max: quality.height },
    frameRate: { ideal: quality.frameRate, max: quality.frameRate },
  };
}

export function resolveActualQuality(selected: CaptureQuality, track?: MediaStreamTrack): CaptureQuality {
  if (!track) return selected;
  const settings = track.getSettings();
  const width = settings.width ?? selected.width;
  const height = settings.height ?? selected.height;
  const frameRate = settings.frameRate ?? selected.frameRate;
  const supportedResolution = (Object.keys(RESOLUTION_PRESETS) as CaptureResolution[])
    .filter((key) => RESOLUTION_PRESETS[key].width <= width && RESOLUTION_PRESETS[key].height <= height)
    .at(-1) ?? "1080p";
  return {
    ...selected,
    resolution: supportedResolution,
    frameRate: frameRate >= 59 && selected.frameRate === 60 ? 60 : 30,
    width,
    height,
  };
}

export function captureVideoBitrate(quality: CaptureQuality): number {
  return exportVideoBitrate(quality.resolution, quality.frameRate, quality.level);
}

export function exportVideoBitrate(resolution: CaptureResolution, frameRate: CaptureFrameRate, level: CaptureQualityLevel): number {
  const base: Record<CaptureResolution, Record<CaptureQualityLevel, number>> = {
    "1080p": { optimized: 6_000_000, high: 10_000_000, maximum: 16_000_000 },
    "1440p": { optimized: 12_000_000, high: 18_000_000, maximum: 28_000_000 },
    "2160p": { optimized: 25_000_000, high: 40_000_000, maximum: 60_000_000 },
  };
  return Math.round(base[resolution][level] * (frameRate === 60 ? 1.5 : 1));
}

export function qualityLabel(quality: CaptureQuality): string {
  return `${RESOLUTION_PRESETS[quality.resolution].label} · ${quality.frameRate} FPS · ${quality.level[0].toUpperCase()}${quality.level.slice(1)}`;
}

function numericMaximum(value?: MediaSettingsRange | number): number | undefined {
  return typeof value === "number" ? value : value?.max;
}
