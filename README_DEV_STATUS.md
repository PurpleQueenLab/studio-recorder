# Studio Recorder development status

Last updated: 7 October 2026

## Current milestone

The existing browser application now includes the editor-workspace correction, independent audio tracks, local voiceover and music clips, presentation controls, click-derived zoom metadata, direct camera placement, and a standards-compliant MP4 export path.

### Implemented

- Fixed-height editor workspace using `100dvh`, with a constrained preview, internally scrolling inspector, and stable bottom timeline.
- Responsive recording setup with separate preview and source columns on desktop and a non-overlapping stacked layout at narrower widths.
- Live microphone-track validation and level meter; computer audio is shown as available only when the selected display source supplies an actual audio track.
- Independent microphone and computer-audio source recordings, plus non-destructive voiceover and local music clips.
- Per-track mute, solo, volume, fade-in, and fade-out controls; per-clip gain and fades; music ducking under narration.
- One preview/export audio model with 48 kHz stereo offline mixing and headroom for multiple active sources.
- Timeline click/drag scrubbing, keyboard seeking, clip move/trim, and zoom-event move/resize.
- Automatic zoom derivation only for pointer events the application can genuinely observe. Other capture sources clearly fall back to manual zoom.
- Shared zoom transform for preview and export, cursor styling, crop controls, and direct camera drag/resize.
- Colour, gradient, wallpaper, local image, and blurred-source backgrounds.
- Presentation scale, padding, position, radius, shadow, and window-frame controls.
- MP4 output metadata applied through `Output.setMetadataTags(...)`; composable `Conversion` options no longer receive the invalid `tags` property.
- H.264 video plus one mixed AAC audio stream, with post-export codec, channel, sample-rate, timing, and dimension validation.
- Additive project migration for older locally stored recordings.

## Verification

- `npm run typecheck`: pass
- `npm run lint`: pass
- `npm test`: pass, 20 tests
- `npm run build`: pass, Next.js production build
- Browser MP4 self-check: pass, AVC + AAC, 48 kHz stereo

## REAL BROWSER TEST ROUND 1

Environment: Codex in-app Chromium browser at `http://localhost:3000`.

Passed:

- Browser capability page reports support for secure context, display capture, camera, microphone, MediaRecorder, WebCodecs, OffscreenCanvas, file-system access, and IndexedDB.
- One-second local MP4 self-check completed and validated AVC + AAC at 48 kHz stereo.
- Recording setup rendered without overlap at an 811 × 895 viewport. The preview and setup panel stacked responsively, and the application `main` region provided internal scrolling for the complete setup panel.
- The screen-share permission-pending state now displays a disabled “Waiting for browser permission…” control and does not falsely expose Pause/Stop controls or claim that microphone/system audio has failed.

Environment limitation:

- The automated in-app browser does not expose the native operating-system screen-share chooser to Playwright. A full screen + camera + microphone recording, real input-level observation, local music/voiceover playback, and a project-derived MP4 export still require one manual permission-enabled acceptance round on the target browser. This limitation is recorded explicitly; it is not treated as a pass.

## Manual acceptance checklist

1. In current Chrome or Edge, record a screen + camera project with microphone and “share tab audio” enabled.
2. Confirm the setup panel identifies both live audio tracks and the microphone meter responds to speech.
3. Stop the recording, confirm microphone and computer audio remain independent, and verify preview mute/solo/volume controls.
4. Add a voiceover and a local music file, enable ducking, then confirm timeline move/trim/fades in preview.
5. Add and resize a zoom event, drag/resize the camera, and exercise each presentation/background option.
6. Export MP4 and confirm local playback, H.264 + AAC-LC, stereo audio, expected dimensions, and audio/video duration alignment.
7. Upload that exported file to any required third-party playback target separately; native validation alone is not evidence of that service’s playback compatibility.
