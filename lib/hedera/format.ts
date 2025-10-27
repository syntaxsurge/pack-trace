export interface ConsensusFormatOptions
  extends Intl.DateTimeFormatOptions {
  locale?: string;
}

export function consensusTimestampToDate(
  value: string,
): Date | null {
  const [secondsRaw] = value.split(".");
  const seconds = Number(secondsRaw);

  if (Number.isNaN(seconds)) {
    return null;
  }

  return new Date(seconds * 1000);
}

export function formatConsensusTimestamp(
  value: string,
  options: ConsensusFormatOptions = {},
): string {
  const date = consensusTimestampToDate(value);

  if (!date || Number.isNaN(date.getTime())) {
    return value;
  }

  const { locale = "en", ...formatOptions } = options;
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "medium",
    ...formatOptions,
  });

  return formatter.format(date);
}

