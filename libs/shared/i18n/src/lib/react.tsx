import type { Namespace, TFunction } from 'i18next';
import type { ReactNode } from 'react';
import { I18nextProvider, setI18n, useTranslation } from 'react-i18next';

import type { I18n } from './create-i18n';

export interface I18nProviderProps {
  readonly i18n: I18n;
  readonly children?: ReactNode;
}

/** Hands an instance down to every `useMessages` below it. */
export function I18nProvider({ i18n, children }: I18nProviderProps) {
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}

/**
 * The instance `useMessages` falls back on without a provider — what the specs of the front set
 * once, instead of wrapping every render.
 */
export function setDefaultI18n(i18n: I18n): void {
  setI18n(i18n);
}

/**
 * The messages of one namespace — the only i18n API a slice uses (ADR 0011). `t` is typed from the
 * French catalogs the app registers: a misspelt key fails the typecheck.
 */
export function useMessages<const N extends Namespace>(namespace: N): { readonly t: TFunction<N> } {
  const { t } = useTranslation(namespace);
  return { t };
}
