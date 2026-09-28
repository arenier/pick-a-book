import { useMessages } from '@pick-a-book/shared-i18n';

import { PhotoUploadScreen } from '../features/photo-upload/ui/photo-upload-screen';

/** Frontend shell: mounts the feature slices (ADR 0002) — for now, the photo upload. */
export function App() {
  const { t } = useMessages('shell');

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
      <p className="text-muted-foreground">{t('tagline')}</p>
      <PhotoUploadScreen />
    </main>
  );
}

export default App;
