import { useMessages } from '@pick-a-book/shared-i18n';
import { buttonVariants, cn } from '@pick-a-book/shared-ui';

import { PhotoUploadScreen } from '../features/photo-upload/ui/photo-upload-screen';
import { ReconciledBookList } from '../features/reconciliation/ui/reconciled-book-list';
import { UploadHistory } from '../features/upload-history/ui/upload-history';
import { hrefFor, type Route } from './routes';
import { useHashRoute } from './use-hash-route';

/**
 * Frontend shell: mounts the feature slices (ADR 0002) and carries the navigation between them,
 * since no slice imports another. The screen is read from the fragment of the URL
 * (specs/002-upload-history, research.md §2).
 */
export function App() {
  const { t } = useMessages('shell');
  const route = useHashRoute();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
      <p className="text-muted-foreground">{t('tagline')}</p>
      <Navigation route={route} />
      {route.name === 'upload' && <PhotoUploadScreen renderResult={renderUploadResult} />}
      {/* One element for both routes: the history must outlive a move from the list to an upload
          and back, which two elements at two places in the tree would not (research.md §3). */}
      {route.name !== 'upload' && (
        <UploadHistory entryId={entryIdOf(route)} renderBooks={renderUploadBooks} />
      )}
    </main>
  );
}

/**
 * The two screens that show detected books get the reconciled list from here, for slices import
 * none another (specs/003, research §11). Keyed by the analysis: the list belongs to one.
 */
function renderUploadResult(result: {
  readonly scanId: string;
  readonly books: readonly { readonly title: string; readonly author: string | undefined }[];
}) {
  return (
    <ReconciledBookList
      key={result.scanId}
      scanId={result.scanId}
      books={result.books}
      mode="afterAnalysis"
    />
  );
}

function renderUploadBooks(upload: {
  readonly id: string;
  readonly books: readonly { readonly title: string; readonly author: string | undefined }[];
}) {
  return (
    <ReconciledBookList key={upload.id} scanId={upload.id} books={upload.books} mode="detail" />
  );
}

/** The upload a route names, if it names one: the list has none. */
function entryIdOf(route: Route): string | undefined {
  return route.name === 'entry' ? route.id : undefined;
}

/** One link to the other side: the history from the upload screen, a new photo from anywhere else. */
function Navigation({ route }: { readonly route: Route }) {
  const { t } = useMessages('shell');
  const target: Route = route.name === 'upload' ? { name: 'history' } : { name: 'upload' };

  return (
    <nav>
      <a className={cn(buttonVariants({ variant: 'outline' }), 'w-full')} href={hrefFor(target)}>
        {route.name === 'upload' ? t('nav.history') : t('nav.newPhoto')}
      </a>
    </nav>
  );
}

export default App;
