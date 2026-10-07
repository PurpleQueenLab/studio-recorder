# Implementation plan

## Implemented foundation

- Figma-derived responsive shell, semantic dark/light tokens and Hugeicons.
- Library, recorder setup, source preview, recording HUD and compatibility settings.
- Independent display, camera and microphone acquisition.
- Two-second MediaRecorder chunks written directly to IndexedDB.
- Project rename/delete, legacy-record normalization and ordered chunk recovery.
- Non-destructive crop/canvas, camera-bubble, zoom/cursor, trim/split/delete and undo/redo editor controls.
- Runtime-gated AVC/H.264 + AAC MP4 composition, muxing and post-export decode validation.
- File System Access streaming for long exports with a Blob-download path for shorter exports.
- Open-source governance, CI and deployment documentation.

## Next milestones

1. Add source-specific device selection, persisted microphone preference, storage quota estimates and thumbnails.
2. Add pointer-event capture for interactions occurring inside Studio Recorder; ordinary web pages cannot monitor the system pointer globally, so manual focal-point cursor events remain the cross-browser fallback.
3. Move expensive composition work behind a dedicated worker where browser encoder support allows it.
4. Expand explicit save/recovery UX for interrupted long exports and quota exhaustion.
5. Run Chrome and Edge long-session, permission, source-ended, quota and crash-recovery suites; run reduced secondary-browser suites.

Each milestone must pass type checking, lint, unit tests and a production build. Browser-facing milestones additionally require end-to-end tests and console checks.
