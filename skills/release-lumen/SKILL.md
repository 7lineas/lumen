---
name: release-lumen
description: Build and publish a new Lumen Windows desktop release when the user asks to release, publish, or ship a new version.
---

# Release Lumen

Use this skill for an explicit release request such as “release a new version”. A merged pull request alone is not a release: users receive Lumen through the Windows artifacts and `landing/releases.json` published to Cloudflare R2.

## Release contract

- Work from a clean, up-to-date `main` checkout. If the user explicitly says to include current uncommitted changes, inspect and include only those changes; otherwise stop for unrelated changes, unresolved conflicts, or a different branch. Never reset user work.
- If the user gives a version, use that exact SemVer version. Otherwise increment the patch component of the current `package.json` version. Use a minor or major bump only when the user explicitly requests one.
- Never print or commit R2 credentials. Publishing requires the environment variables `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` (names only here; values live in `.env.local` or the environment). The script also accepts the optional `R2_BUCKET` (default `desktop-releases`), `R2_ENDPOINT`, `R2_REGION` (default `auto`), and `DOWNLOAD_BASE_URL` (default `https://downloads.7lineas.com`).
- If the repository has a local `.env.local` with release credentials, load it only in the current shell immediately before publishing (for example, `set -a; source .env.local; set +a`). Never print, commit, or include those values in command output, logs, or this skill.
- A direct user request to release authorizes the version commit, tag, push, artifact upload, and manifest update. Do not upload anything for a dry-run, planning request, or validation request. Vercel deployment is intentionally outside this skill; after the public desktop release is verified, tell the user when to deploy Vercel.

## Workflow

1. Inspect `git status --short --branch`, `git log`, the current package version, and the latest `landing/releases.json`. Confirm `main` tracks `origin/main`, then fast-forward it with `git pull --ff-only`.
2. Select the next version using the release contract. Update `package.json` with `pnpm version <version> --no-git-tag-version`. Do not invent a second version source.
3. Run the relevant checks before packaging. At minimum run `pnpm exec eslint .` and `pnpm exec vite build`. The normal build uses the tracked local `data/bibles` JSON; `pnpm convert:bibles` is an explicit data refresh and must not be required for a release.
4. Record a build start time, then build both Windows deliverables with `pnpm pack:win` (run it in the foreground or wait for it; a tool call that returns while it is still running in the background can kill it, so confirm the log ends with the `.exe` and `latest.yml` written). Electron Builder configuration must validate before artifacts are accepted. Because `release/` may contain older ignored files, stage the two newly built `.exe` files plus the matching setup `.blockmap` and `latest.yml` in a fresh temporary directory, set that directory as `$release_dir`, and publish from it. Verify both executables are newer than the build start, have the expected setup/portable roles, and that `latest.yml` names the current builder artifact; never let stale files from `release/` win artifact discovery.
5. Preview the release manifest without uploading:

   ```bash
   node scripts/publish-release.mjs --dir "$release_dir" --dry-run --out /tmp/lumen-release-manifest.json
   ```

   Check that the version and both filenames are correct. Never use a previous `release/` artifact when the current build did not complete.

6. Publish the artifacts and `releases.json` using the repository script. Uploads are large and can take several minutes; keep one upload process running, capture its exit status, and do not start duplicate retries while it is active:

   ```bash
   set -a; source .env.local; set +a  # only if credentials are stored there; never print the environment
   node scripts/publish-release.mjs --dir "$release_dir"
   ```

   The script streams each file with `Content-Length` (never the whole file in memory), retries each object up to 4 times with exponential backoff and prints the real `error.cause`. It is resumable and idempotent: objects already in R2 with the same size and MD5 are skipped (`--force` re-uploads). Order is fixed: versioned `.exe` files and blockmap first, then `releases.json`, and `latest.yml` strictly last, so a cut run never advertises a version whose files are missing. It then writes `landing/releases.json`, synchronizes `landing/config.json` with the download base URL and runs the public verification (step 7). If it fails or is interrupted, just run the same command again: finished objects are skipped.

7. Verify the public result from outside. The publish script already does this at the end, and you can repeat it at any time without uploading:

   ```bash
   node scripts/publish-release.mjs --verify
   ```

   It checks that `${DOWNLOAD_BASE_URL}/releases.json` and `latest.yml` name the new version, that `releases.json` has the same sizes and SHA-256 values as the local manifest, and that both versioned executables, the builder `.exe` named by `latest.yml` and its `.blockmap` answer 200 with the expected size. Do not commit or report completion while any check fails or while the public `latest.yml` still names the previous version (installed apps update from it).
8. Only after step 7 passes, in this order: commit the version and generated manifest/config changes with `Release v<version>`, create an annotated tag `v<version>` (`git tag -a v<version> -m "Release v<version>"`), then `git push origin main` and `git push origin v<version>`. Do not commit `release/`; it is ignored. If publishing succeeded but verification or push fails, report the exact completed step and do not claim the release is complete.
9. Finish with the version, public download URLs, commit/tag, validation results, and any known limitation. State clearly whether users can download the new release.

## Known repository boundaries

- `scripts/publish-release.mjs` is the source of truth for artifact naming, hashing, R2 upload, and the public manifest.
- `release/` and generated build directories are ignored. Do not force-add them.
- The packaged app includes tracked local Bible JSON. Do not add third-party Bible downloads back to the production build path; use the explicit converter only when intentionally refreshing source data.
- There is no GitHub Release in this project. Publishing R2 artifacts, `releases.json` and `latest.yml` is what updates the download page and the in-app Actualizar button; installed Windows copies update through electron-updater reading `latest.yml` from the download base URL.
- Keep release credentials in the environment only. Redact them from output and do not place them in command text, commits, or skill files.

## Known failures and fixes

- **`fetch failed` while uploading a ~120 MB `.exe`**: the old script loaded the whole file in memory and used `fetch`, which failed consistently on the third large upload. The script now streams with `Content-Length` over `node:https`; if it still fails it prints the real cause (`code`/`cause`) after 4 attempts. Check connectivity to the R2 endpoint (a `400` from `curl` to the endpoint means it is reachable) and run the same command again; do not hand-roll uploads.
- **The Mac disconnects mid-release** (tool calls report the machine as unreachable) or a background process dies when the tool call ends: nothing is lost, but the state is partial. When the machine is back, run `node scripts/publish-release.mjs --verify` to see what is public, then re-run the publish command with the same `$release_dir` (kept in `/tmp`; rebuild only if it is gone). Already uploaded objects are skipped and `latest.yml` is uploaded last. Do not commit, tag or push until verification passes.
- **`releases.json` says the new version but `latest.yml` is old**: the run was cut before the end. Re-run the publish; do not report the release as done and do not deploy Vercel.
- **Stale artifacts**: if `release/` contains older `.exe` files, copy only files newer than the build start into a fresh `$release_dir` (step 4); never publish straight from `release/`.
- **Credentials**: only the names above may appear in output. Never `echo` the environment or paste values into commands, logs, commits or this file.
