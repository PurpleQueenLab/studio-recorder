# Studio Recorder web architecture

Studio Recorder is a static, local-first Next.js application. Vercel serves the application shell; media never crosses the network. Browser APIs capture sources, IndexedDB stores project metadata and bounded recording chunks, and MediaBunny performs browser-side composition, encoding and validation.

## Boundaries

- `features/recording`: permissions, live source previews, recording state and the compact HUD.
- `features/library`: local project discovery and user-initiated project actions.
- `features/editor`: non-destructive crop, canvas, zoom, cursor and timeline controls.
- `features/export`: lazy-loaded H.264/AAC composition, muxing, validation and explicit save/download.
- `lib/media`: capability detection and browser media orchestration. UI components do not call capture APIs directly.
- `lib/storage`: IndexedDB persistence. The store accepts chunks incrementally so long sessions are not retained as one in-memory blob.
- `types`: versionable non-destructive project metadata.

Screen, camera, microphone and computer-audio streams remain independent project sources. Crop, camera layout, cursor, zoom, canvas and timeline edits are metadata until export. The original capture chunks are not destructively rewritten.

## Privacy and security

There are no API routes, authentication providers, remote databases, telemetry SDKs, or media upload code. The browser permission chooser is never bypassed. Capture calls require a user gesture. Finished files are saved only by an explicit user action.

## Export boundary

`MediaRecorder` provides recoverable local WebM acquisition streams. The lazy-loaded MediaBunny path decodes those sources, applies crop/canvas/zoom/cursor/camera/timeline metadata, encodes AVC/H.264 video and 48 kHz stereo AAC audio, and muxes a real MP4 container. Every result is reopened locally to validate track layout, codecs, timestamps, sample rate, channel layout, duration and decodeability before download. Unsupported devices receive a clear error; WebM bytes are never relabelled as MP4.

Exports up to 20 minutes use an in-memory MP4 buffer. Longer exports require the File System Access save picker so bytes can stream to disk without retaining the finished file in memory.
