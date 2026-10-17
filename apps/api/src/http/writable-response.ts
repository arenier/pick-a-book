/** The part of a response this API writes a header to: nothing else of it is needed. */
export interface HeaderWritable {
  setHeader(name: string, value: string): unknown;
}

export function canSetHeader(value: unknown): value is HeaderWritable {
  return (
    typeof value === 'object' &&
    value !== null &&
    'setHeader' in value &&
    typeof value.setHeader === 'function'
  );
}
