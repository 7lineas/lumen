import type { AppSettings, ProjectorPayload } from "@shared/types";

/** Settings that style what the projector shows. Same fields the desktop operator sends. */
export type ProjectorSettings = Pick<
  AppSettings,
  | "churchName"
  | "fontSize"
  | "brightness"
  | "padding"
  | "theme"
  | "backgroundColor"
  | "accentColor"
  | "fadeMs"
  | "backgroundFadeMs"
  | "backgroundImagePath"
>;

function chrome(settings: ProjectorSettings) {
  return {
    churchName: settings.churchName,
    fontSize: settings.fontSize,
    brightness: settings.brightness,
    padding: settings.padding,
    theme: settings.theme,
    backgroundColor: settings.backgroundColor,
    referenceColor: settings.accentColor,
    versionColor: settings.accentColor,
    fadeMs: settings.fadeMs,
    backgroundFadeMs: settings.backgroundFadeMs,
    backgroundImagePath: settings.backgroundImagePath,
  };
}

export function buildVersePayload(
  settings: ProjectorSettings,
  content: { referenceLabel: string; blocks: Array<{ label?: string; text: string }> },
): ProjectorPayload {
  return {
    mode: "verse",
    referenceLabel: content.referenceLabel,
    blocks: content.blocks,
    ...chrome(settings),
  };
}

/** Black screen on the projector, keeping the operator's styling for the next verse. */
export function buildBlankPayload(settings: ProjectorSettings): ProjectorPayload {
  return {
    mode: "blank",
    referenceLabel: "",
    blocks: [],
    ...chrome(settings),
  };
}
