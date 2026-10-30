import { describe, expect, it } from "vitest";
import { parseSseFrames } from "./sse-frames";

describe("parseSseFrames", () => {
  it("reads complete frames and keeps the partial tail", () => {
    const buffer =
      ': connected\n\ndata: {"event":"projector:update","payload":{"mode":"blank"}}\n\ndata: {"event":"settings:update","pay';
    const { events, rest } = parseSseFrames(buffer);
    expect(events).toEqual([
      { event: "projector:update", payload: { mode: "blank" } },
    ]);
    expect(rest).toBe('data: {"event":"settings:update","pay');
  });

  it("drops malformed frames without throwing", () => {
    const { events } = parseSseFrames("data: {nope\n\n");
    expect(events).toEqual([]);
  });
});
