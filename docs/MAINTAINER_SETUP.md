# Maintainer setup

These host-side controls must be configured after the public GitHub repository and Vercel project exist.

## GitHub

Protect `main` with a repository ruleset:

- require pull requests and one approving owner review;
- dismiss stale approvals after new commits;
- require the `quality` status check;
- require branches to be up to date;
- block force pushes and branch deletion;
- restrict direct updates to the owner/maintainer role where the plan permits;
- enable private vulnerability reporting.

The CI workflow has read-only repository permissions and uses the `pull_request` event. Do not change it to `pull_request_target` for untrusted contribution code and do not add production secrets.

## Vercel

- Import only the owner repository into the owner Vercel project.
- Set Production Branch to `main`.
- Enable GitHub pull-request previews as isolated deployments.
- Do not expose sensitive production variables to preview deployments or fork-originated workflows.
- Do not connect contributor forks to the owner project. Contributors import forks into their own Vercel accounts.

Studio Recorder currently requires no runtime secrets. Keep it that way unless a reviewed future feature has a genuine need and preserves the local-media boundary.
