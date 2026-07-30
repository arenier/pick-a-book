import { InvalidEnvironment, loadEnvironment } from './environment';

const complete = {
  DATABASE_PATH: '/mnt/bucket/pick-a-book.sqlite',
  STORAGE_BUCKET: 'pick-a-book-photos',
} satisfies NodeJS.ProcessEnv;

describe('loadEnvironment', () => {
  it('applique les valeurs par defaut', () => {
    const env = loadEnvironment({ ...complete });

    expect(env.nodeEnv).toBe('development');
    expect(env.port).toBe(3000);
    expect(env.shelfScannerApiKey).toBeUndefined();
  });

  it('echoue si une variable requise manque', () => {
    expect(() => loadEnvironment({ STORAGE_BUCKET: 'photos' })).toThrow(InvalidEnvironment);
  });

  it('liste toutes les variables manquantes en une fois', () => {
    expect(() => loadEnvironment({})).toThrow(/DATABASE_PATH[\s\S]*STORAGE_BUCKET/);
  });

  it('traite une variable vide comme absente', () => {
    expect(() => loadEnvironment({ ...complete, DATABASE_PATH: '   ' })).toThrow(/DATABASE_PATH/);
  });

  it('refuse un PORT hors bornes', () => {
    expect(() => loadEnvironment({ ...complete, PORT: '70000' })).toThrow(/PORT/);
    expect(() => loadEnvironment({ ...complete, PORT: 'huit-mille' })).toThrow(/PORT/);
  });

  it('refuse un NODE_ENV inconnu', () => {
    expect(() => loadEnvironment({ ...complete, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });
});
