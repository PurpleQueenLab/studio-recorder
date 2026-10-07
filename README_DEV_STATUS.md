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
- Automatic zoom derivation is implemented only for pointer events the application can genuinely observe. The corrected same-tab native capture flow still requires the manual acceptance step documented below.
- Shared zoom transform for preview and export, cursor styling, crop controls, and direct camera drag/resize.
- Colour, gradient, wallpaper, local image, and blurred-source backgrounds.
- Presentation scale, padding, position, radius, shadow, and window-frame controls.
- MP4 output metadata applied through `Output.setMetadataTags(...)`; composable `Conversion` options no longer receive the invalid `tags` property.
- H.264 video plus one mixed AAC audio stream, with post-export codec, channel, sample-rate, timing, and dimension validation.
- Additive project migration for older locally stored recordings.

## Verification

- `npm run typecheck`: pass
- `npm run lint`: pass
- `npm test`: pass, 27 tests
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

## REAL BROWSER TEST ROUND 2

### WORKING

- Screen, screen + camera, and camera-only recording were manually accepted in the target browser before this correction round.
- The editor, crop controls, audio workflow, and MP4 export were manually accepted with output reported as H.264 video, AAC stereo audio, 48 kHz, and 1920 × 1080.
- Camera preview has explicit not-requested, loading, ready, permission-denied, disconnected, and recording states. Screen + camera shows the camera before recording; camera-only uses it as the full primary preview.
- Export asks for a filename, defaults to the current project title, uses a readable timestamp fallback, and prefers the browser file picker when available.
- Library search, recording-type filter, date filter, and sort controls operate on locally stored projects.
- Audio Tools locally imports and previews user-owned audio with a waveform, trim bounds, volume, fade-in, and fade-out controls.
- Page titles follow the active view, and the supplied Studio Recorder mark is used in the app chrome, manifest, and browser icon metadata.
- In the in-app Chromium round, a generated 48 kHz stereo WAV loaded locally, produced a waveform, exposed working trim/volume/fade controls, and played through the local preview.
- Library search reduced the preview dataset to the matching recording, and the type/date/sort controls remained accessible and selectable.
- The Round 2 browser console reported no warnings or errors during the library, recording-setup, and audio-tools checks.

### FIXED

- Camera-only projects now load their camera chunks as the editor's primary video instead of incorrectly skipping them while looking for a screen source.
- Camera-only export and editor loading share one primary-source rule, preventing source-selection drift.
- The crop grid is shown only while the Crop tool is active and playback is paused; it is not part of export composition.
- Fixed the same-page automatic-zoom implementation bug: capture no longer depends only on Chrome's fragile display-track label. A same-origin Capture Handle identifies Studio Recorder tab capture, and the pointer listener now follows recording start, pause, resume, and stop.
- Captured pointer metadata now includes active-timeline time, raw client coordinates, observed viewport dimensions, normalized coordinates, and click type. A development-only diagnostic shows the latest count, timestamp, and normalized position.
- Automatic zoom generation starts 0.15 seconds before the click, uses a 0.30 second ease-in, 0.70 second settle, 0.40 second ease-out, and merges rapid nearby clicks.
- Manual zoom focal placement now maps rendered-preview clicks back into normalized source space instead of using the larger stage/background area.
- Preview and MP4 export now use the same crop-aware, edge-clamped source rectangle, so focal pan and scale share one interpretation without exposing empty source space.
- Local-media decode failures now replace the player with a clear retry/return path.
- Cancelling the native save dialog no longer produces a false export error.
- Settings self-check and crop-reset controls have stable padding and hierarchy.

### PARTIAL

- The corrected pointer-session path passes an automated browser-event simulation covering stored clicks, pause exclusion, resumed timing, normalization, generated ZoomEvents, preserved focal coordinates, and edge-aware preview transforms. The exact native Chrome same-tab chooser reproduction has not yet been rerun after this fix, so automatic zoom is not marked manually accepted.
- Audio Tools V1 is a non-destructive preview workspace. To include a file in the mixed MP4, import it into the Editor's Music track. A built-in licensed music library is a later enhancement.
- Browser-generated filenames are reliable with `showSaveFilePicker`; browsers without that API fall back to the normal download mechanism.

### BROWSER LIMITATIONS

- `getDisplayMedia` does not expose universal operating-system pointer coordinates, so Studio Recorder does not claim automatic focal tracking for arbitrary windows or full-screen capture.
- Native screen-share and save-file choosers require direct user interaction and are not controllable by the automated in-app browser.
- Camera, microphone, system-audio, MediaRecorder, WebCodecs, and file-system support vary by browser and platform. Chrome and Edge desktop remain the primary V1 targets.
- A future optional native helper could provide system-wide click metadata, but none is bundled or required today.

### MANUAL TESTS REQUIRED

1. Reconfirm camera permission denied, retry, device switching, disconnect, and recording states on at least one physical camera.
2. Reconfirm the corrected camera-only editor load and export with a newly recorded local project.
3. Exercise `showSaveFilePicker`, rename the MP4, cancel once, then save and inspect the resulting codecs and dimensions.
4. Import representative MP3, WAV, M4A/AAC, and WebM audio into Audio Tools and listen through trim, volume, and fade boundaries.
5. Verify layout and native permissions in current Chrome and Edge on the deployment origin.
6. In Chrome, share the Studio Recorder tab itself, record several spaced and rapid clicks, pause/resume once, stop, and confirm editable automatic events appear on the Zoom track at the expected focal points. This is the release gate for marking automatic zoom working.

### NEXT MILESTONE

- Complete the permission-enabled Round 2 acceptance matrix on physical media devices and retain sample validation receipts.
- Add exportable Audio Tools transforms only if the product needs standalone audio output; keep editor music import as the current MP4 path.
- Evaluate an optional, separately installed native pointer helper with explicit consent and no shared backend state.

## Manual acceptance checklist

1. In current Chrome or Edge, record a screen + camera project with microphone and “share tab audio” enabled.
2. Confirm the setup panel identifies both live audio tracks and the microphone meter responds to speech.
3. Stop the recording, confirm microphone and computer audio remain independent, and verify preview mute/solo/volume controls.
4. Add a voiceover and a local music file, enable ducking, then confirm timeline move/trim/fades in preview.
5. Add and resize a zoom event, drag/resize the camera, and exercise each presentation/background option.
6. Export MP4 and confirm local playback, H.264 + AAC-LC, stereo audio, expected dimensions, and audio/video duration alignment.
7. Upload that exported file to any required third-party playback target separately; native validation alone is not evidence of that service’s playback compatibility.
