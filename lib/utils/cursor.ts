export function decodeCursorParam(
  value: string | string[] | undefined,
): string | undefined {
  if (!value) return undefined;

  const candidate = Array.isArray(value) ? value[0] : value;

  if (!candidate) return undefined;

  try {
    return decodeURIComponent(candidate);
  } catch {
    return candidate;
  }
}

export function encodeCursorParam(value: string | null | undefined): string | null {
  if (!value) return null;
  return encodeURIComponent(value);
}

