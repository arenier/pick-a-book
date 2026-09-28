/**
 * An in-memory destination for pino, so a spec reads what would have gone to stdout — the
 * lines themselves, not a mock of the logger. Excluded from the app build
 * (`tsconfig.app.json`).
 */
export type LogLine = Readonly<Record<string, unknown>>;

function isLogLine(value: unknown): value is LogLine {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function aCapturedLog() {
  const chunks: string[] = [];
  const lines = (): LogLine[] =>
    chunks.map((chunk) => {
      const line: unknown = JSON.parse(chunk);
      if (!isLogLine(line)) {
        throw new TypeError(`not a JSON object: ${chunk}`);
      }

      return line;
    });

  return {
    stream: {
      write: (chunk: string) => {
        chunks.push(chunk);
      },
    },
    /** Every line written so far, parsed: Cloud Logging reads one JSON object per line. */
    lines,
    /**
     * The line of the newest request — the one pino-http writes when the response is sent.
     * One application serves a whole spec file (nestjs-pino keeps a single pino-http per
     * process), so a test reads the newest line, not the first.
     */
    requestLine: (): LogLine | undefined => {
      const requests = lines().filter((line) => 'res' in line);

      return requests.at(-1);
    },
    /** The raw text — for asserting that a secret appears nowhere in it. */
    text: () => chunks.join(''),
  };
}
