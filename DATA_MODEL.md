# Data model

`StudioProject` is serializable metadata stored in IndexedDB. It has a stable ID, user-facing title, timestamps, duration, mode, independent source descriptors, normalized crop and camera rectangles, zoom events, and non-destructive timeline edits.

Media chunks live in a separate `chunks` object store keyed by `[projectId, source, index]`. This prevents project-list queries from loading media and preserves deterministic chunk order. Source values are `screen`, `camera`, `microphone`, or `computer-audio`.

All spatial values use normalized source coordinates from 0 to 1. Timeline values use seconds. New schema versions must migrate older projects in the IndexedDB upgrade transaction and must never silently discard chunks.
