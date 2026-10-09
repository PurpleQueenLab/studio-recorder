import { sanitizeFilename } from "@/lib/project";
import type { AudioToolsProject } from "@/types/project";

export function audioToolsGainAt(project: Pick<AudioToolsProject, "trimStart" | "trimEnd" | "volume" | "fadeIn" | "fadeOut">, sourceTime: number): number {
  const elapsed = Math.max(0, sourceTime - project.trimStart);
  const remaining = Math.max(0, project.trimEnd - sourceTime);
  const fadeIn = project.fadeIn > 0 ? Math.min(1, elapsed / project.fadeIn) : 1;
  const fadeOut = project.fadeOut > 0 ? Math.min(1, remaining / project.fadeOut) : 1;
  return Math.max(0, project.volume * Math.min(fadeIn, fadeOut, 1));
}

export async function renderAudioToolsWav(project: AudioToolsProject): Promise<Blob> {
  const context = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(await project.blob.arrayBuffer());
  } finally {
    await context.close();
  }
  const duration = Math.max(0.001, project.trimEnd - project.trimStart);
  const sampleRate = 48_000;
  const offline = new OfflineAudioContext(2, Math.max(1, Math.ceil(duration * sampleRate)), sampleRate);
  const source = offline.createBufferSource();
  const gain = offline.createGain();
  source.buffer = decoded;
  source.connect(gain).connect(offline.destination);
  const points = Math.max(2, Math.ceil(duration * 50) + 1);
  const curve = Float32Array.from({ length: points }, (_, index) => audioToolsGainAt(project, project.trimStart + duration * index / (points - 1)));
  gain.gain.setValueCurveAtTime(curve, 0, duration);
  source.start(0, project.trimStart, duration);
  return encodeWav(await offline.startRendering());
}

export function audioToolsExportFilename(name: string): string {
  const base = name.replace(/\.wav$/i, "").trim() || "Studio Recorder audio";
  return `${sanitizeFilename(base)}.wav`;
}

export function encodeWav(buffer: AudioBuffer): Blob {
  const channels = Math.min(2, Math.max(1, buffer.numberOfChannels));
  const frames = buffer.length;
  const bytesPerSample = 2;
  const dataSize = frames * channels * bytesPerSample;
  const output = new ArrayBuffer(44 + dataSize);
  const view = new DataView(output);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);
  const channelData = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1)));
  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][frame]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }
  return new Blob([output], { type: "audio/wav" });
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
}
