// @ts-check
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

config.watchFolders = [
  ...new Set([...(config.watchFolders ?? []), workspaceRoot]),
];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

config.resolver.blockList = [
  ...(config.resolver.blockList ?? []),
  ...["data", "dist-electron", "release", "landing-dist", "electron"].map(
    (dir) =>
      new RegExp(
        `${path.resolve(workspaceRoot, dir).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\/.*`,
      ),
  ),
];

module.exports = withNativeWind(config, {
  input: path.join(projectRoot, "global.css"),
  configPath: path.join(projectRoot, "tailwind.config.js"),
  typescriptEnvPath: path.join(projectRoot, "nativewind-env.d.ts"),
  disableTypeScriptGeneration: true,
  inlineRem: 16,
});
