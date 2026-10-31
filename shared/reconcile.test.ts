import { describe, expect, it } from "vitest";
import { reconcileById } from "./reconcile";

type Item = { id: string; title: string };

describe("reconcileById", () => {
  const a: Item = { id: "a", title: "A" };
  const b: Item = { id: "b", title: "B" };

  it("returns the current array when nothing changed", () => {
    const current = [a, b];
    expect(reconcileById(current, structuredClone(current))).toBe(current);
  });

  it("keeps unchanged items and takes changed ones", () => {
    const current = [a, b];
    const next = reconcileById(current, [
      { id: "a", title: "A" },
      { id: "b", title: "B2" },
    ]);
    expect(next).not.toBe(current);
    expect(next[0]).toBe(a);
    expect(next[1]).toEqual({ id: "b", title: "B2" });
  });

  it("follows additions, removals and reordering", () => {
    const current = [a, b];
    expect(reconcileById(current, [b])).toEqual([b]);
    const reordered = reconcileById(current, [
      structuredClone(b),
      structuredClone(a),
    ]);
    expect(reordered).not.toBe(current);
    expect(reordered[0]).toBe(b);
    expect(reordered[1]).toBe(a);
    const added = reconcileById(current, [{ id: "c", title: "C" }, a, b]);
    expect(added.map((item) => item.id)).toEqual(["c", "a", "b"]);
  });

  it("treats a non-array as an empty list", () => {
    expect(reconcileById([a], null)).toEqual([]);
  });
});
