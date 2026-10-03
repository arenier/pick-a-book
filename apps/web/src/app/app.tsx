import { useMessages } from '@pick-a-book/shared-i18n';
import { buttonVariants, cn } from '@pick-a-book/shared-ui';

import { PhotoUploadScreen } from '../features/photo-upload/ui/photo-upload-screen';
import { HistoryScreen } from '../features/upload-history/ui/history-screen';
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
      {route.name === 'upload' && <PhotoUploadScreen />}
      {route.name === 'history' && <HistoryScreen />}
    </main>
  );
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
