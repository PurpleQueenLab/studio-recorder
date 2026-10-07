# Studio Recorder web architecture

Studio Recorder is a static, local-first Next.js application. Vercel serves the application shell; media never crosses the network. Browser APIs capture sources, IndexedDB stores project metadata and bounded recording chunks, and future workers will perform composition and export.

## Boundaries

- `features/recording`: permissions, live source previews, recording state and the compact HUD.
- `features/library`: local project discovery and user-initiated project actions.
- `lib/media`: capability detection and browser media orchestration. UI components do not call capture APIs directly.
- `lib/storage`: IndexedDB persistence. The store accepts chunks incrementally so long sessions are not retained as one in-memory blob.
- `types`: versionable non-destructive project metadata.
- `workers`: composition, waveform analysis and export work that must stay off the main thread.

Screen, camera, microphone and computer-audio streams remain independent project sources. Crop, camera layout, cursor, zoom, canvas and timeline edits are metadata until export. The original capture chunks are not destructively rewritten.

## Privacy and security

There are no API routes, authentication providers, remote databases, telemetry SDKs, or media upload code. The browser permission chooser is never bypassed. Capture calls require a user gesture. Finished files are saved only by an explicit user action.

## Export boundary

`MediaRecorder` provides a recoverable local acquisition format today. A standards-compliant MP4 export requires WebCodecs support for H.264 and AAC plus an MP4 muxer; WebCodecs does not mux files itself. The compatibility exporter must runtime-check exact encoder configurations, write one H.264 video track and one 48 kHz AAC-LC stereo track, validate timestamps and decodeability, and otherwise clearly report that MP4 export is unavailable rather than relabel WebM bytes.
