export interface BookTitleProps {
  readonly children: string;
}

/**
 * A book's title, set in the book typeface — Literata 600, used for titles and nothing else
 * (docs/decisions/0002). Inline, so that it can sit inside a sentence.
 */
export function BookTitle({ children }: BookTitleProps) {
  return <span className="font-book font-semibold">{children}</span>;
}
