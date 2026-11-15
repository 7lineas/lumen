export function isPdfPath(filePath: string): boolean {
  return /\.pdf$/i.test(filePath);
}

export function isUnsupportedPresentationPath(filePath: string): boolean {
  return /\.(key|ppt|pot|pps|odp|otp)$/i.test(filePath);
}

export function slideLabel(index: number): string {
  return `Diapositiva ${index + 1}`;
}
