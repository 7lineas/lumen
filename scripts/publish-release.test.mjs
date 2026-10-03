import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { joinDownloadUrl } from "../landing/download-url.js";
import {
  artifactFilename,
  buildReleaseManifest,
  DEFAULT_DOWNLOAD_BASE_URL,
  findWindowsArtifacts,
  signS3Request,
} from "./publish-release.mjs";

describe("joinDownloadUrl", () => {
  it("joins the base and a safe filename once", () => {
    expect(joinDownloadUrl("https://downloads.example.invalid/", "lumen-1.0.0-setup.exe")).toBe(
      "https://downloads.example.invalid/lumen-1.0.0-setup.exe",
    );
  });

  it("rejects a filename that could leave the bucket", () => {
    expect(joinDownloadUrl("https://downloads.example.invalid", "../secreto.exe")).toBe("");
    expect(joinDownloadUrl("https://downloads.example.invalid", "https://otro.example/a.exe")).toBe("");
    expect(joinDownloadUrl("", "lumen-1.0.0-setup.exe")).toBe("");
  });
});

describe("signS3Request", () => {
  it("matches the AWS PUT Object signature example", () => {
    const signed = signS3Request({
      method: "PUT",
      url: "https://examplebucket.s3.amazonaws.com/test$file.text",
      headers: {
        date: "Fri, 24 May 2013 00:00:00 GMT",
        "x-amz-storage-class": "REDUCED_REDUNDANCY",
      },
      payloadHash: "44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      region: "us-east-1",
      amzDate: "20130524T000000Z",
    });

    expect(signed.stringToSign).toContain(
      "9e0e90d9c76de8fa5b200d8c849cd5b8dc7a3be3951ddb7f6a76b4158342019d",
    );
    expect(signed.authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request,SignedHeaders=date;host;x-amz-content-sha256;x-amz-date;x-amz-storage-class,Signature=98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd",
    );
  });
});

describe("release manifest", () => {
  it("names artifacts in ASCII and records size and sha256", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "proyector-release-"));
    const setupPath = path.join(dir, "Lumen-1.0.0-win-x64.exe");
    const portablePath = path.join(dir, "Lumen-1.0.0-portable.exe");
    await writeFile(setupPath, "instalador");
    await writeFile(portablePath, "portable");

    const found = await findWindowsArtifacts(dir);
    const manifest = await buildReleaseManifest({
      version: "1.0.0",
      releasedAt: "2026-09-29",
      setupPath: found.setup,
      portablePath: found.portable,
    });

    expect(manifest.files.map((file) => file.filename)).toEqual([
      artifactFilename("1.0.0", "setup"),
      artifactFilename("1.0.0", "portable"),
    ]);
    expect(manifest.downloadBaseUrl).toBe(DEFAULT_DOWNLOAD_BASE_URL);
    expect(manifest.files[0].bytes).toBe(Buffer.byteLength("instalador"));
    expect(manifest.files[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.files[1].sha256).not.toBe(manifest.files[0].sha256);
  });
});

describe("public download base", () => {
  it("points the landing at downloads.7lineas.com", async () => {
    const config = JSON.parse(await readFile(new URL("../landing/config.json", import.meta.url), "utf8"));
    const releases = JSON.parse(await readFile(new URL("../landing/releases.json", import.meta.url), "utf8"));
    expect(config.DOWNLOAD_BASE_URL).toBe("https://downloads.7lineas.com");
    expect(releases.downloadBaseUrl).toBe("https://downloads.7lineas.com");
    expect(joinDownloadUrl(config.DOWNLOAD_BASE_URL, releases.files[0].filename)).toBe(
      `https://downloads.7lineas.com/${artifactFilename(releases.version, "setup")}`,
    );
  });
});

describe("bible licenses", () => {
  it("credits every bundled translation and the downloadable catalog", async () => {
    const licenses = JSON.parse(await readFile(new URL("../shared/bible-licenses.json", import.meta.url), "utf8"));
    const manifest = JSON.parse(await readFile(new URL("../data/bibles/manifest.json", import.meta.url), "utf8"));
    const catalog = JSON.parse(await readFile(new URL("../data/bible-modules/bibles-catalog.json", import.meta.url), "utf8"));
    const ids = licenses.versions.map((version) => version.id);
    for (const version of manifest) expect(ids).toContain(version.id);
    for (const version of catalog.versions) expect(ids).toContain(version.id);
    for (const version of licenses.versions) {
      expect(version.name).toBeTruthy();
      expect(version.license).toBeTruthy();
      expect(version.copyright).toBeTruthy();
      expect(version.sourceName).toBeTruthy();
      expect(version.sourceUrl).toMatch(/^https:\/\//);
      expect(version.attribution).toBeTruthy();
      expect(version.availability).toBeTruthy();
    }
    expect(licenses.distributionNote).toMatch(/sin modificar/i);
    expect(licenses.distributionNote).toMatch(/no se vende/i);
    expect(ids).not.toContain("rvr1960");
    expect(ids).not.toContain("rvg");
  });
});
