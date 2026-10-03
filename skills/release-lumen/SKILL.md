---
name: release-lumen
description: Build and publish a new Lumen Windows desktop release when the user asks to release, publish, or ship a new version.
---

# Release Lumen

Use this skill for an explicit release request such as “release a new version”. A merged pull request alone is not a release: users receive Lumen through the Windows artifacts and `landing/releases.json` published to Cloudflare R2.

## Release contract

- Work from a clean, up-to-date `main` checkout. Stop if there are unrelated changes, unresolved conflicts, or a different branch; preserve user work rather than resetting it.
- If the user gives a version, use that exact SemVer version. Otherwise increment the patch component of the current `package.json` version. Use a minor or major bump only when the user explicitly requests one.
- Never print or commit R2 credentials. Publishing requires `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`; the script also accepts `R2_BUCKET`, `R2_ENDPOINT`, `R2_REGION`, and `DOWNLOAD_BASE_URL`.
- A direct user request to release authorizes the version commit, tag, push, artifact upload, and manifest update. Do not upload anything for a dry-run, planning request, or validation request.

## Workflow

1. Inspect `git status --short --branch`, `git log`, the current package version, and the latest `landing/releases.json`. Confirm `main` tracks `origin/main`, then fast-forward it with `git pull --ff-only`.
2. Select the next version using the release contract. Update `package.json` with `pnpm version <version> --no-git-tag-version`. Do not invent a second version source.
3. Run the relevant checks before packaging. At minimum run `pnpm exec eslint .` and `pnpm exec vite build`. The package `pnpm build` and Windows pack commands run the Bible conversion downloader; if that external downloader fails, stop and report it instead of publishing stale artifacts.
4. Build both Windows deliverables with `pnpm pack:win`. Verify that `release/` contains exactly the setup and portable `.exe` artifacts expected by `scripts/publish-release.mjs`, and that their timestamps/sizes changed during this build.
5. Preview the release manifest without uploading:

   ```bash
   node scripts/publish-release.mjs --dir release --dry-run --out /tmp/lumen-release-manifest.json
   ```

   Check that the version and both filenames are correct. Never use a previous `release/` artifact when the current build did not complete.

6. Publish the artifacts and `releases.json` using the repository script:

   ```bash
   node scripts/publish-release.mjs --dir release
   ```

   This hashes both files, writes `landing/releases.json`, uploads both executables and the manifest to R2, and synchronizes `landing/config.json` with the download base URL.

7. Verify the public result by fetching `${DOWNLOAD_BASE_URL}/releases.json` (default `https://downloads.7lineas.com/releases.json`). Confirm the returned version, filenames, and SHA-256 values match the local manifest. Check both artifact URLs return successfully when network access allows it.
8. Commit the version and generated manifest/config changes with `Release v<version>`, create an annotated tag `v<version>`, and push the commit and tag to `origin/main`. Do not commit `release/`; it is ignored. If publishing succeeded but verification or push fails, report the exact completed step and do not claim the release is complete.
9. Finish with the version, public download URLs, commit/tag, validation results, and any known limitation. State clearly whether users can download the new release.

## Known repository boundaries

- `scripts/publish-release.mjs` is the source of truth for artifact naming, hashing, R2 upload, and the public manifest.
- `release/` and generated build directories are ignored. Do not force-add them.
- There is no GitHub Release or Electron auto-updater in this project. Publishing R2 artifacts and `releases.json` is what updates the download page; existing installed copies do not update automatically.
- Keep release credentials in the environment only. Redact them from output and do not place them in command text, commits, or skill files.
