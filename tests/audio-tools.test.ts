import { describe, expect, it } from "vitest";
import { audioToolsExportFilename, audioToolsGainAt, encodeWav } from "@/lib/media/audio-tools";

describe("standalone audio tools", () => {
  it("H: applies trim-relative volume and fades", () => {
    const project = { trimStart: 2, trimEnd: 8, volume: .8, fadeIn: 2, fadeOut: 2 };
    expect(audioToolsGainAt(project, 2)).toBe(0);
    expect(audioToolsGainAt(project, 3)).toBeCloseTo(.4);
    expect(audioToolsGainAt(project, 5)).toBeCloseTo(.8);
    expect(audioToolsGainAt(project, 7)).toBeCloseTo(.4);
  });

  it("H: writes a standards-shaped stereo PCM WAV", async () => {
    const left = new Float32Array([0, .5, -1]);
    const right = new Float32Array([0, -.5, 1]);
    const buffer = { numberOfChannels: 2, length: 3, sampleRate: 48_000, getChannelData: (channel: number) => channel ? right : left } as AudioBuffer;
    const bytes = new Uint8Array(await encodeWav(buffer).arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe("WAVE");
    expect(new DataView(bytes.buffer).getUint32(24, true)).toBe(48_000);
    expect(new DataView(bytes.buffer).getUint16(22, true)).toBe(2);
  });

  it("I: sanitizes the chosen audio export name", () => {
    expect(audioToolsExportFilename("My final: mix.wav")).toBe("My final- mix.wav");
  });
});
