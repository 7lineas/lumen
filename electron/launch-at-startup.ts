import { app } from "electron";

/**
 * Login item options for Lumen. The portable Windows build runs from a
 * temporary copy of itself, so the login item has to point at the file the
 * user actually launched; everywhere else the default (the running app) is used.
 */
export function loginItemSettings(options: {
  enabled: boolean;
  platform: NodeJS.Platform;
  portableFile?: string;
}): Electron.Settings {
  const { enabled, platform, portableFile } = options;
  return {
    openAtLogin: enabled,
    ...(platform === "win32" && portableFile ? { path: portableFile } : {}),
  };
}

/**
 * Opens Lumen at sign-in, or stops it. Only the installed app is registered:
 * a development run would add the bare Electron binary to the login items,
 * and the isolated test profile must never touch them.
 */
export function applyLaunchAtStartup(enabled: boolean): void {
  if (!app.isPackaged || process.env.LUMEN_TEST_USERDATA) return;
  app.setLoginItemSettings(
    loginItemSettings({
      enabled,
      platform: process.platform,
      portableFile: process.env.PORTABLE_EXECUTABLE_FILE,
    }),
  );
}
