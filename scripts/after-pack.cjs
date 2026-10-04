// electron-builder afterPack hook: brands the Windows app exe (icon + version
// info) before it is packed into the NSIS installer / portable exe.
const fs = require("node:fs");
const path = require("node:path");
const { applyToFile, inspectExe, readIcoSizes } = require("./win-exe-resources.cjs");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;
  const { appOutDir, packager } = context;
  const productName = packager.appInfo.productName;
  const exePath = path.join(appOutDir, `${packager.appInfo.productFilename}.exe`);
  const icoPath = path.join(packager.projectDir, "build", "icon.ico");
  const icoBuffer = fs.readFileSync(icoPath);
  applyToFile(exePath, {
    icoBuffer,
    productName,
    version: packager.appInfo.version,
    companyName: "7Lineas",
    description: productName,
    copyright: `Copyright © ${new Date().getFullYear()} 7Lineas`,
    originalFilename: `${packager.appInfo.productFilename}.exe`,
  });
  const check = inspectExe(fs.readFileSync(exePath));
  const sizes = check.groups.flatMap((group) => group.sizes);
  const expected = readIcoSizes(icoBuffer);
  if (check.strings.ProductName !== productName || expected.some((size) => !sizes.includes(size))) {
    throw new Error(`El icono o la información de ${exePath} no quedaron aplicados`);
  }
  console.log(`  • icono y metadatos aplicados a ${path.basename(exePath)} (${check.groups.length} grupo, tamaños ${sizes.join(",")})`);
};
