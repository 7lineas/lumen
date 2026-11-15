import { app } from "electron";

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
