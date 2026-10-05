import { useCallback } from 'react';
import { useMessages } from '@pick-a-book/shared-i18n';
import { Button, Spinner, buttonVariants, cn } from '@pick-a-book/shared-ui';

import { getShelfScan, rescanShelfScan } from '../../api/history-api';
import type { HistoryOutcome } from '../../model/history-entry';
import { HistoryFailureMessage } from '../history-failure-message';
import { LoadedEntry } from './loaded-entry';
import { useEntryDetail, type LoadDetail, type RescanShelfScan } from './use-entry-detail';

export interface EntryDetailScreenProps {
  /** The upload to show — the one the route names. */
  readonly id: string;
  /** Loads it; injected by the specs, the real API client otherwise. */
  readonly load?: LoadDetail;
  /** Runs its analysis again; injected by the specs, the real API client otherwise. */
  readonly rescan?: RescanShelfScan;
  /** Told what the upload now is once its analysis ran again, to keep the list in step. */
  readonly onRescanned?: (id: string, outcome: HistoryOutcome) => void;
}

const loadFromApi: LoadDetail = async (id) => getShelfScan(id);

const rescanFromApi: RescanShelfScan = async (id) => rescanShelfScan(id);

/**
 * One upload of the history: its photo, and what the analysis found on it
 * (specs/002-upload-history, US2, FR-007, FR-008). Opened by a link of the history, or directly
 * from a pasted address — an upload that is not there has its own message, apart from a server
 * that cannot be reached.
 */
export function EntryDetailScreen({
  id,
  load = loadFromApi,
  rescan = rescanFromApi,
  onRescanned,
}: EntryDetailScreenProps) {
  const { t } = useMessages('upload-history');
  const { state, reload, runAgain } = useEntryDetail(id, load, rescan, onRescanned);
  const onRetry = useCallback(() => {
    void reload();
  }, [reload]);
  const onRescan = useCallback(() => {
    void runAgain();
  }, [runAgain]);

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <a
        className={cn(buttonVariants({ variant: 'ghost' }), 'w-full justify-start')}
        href="#/historique"
      >
        {t('detail.back')}
      </a>
      {state.status === 'loading' && (
        <output className="flex items-start gap-2">
          <Spinner className="mt-1 shrink-0" />
          {t('detail.loading')}
        </output>
      )}
      {state.status === 'notFound' && <p>{t('detail.notFound')}</p>}
      {state.status === 'error' && (
        <>
          <HistoryFailureMessage failure={state.failure} />
          <Button variant="outline" className="w-full" onClick={onRetry}>
            {t('detail.retry')}
          </Button>
        </>
      )}
      {state.status === 'loaded' && (
        <LoadedEntry
          entry={state.entry}
          books={state.books}
          rescan={state.rescan}
          onRescan={onRescan}
        />
      )}
    </section>
  );
}
