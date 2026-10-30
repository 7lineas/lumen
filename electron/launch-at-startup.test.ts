import { describe, expect, it } from "vitest";
import { loginItemSettings } from "./launch-at-startup";

describe("loginItemSettings", () => {
  it("opens at sign-in when enabled and removes it when disabled", () => {
    expect(loginItemSettings({ enabled: true, platform: "darwin" })).toEqual({
      openAtLogin: true,
    });
    expect(loginItemSettings({ enabled: false, platform: "win32" })).toEqual({
      openAtLogin: false,
    });
  });

  it("points the Windows portable build at the file the user launched", () => {
    expect(
      loginItemSettings({
        enabled: true,
        platform: "win32",
        portableFile: "C:\\Lumen\\Lumen-1.3.1-portable.exe",
      }),
    ).toEqual({
      openAtLogin: true,
      path: "C:\\Lumen\\Lumen-1.3.1-portable.exe",
    });
  });

  it("ignores the portable path outside Windows", () => {
    expect(
      loginItemSettings({
        enabled: true,
        platform: "darwin",
        portableFile: "/Applications/Lumen.app",
      }),
    ).toEqual({ openAtLogin: true });
  });
});
