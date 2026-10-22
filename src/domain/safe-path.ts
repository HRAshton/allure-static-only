/** Reject untrusted report-relative paths before resolving attachments or archives. */
export function safeReportPath(raw: string): string {
  if (
    !raw ||
    /^(?:[\\/]|[A-Za-z]:[\\/])/.test(raw) ||
    [...raw].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  ) {
    throw new Error("Report path is absolute or invalid.");
  }
  const parts = raw.replaceAll("\\", "/").split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error("Report path contains unsafe segments.");
  }
  return parts.join("/");
}
