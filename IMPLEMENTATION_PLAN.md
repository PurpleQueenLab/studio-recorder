# Implementation plan

## Implemented foundation

- Figma-derived responsive shell, semantic dark/light tokens and Hugeicons.
- Library, recorder setup, source preview, recording HUD and compatibility settings.
- Independent display, camera and microphone acquisition.
- Two-second MediaRecorder chunks written directly to IndexedDB.
- Non-destructive project, crop and zoom models with unit coverage.
- Open-source governance, CI and deployment documentation.

## Next milestones

1. Add source-specific device selection, persisted microphone preference, storage quota estimates and project deletion/rename.
2. Add crop overlay, normalized drag/resize handles, camera bubble transforms and canvas presentation presets.
3. Capture in-app pointer events where available and add manual click/zoom events elsewhere.
4. Build the multi-track preview/editor with trim, split, range deletion and undo/redo.
5. Implement the worker-based composition pipeline and runtime-gated H.264/AAC MP4 muxing. Validate the produced container and decoded tracks before offering a file.
6. Add File System Access streaming with Blob-download fallback, thumbnails, explicit save and recovery UX.
7. Run Chrome and Edge long-session, permission, source-ended, quota and crash-recovery suites; run reduced secondary-browser suites.

Each milestone must pass type checking, lint, unit tests and a production build. Browser-facing milestones additionally require end-to-end tests and console checks.
