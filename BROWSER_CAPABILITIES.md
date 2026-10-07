# Browser capabilities

Last reviewed: 7 October 2026. Runtime feature and codec detection is authoritative; this table is a product-support policy, not a promise that every OS exposes every source.

| Capability | Chrome desktop | Edge desktop | Safari desktop | Firefox desktop |
| --- | --- | --- | --- | --- |
| Screen/window/tab chooser | Primary | Primary | Secondary, OS/browser dependent | Secondary |
| Camera and microphone | Yes | Yes | Yes | Yes |
| Computer audio | Source and OS dependent | Source and OS dependent | Limited/source dependent | Limited/source dependent |
| In-app crop after capture | Planned composition layer | Planned | Planned where processing APIs allow | Planned where processing APIs allow |
| WebCodecs | Runtime detect | Runtime detect | Runtime detect | Runtime detect; codec coverage differs |
| H.264 + AAC MP4 export | Runtime codec test required | Runtime codec test required | Runtime codec test required | AAC encoding unavailable; do not expose compatible MP4 |
| File System Access save picker | Preferred path | Preferred path | Download fallback | Download fallback |
| IndexedDB | Yes | Yes | Yes | Yes |

Important constraints:

- `getDisplayMedia()` requires HTTPS and a fresh user gesture. The browser owns the chooser and permission cannot be persisted.
- Requesting captured audio does not guarantee an audio track. The selected surface, browser and OS decide what is available.
- Browsers do not provide unrestricted global pointer/click monitoring or a universal OS-level rectangle picker to ordinary web pages.
- `showSaveFilePicker()` has limited availability, requires HTTPS and a user gesture, so Blob downloads remain the fallback.
- WebCodecs encodes/decodes chunks but does not provide an MP4 muxer. AAC encoding has platform gaps and is unavailable in Firefox; every export configuration must be probed at runtime.

References: MDN `getDisplayMedia`, Screen Capture API, WebCodecs API and codec selection, and File System Access documentation.
