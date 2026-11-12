// Language names and codes for the brief's language picker. Browser-safe.
/** "German (Germany)" for de-DE; the code itself when the browser does not know it. */
export function localeName(code: string) {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}
/** A language code as the brief accepts it: language, then optional script or region parts (de, de-DE, zh-Hans-CN). */
export const localeCode = (text: string) => {
  const parts = text.trim().replace(/_/g, "-").split("-").filter(Boolean);
  if (!parts.length || !/^[a-zA-Z]{2,3}$/.test(parts[0]) || parts.slice(1).some((p) => !/^[a-zA-Z0-9]{2,8}$/.test(p))) return null;
  return [parts[0].toLowerCase(), ...parts.slice(1).map((p) => (p.length === 2 ? p.toUpperCase() : p.length === 4 ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p))].join("-");
};
