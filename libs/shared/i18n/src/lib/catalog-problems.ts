/**
 * What `i18next-cli status` does not check in the catalogs (ADR 0011), both invisible at runtime:
 *
 * - **plural forms**: a counted key must carry exactly the CLDR categories of its language. French
 *   has `many` (exact millions): without `_many`, i18next shows the raw key, with no fallback on
 *   `_other`.
 * - **placeholders**: a translation must use the same `{{…}}` as French, the source language. A
 *   renamed one leaves a hole in the sentence.
 *
 * A key missing from a translation is left to `i18next-cli status`, which reports it already.
 */

type Catalogs = Readonly<Record<string, Readonly<Record<string, unknown>>>>;

/** French is the source language: its catalogs are what the others are compared with. */
const SOURCE_LANGUAGE = 'fr';

const PLURAL_SUFFIX = /_(?<category>zero|one|two|few|many|other)$/u;

/** `{{name}}`, and `{{name, format}}` too: the name is what the call site passes. */
const PLACEHOLDER = /\{\{\s*(?<name>[^,}\s]+)[^}]*\}\}/gu;

interface Entry {
  /** The plural categories the key is written in; empty for a key that is not counted. */
  readonly forms: Set<string>;
  readonly placeholders: Set<string>;
}

export function catalogProblems(catalogs: Catalogs): string[] {
  const source = catalogs[SOURCE_LANGUAGE] ?? {};

  return Object.entries(catalogs).flatMap(([language, namespaces]) =>
    Object.entries(namespaces).flatMap(([namespace, catalog]) => {
      const where = `${language}/${namespace}`;
      const entries = entriesOf(catalog);
      const plurals = [...entries].flatMap(([key, entry]) =>
        pluralProblems(where, language, key, entry),
      );
      return language === SOURCE_LANGUAGE
        ? plurals
        : plurals.concat(placeholderProblems(where, entries, entriesOf(source[namespace])));
    }),
  );
}

function placeholderProblems(
  where: string,
  entries: Map<string, Entry>,
  sourceEntries: Map<string, Entry>,
): string[] {
  return [...entries].flatMap(([key, entry]) => {
    const reference = sourceEntries.get(key);
    return reference === undefined || sameSet(entry.placeholders, reference.placeholders)
      ? []
      : [
          `${where}: "${key}" uses ${listed(entry.placeholders)} where French uses ${listed(reference.placeholders)}`,
        ];
  });
}

function pluralProblems(where: string, language: string, key: string, entry: Entry): string[] {
  if (entry.forms.size === 0) {
    return [];
  }
  const required = new Intl.PluralRules(language).resolvedOptions().pluralCategories;
  return [
    ...required
      .filter((category) => !entry.forms.has(category))
      .map((category) => `${where}: "${key}" lacks the plural form "${category}"`),
    ...[...entry.forms]
      .filter((form) => !required.some((category) => category === form))
      .map((form) => `${where}: "${key}" has the plural form "${form}", unknown to ${language}`),
  ];
}

/** Each key of a catalog, nested keys dotted as i18next reads them, plural forms folded into one. */
function entriesOf(catalog: unknown): Map<string, Entry> {
  const entries = new Map<string, Entry>();
  for (const [path, text] of leaves(catalog, '')) {
    const category = PLURAL_SUFFIX.exec(path)?.groups?.['category'];
    const key = category === undefined ? path : path.replace(PLURAL_SUFFIX, '');
    const entry = entries.get(key) ?? { forms: new Set<string>(), placeholders: new Set<string>() };
    if (category !== undefined) {
      entry.forms.add(category);
    }
    for (const match of text.matchAll(PLACEHOLDER)) {
      const name = match.groups?.['name'];
      if (name !== undefined) {
        entry.placeholders.add(name);
      }
    }
    entries.set(key, entry);
  }
  return entries;
}

function leaves(node: unknown, prefix: string): [string, string][] {
  if (typeof node === 'string') {
    return [[prefix, node]];
  }
  if (typeof node !== 'object' || node === null) {
    return [];
  }
  return Object.entries(node).flatMap(([name, child]) =>
    leaves(child, prefix === '' ? name : `${prefix}.${name}`),
  );
}

function sameSet(left: Set<string>, right: Set<string>): boolean {
  return left.size === right.size && [...left].every((item) => right.has(item));
}

function listed(placeholders: Set<string>): string {
  return placeholders.size === 0
    ? 'no placeholder'
    : [...placeholders].map((name) => `{{${name}}}`).join(', ');
}
