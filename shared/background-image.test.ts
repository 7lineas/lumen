import { describe, expect, it } from "vitest";
import { slideThumbnailUrl } from "./background-image";

describe("slideThumbnailUrl", () => {
  it("points at the thumbnail sidecar of a slide image", () => {
    const url = slideThumbnailUrl("/data/slide-images/1-0.png");
    expect(url).toBe(
      `lumen-media://local/media/${encodeURIComponent("/data/slide-images/1-0.png.thumbnail.jpg")}`,
    );
  });

  it("is undefined without a path", () => {
    expect(slideThumbnailUrl(null)).toBeUndefined();
    expect(slideThumbnailUrl("")).toBeUndefined();
  });
});
