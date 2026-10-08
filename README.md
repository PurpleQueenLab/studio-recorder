# Studio Recorder

Studio Recorder is an open-source, browser-based screen recorder and editor designed as a polished local creative tool. It captures screen, camera and microphone sources without uploading user media.

The current editor includes non-destructive crop presets and drag handles, canvas/aspect controls, camera-bubble composition, real timeline in/out trims, range deletion, video/audio splitting, focal-point zoom events, cursor styling, undo/redo, and a locally encoded standards-compliant MP4 export path. MP4, MOV and WebM files supported by the active browser can be imported as new projects or appended as reorderable clips. Camera-only recordings use the camera track as the primary editor and export source. The separate Audio Tools workspace can locally preview an imported file, its waveform, trim range, volume, and fades.

## Privacy model

- No account, authentication, cloud recording, remote media processing or media telemetry.
- Recording chunks and project metadata are stored in this browser using IndexedDB.
- Clearing site data can remove local projects. Save finished videos explicitly to your computer.
- Vercel may host the static application, but it is not a media store.
- Bug reports send only the text, optional contact email, technical fields shown in the form, and an optional screenshot selected by the reporter. Project media is never attached.

Automatic zoom is intentionally limited to clicks Studio Recorder can honestly observe while its own captured tab is visible. Ordinary browser capture does not expose system-wide pointer coordinates for arbitrary windows or screens. Manual focal-point zoom is available for every recording; a future optional native helper could broaden pointer capture without changing the local-first media model.

Chrome and Edge desktop are the primary V1 targets. Safari and Firefox are supported only where runtime capability checks pass. See [BROWSER_CAPABILITIES.md](./BROWSER_CAPABILITIES.md).

## Local development

Requires Node.js 22 or later.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Localhost is treated as a secure context by browsers, but screen/camera permissions still require a user gesture.

## Quality checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Deployment

Vercel should connect to this public repository with `main` as the sole production branch. Pull requests receive isolated preview deployments. Production deployment happens only after an approved pull request passes required checks and is merged into protected `main`.

### Deploy your own independent fork

1. Fork the repository into your own GitHub account.
2. Clone that fork and create a feature branch.
3. Run `npm install`, `npm run dev`, and the quality-check commands above.
4. Customize the application without adding any dependency on the original deployment.
5. Import your fork as a new project in your own Vercel account. Keep its Root Directory at the repository root, Framework Preset on Next.js, and Production Branch on your fork's `main`.
6. Optionally attach a domain you control.

Every domain/origin receives separate browser storage. A fork has no access to the original repository, Vercel project, domain, browser storage, recordings, or projects. No original-owner credentials are needed, and none are shipped in this repository.

For the owner repository, protect `main`, require the CI `quality` job and at least one owner review, dismiss stale approvals, block force pushes/deletion, and restrict direct pushes where the GitHub plan permits. Configure Vercel to produce previews for pull requests but production releases only from the owner's `main`. Never make production secrets available to workflows triggered from forks.

### Optional bug-report email

The `/api/bug-report` route uses the Resend HTTPS API and fixed server-owned sender/recipient values. Copy `.env.example` to `.env.local` for local development, or configure these only in the Vercel project settings:

```text
RESEND_API_KEY
BUG_REPORT_TO_EMAIL
BUG_REPORT_FROM_EMAIL
NEXT_PUBLIC_APP_VERSION (optional, non-secret)
```

Never prefix the three email credentials with `NEXT_PUBLIC_`. Do not expose production values to preview deployments from untrusted forks; leave the endpoint unconfigured or use separately scoped preview credentials. The form keeps entered text on delivery failure and offers a copy action.

## Contributing

Issues, forks and pull requests are welcome. Read [CONTRIBUTING.md](./CONTRIBUTING.md), [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) and [SECURITY.md](./SECURITY.md) first. The project uses the [MIT License](./LICENSE).

Major runtime dependencies are Next.js/React (MIT), Tailwind CSS (MIT), Hugeicons React/core-free-icons (MIT), and MediaBunny (MPL-2.0). See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md). Figma reference imagery is included only as design-development fixture content and should be replaced by user-owned recordings in production releases.
