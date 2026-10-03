---
name: release-lumen
description: Build and publish a new Lumen Windows desktop release when the user asks to release, publish, or ship a new version.
---

# Release Lumen

Use this skill for an explicit release request such as “release a new version”. A merged pull request alone is not a release: users receive Lumen through the Windows artifacts and `landing/releases.json` published to Cloudflare R2.

## Release contract

- Work from a clean, up-to-date `main` checkout. If the user explicitly says to include current uncommitted changes, inspect and include only those changes; otherwise stop for unrelated changes, unresolved conflicts, or a different branch. Never reset user work.
- If the user gives a version, use that exact SemVer version. Otherwise increment the patch component of the current `package.json` version. Use a minor or major bump only when the user explicitly requests one.
- Never print or commit R2 credentials. Publishing requires `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`; the script also accepts `R2_BUCKET`, `R2_ENDPOINT`, `R2_REGION`, and `DOWNLOAD_BASE_URL`.
- A direct user request to release authorizes the version commit, tag, push, artifact upload, and manifest update. Do not upload anything for a dry-run, planning request, or validation request. Vercel deployment is intentionally outside this skill; after the public desktop release is verified, tell the user when to deploy Vercel.

## Workflow

1. Inspect `git status --short --branch`, `git log`, the current package version, and the latest `landing/releases.json`. Confirm `main` tracks `origin/main`, then fast-forward it with `git pull --ff-only`.
2. Select the next version using the release contract. Update `package.json` with `pnpm version <version> --no-git-tag-version`. Do not invent a second version source.
3. Run the relevant checks before packaging. At minimum run `pnpm exec eslint .` and `pnpm exec vite build`. The normal build uses the tracked local `data/bibles` JSON; `pnpm convert:bibles` is an explicit data refresh and must not be required for a release.
4. Record a build start time, then build both Windows deliverables with `pnpm pack:win`. Electron Builder configuration must validate before artifacts are accepted. Because `release/` may contain older ignored files, stage only the two newly built `.exe` files in a fresh temporary directory and publish from that directory. Verify both files are newer than the build start, have the expected setup/portable roles, and are not stale artifacts.
5. Preview the release manifest without uploading:

   ```bash
   node scripts/publish-release.mjs --dir release --dry-run --out /tmp/lumen-release-manifest.json
   ```

   Check that the version and both filenames are correct. Never use a previous `release/` artifact when the current build did not complete.

6. Publish the artifacts and `releases.json` using the repository script. Uploads are large and can take several minutes; keep one upload process running, capture its exit status, and do not start duplicate retries while it is active:

   ```bash
   node scripts/publish-release.mjs --dir release
   ```

   This hashes both files, writes `landing/releases.json`, uploads both executables and the manifest to R2, and synchronizes `landing/config.json` with the download base URL.

7. Verify the public result by fetching `${DOWNLOAD_BASE_URL}/releases.json` (default `https://downloads.7lineas.com/releases.json`). Confirm the returned version, filenames, and SHA-256 values match the local manifest. Check both artifact URLs return successfully when network access allows it. Do not commit or report completion while the public manifest still names the previous version.
8. Commit the version and generated manifest/config changes with `Release v<version>`, create an annotated tag `v<version>`, and push the commit and tag to `origin/main`. Do not commit `release/`; it is ignored. If publishing succeeded but verification or push fails, report the exact completed step and do not claim the release is complete.
9. Finish with the version, public download URLs, commit/tag, validation results, and any known limitation. State clearly whether users can download the new release.

## Known repository boundaries

- `scripts/publish-release.mjs` is the source of truth for artifact naming, hashing, R2 upload, and the public manifest.
- `release/` and generated build directories are ignored. Do not force-add them.
- The packaged app includes tracked local Bible JSON. Do not add third-party Bible downloads back to the production build path; use the explicit converter only when intentionally refreshing source data.
- There is no GitHub Release or Electron auto-updater in this project. Publishing R2 artifacts and `releases.json` is what updates the download page; existing installed copies do not update automatically.
- Keep release credentials in the environment only. Redact them from output and do not place them in command text, commits, or skill files.
