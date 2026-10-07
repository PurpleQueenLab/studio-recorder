# Data model

`StudioProject` is serializable metadata stored in IndexedDB. It has a stable ID, user-facing title, timestamps, duration, mode, independent source descriptors, normalized crop and camera rectangles, zoom events, and non-destructive timeline edits.

Media chunks live in a separate `chunks` object store keyed by `[projectId, source, index]`. This prevents project-list queries from loading media and preserves deterministic chunk order. Source values are `screen`, `camera`, `microphone`, `computer-audio`, or `export-audio`. The derived `export-audio` track is a local 48 kHz mix for final exports; independent microphone and computer-audio sources remain unchanged.

All spatial values use normalized source coordinates from 0 to 1. Timeline values use seconds. Optional model fields are normalized when older projects are opened. Any future store-shape change must use an IndexedDB upgrade transaction and must never silently discard chunks.
