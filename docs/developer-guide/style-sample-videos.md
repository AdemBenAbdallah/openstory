---
title: Style Sample Videos
description: Generate, render, upload, and seed the canonical + bespoke sample videos shown on each style
section: Developer Guide
order: 6
---

Every style carries a short **sample video** that demos the look. There are two
flavours:

- **Canonical** (every style) — a per-category one-line brief is enhanced
  **server-side** by the platform's script-enhancer into a style-appropriate
  ~15s script (same brief within a category ⇒ comparable samples).
- **Bespoke** (~10 hero styles) — a hand-curated script from `BESPOKE_SCRIPTS`.

Every sample renders through the **real OpenStory pipeline** via
`POST /api/v1/sequences` (issue #801) — scene split, character bible +
reference sheets, frame images, motion, music. That keeps recurring
people/characters consistent across shots (a per-beat text-to-image call
can't — the person would change face/hair/wardrobe every cut) and exercises
the production path end-to-end. There is no direct-fal render path.

The per-frame clips are **concatenated into one mp4** locally (the platform
has no server-side assembly — final export in the product is client-side).

All the moving parts live in `scripts/generate-style-sample-videos.ts`,
`scripts/upload-style-sample-videos-to-r2.ts`,
`scripts/seed-style-sample-videos.ts`, the data/helpers in
`src/look/server/sample-videos.ts`, and the public-API client in
`scripts/sample-pipeline.ts`.

## Prerequisites

- `OPENSTORY_API_KEY` — an `osk_…` public-API key (Settings → Developer on the
  target site). The key's **team** must have the template styles seeded
  (live: already there; local: `bun db:setup`) and enough **credits** —
  generation bills the platform (images + motion + music per sequence).
  Without it the run is a dry-run.
- `OPENSTORY_API_URL` — defaults to the **live site** (`https://openstory.so`).
  To test against local instead, set `http://localhost:3000` and start
  `bun dev` first (workflows run in-process in Workerd).
- `ffmpeg` on `PATH` — clips are concatenated with the system binary.
- Cloudflare creds for upload — the default path shells out to `wrangler`.

No `FAL_KEY` or `OPENROUTER_KEY` is needed — all generation (including script
enhancement) happens on the platform.

## How a render actually runs

It is **one command**. Per job:

```
POST /api/v1/sequences              # canonical: raw brief, enhance ALWAYS (platform enhances,
                                    #   targetSeconds ~15; enhanced script saved as {kind}.enhanced.txt)
                                    # bespoke / override: reviewed prose, enhance OFF
                                    # style by name, recommended image/video models, motion on, music on
persist id -> {kind}.sequence.json  # re-runs resume from this id instead of re-creating
long-poll GET /api/v1/sequences/:id?wait=60s   # logs images m/n, clips m/n as they advance
verify: completed AND every frame video ready (none failed)
download per-frame clips (+ stills, review-only) -> _frames/
concat clips -> {canonical|bespoke}.mp4
```

For a **bespoke** sample, the curated beats are flattened into shot prose
(`beatsToScript`) before being sent — the pipeline takes a script, not
per-shot prompts, so its scene split decides the final shots. Styles with a
hand-written script in `CANONICAL_SCRIPT_OVERRIDES`
(`src/look/server/sample-videos.ts` — currently `documentary`, a poor fit for
the shared film brief) also send their prose verbatim (`enhance: 'off'`).

**Fire-and-forget:** `--submit-only` creates all sequences (ids →
`{kind}.sequence.json`) and exits without polling; re-run later **without**
the flag and each job resumes from its saved id (poll → download → concat)
instead of creating a new sequence. `--force` ignores the saved id and
creates a fresh one. Any run that finds a `sequence.json` resumes it — so a
crashed render picks up where it left off too.

Music is requested (`music: true`) so each sequence on the account gets its
soundtrack, but it's a **sequence-level asset** mixed client-side in the app —
the downloaded frame clips (and therefore the local concat mp4s) stay silent.

## Steps

### 1. Dry-run to see the plan + bill

```bash
bun scripts/generate-style-sample-videos.ts --dry-run
```

Prints resolved models + the brief per style + a motion-cost indicator.
(A run with no `OPENSTORY_API_KEY` is implicitly a dry-run too.) The real
bill is in platform credits against the API key's team.

### 2. Render one style first to sanity-check quality

```bash
# OPENSTORY_API_KEY lives in .env.admin, which bun does NOT autoload —
# pass it explicitly:
bun --env-file=.env.admin scripts/generate-style-sample-videos.ts --filter "Documentary"
```

Watch the output mp4 and the intermediate `_frames/` — specifically check
that a recurring person holds face/hair/wardrobe across the cuts. The
platform-enhanced script lands in `{kind}.enhanced.txt` for review.

### 3. Render the rest

```bash
bun --env-file=.env.admin scripts/generate-style-sample-videos.ts
```

Or fire-and-forget: add `--submit-only`, come back later, and re-run the same
command without the flag to collect everything.

Useful flags / env:

| Flag / env                                            | Effect                                                                 |
| ----------------------------------------------------- | ---------------------------------------------------------------------- |
| `--filter "<name>"`                                   | One style at a time                                                    |
| `--canonical-only` / `--bespoke-only` / `--hero-only` | Restrict which samples render                                          |
| `--force`                                             | Re-render even if the output mp4 exists (also re-creates the sequence) |
| `--submit-only`                                       | Create sequences + save ids, no polling — re-run without it to collect |
| `OPENSTORY_API_URL` (default `https://openstory.so`)  | App origin (set `http://localhost:3000` + `bun dev` to test locally)   |
| `OPENSTORY_API_KEY`                                   | `osk_…` key — without it the run is a dry-run                          |

### 4. Review locally, then upload to R2

```bash
bun scripts/upload-style-sample-videos-to-r2.ts --dry-run   # list keys, no upload
bun run styles:sample-videos:upload                          # wrangler (default)
```

Uploads `canonical.mp4` / `bespoke.mp4` to `styles/{slug}/…` in the public
bucket. The default is `wrangler` (account-wide token, reliable write access).
Only add `--s3` if you have **unscoped** `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` /
`R2_SECRET_ACCESS_KEY` — scoped R2 keys 403 against `openstory-public-assets`.

### 5. Seed the database

```bash
bun run styles:sample-videos:seed:local                      # local D1
bun run styles:sample-videos:seed:d1                         # prod D1 (HTTP)
```

Builds each style's expected R2 URLs, **validates every one is reachable**, and
aborts if any is missing (no partial writes) before writing the
`styles.sampleVideos` JSON for the system team. Add `--dry-run` to validate
without writing.

## Outputs

```
sample-videos/{slug}/
  canonical.mp4                 # final rendered video (every style)
  bespoke.mp4                   # hero styles only
  canonical.sequence.json       # created sequence id (resumed on re-run)
  canonical.enhanced.txt        # platform-enhanced script (canonical, for review)
  _frames/{canonical|bespoke}/
    {nn}-{frameId}.{webp|mp4}   # per-frame stills + clips (playback order)
```

Public URLs after upload:
`https://{VITE_R2_PUBLIC_ASSETS_DOMAIN}/styles/{slug}/{canonical|bespoke}.mp4`.

The `_frames/*.webp` stills are review-only intermediates — nothing downstream
consumes them. The still thumbnails shown in the UI come from the separate
[Style Previews](./style-previews.md) pipeline, not from these video frames.

## TL;DR

```
--dry-run  →  render --filter (one)  →  render all (or --submit-only + collect)  →  upload  →  seed
```

Iterate on steps 1–2 for a single style until it looks right, then fan out to
the full set.

## package.json aliases

```bash
bun run styles:sample-videos              # render (steps 2–3)
bun run styles:sample-videos:upload       # upload  (step 4)
bun run styles:sample-videos:seed:local   # seed local D1 (step 5)
bun run styles:sample-videos:seed:d1      # seed prod D1
```
