// Pure-JS (no wine, no rcedit) editing of the Windows resources of an .exe:
// the application icon and the version info that Explorer, the taskbar and
// Task Manager show. electron-builder is configured with
// `signAndEditExecutable: false` (it needs wine/winCodeSign off Windows), so
// without this the packaged Lumen.exe keeps Electron's icon and metadata.
const fs = require("node:fs");
const ResEdit = require("resedit");

const RT_VERSION = 16;
const LANG_EN_US = 1033;
const CODEPAGE_UNICODE = 1200;

/** Sizes and bit depths of the icon group embedded in an .ico file. */
function readIcoSizes(icoBuffer) {
  if (icoBuffer.length < 6 || icoBuffer.readUInt16LE(0) !== 0 || icoBuffer.readUInt16LE(2) !== 1) {
    throw new Error("El archivo no es un .ico válido");
  }
  const count = icoBuffer.readUInt16LE(4);
  const sizes = [];
  for (let i = 0; i < count; i += 1) {
    sizes.push(icoBuffer[6 + 16 * i] || 256);
  }
  return sizes;
}

/** Icon groups (sizes) and version strings currently inside an .exe. */
function inspectExe(exeBuffer) {
  const exe = ResEdit.NtExecutable.from(exeBuffer);
  const resources = ResEdit.NtExecutableResource.from(exe);
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries).map((group) => ({
    id: group.id,
    sizes: group.icons.map((icon) => icon.width || 256),
  }));
  const info = ResEdit.Resource.VersionInfo.fromEntries(resources.entries)[0];
  const languages = info ? info.getAllLanguagesForStringValues() : [];
  const strings = info && languages[0] ? info.getStringValues(languages[0]) : {};
  return { groups, strings };
}

/**
 * Replaces the icon (all group ids, so the exe icon is ours whichever id the
 * Electron binary used) and the version strings. Returns the new exe bytes.
 */
function applyWindowsResources(exeBuffer, options) {
  const { icoBuffer, productName, version, companyName, description, copyright, originalFilename } = options;
  readIcoSizes(icoBuffer);
  const exe = ResEdit.NtExecutable.from(exeBuffer);
  const resources = ResEdit.NtExecutableResource.from(exe);

  const icon = ResEdit.Data.IconFile.from(icoBuffer);
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries);
  const groupIds = groups.length > 0 ? groups.map((group) => ({ id: group.id, lang: group.lang })) : [{ id: 1, lang: LANG_EN_US }];
  for (const { id, lang } of groupIds) {
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
      resources.entries,
      id,
      lang,
      icon.icons.map((item) => item.data),
    );
  }

  // Drop the original version info (Electron's) and write ours from scratch,
  // so no leftover language block can win over it.
  for (let i = resources.entries.length - 1; i >= 0; i -= 1) {
    if (resources.entries[i].type === RT_VERSION) resources.entries.splice(i, 1);
  }
  const info = ResEdit.Resource.VersionInfo.createEmpty();
  const [major = 0, minor = 0, patch = 0] = String(version).split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  info.setFileVersion(major, minor, patch, 0, LANG_EN_US);
  info.setProductVersion(major, minor, patch, 0, LANG_EN_US);
  info.setStringValues(
    { lang: LANG_EN_US, codepage: CODEPAGE_UNICODE },
    {
      CompanyName: companyName,
      FileDescription: description ?? productName,
      FileVersion: String(version),
      InternalName: productName,
      LegalCopyright: copyright ?? "",
      OriginalFilename: originalFilename ?? `${productName}.exe`,
      ProductName: productName,
      ProductVersion: String(version),
    },
  );
  info.outputToResourceEntries(resources.entries);
  resources.outputResource(exe);
  return Buffer.from(exe.generate());
}

function applyToFile(exePath, options) {
  const output = applyWindowsResources(fs.readFileSync(exePath), options);
  fs.writeFileSync(exePath, output);
}

module.exports = { readIcoSizes, inspectExe, applyWindowsResources, applyToFile };
