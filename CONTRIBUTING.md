# Contributing

Thank you for improving Studio Recorder.

1. Fork the public repository and clone your fork.
2. Create a focused branch such as `feat/crop-overlay`, `fix/permission-recovery`, or `docs/browser-support`.
3. Run `npm install`, then `npm run dev`.
4. Keep media local, preserve independent sources, use semantic tokens, and feature-detect browser APIs.
5. Add tests for changed project models, storage, crop/zoom math, capability behavior or UI flows.
6. Run typecheck, lint, tests and production build before opening a pull request.

Pull requests should explain user impact, privacy implications, supported browsers, test evidence and screenshots for visual changes. Keep changes small enough to review. Never add credentials, uploaded recordings, telemetry, remote storage, incompatible assets or generated build output.

Contributors cannot deploy production. CI and preview deployments run in isolated branch contexts; only maintainers may approve and merge into protected `main`.

You are equally welcome to keep changes in your fork and deploy them independently. Fork deployments use their own Vercel project, domain and origin-scoped local browser storage; they do not need or receive access to the owner's infrastructure.
