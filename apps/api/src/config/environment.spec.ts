import { InvalidEnvironment, loadEnvironment } from './environment';

const complete = {
  DATABASE_PATH: '/mnt/bucket/pick-a-book.sqlite',
  STORAGE_BUCKET: 'pick-a-book-photos',
} satisfies NodeJS.ProcessEnv;

describe('loadEnvironment', () => {
  it('applies the default values', () => {
    const env = loadEnvironment({ ...complete });

    expect(env.nodeEnv).toBe('development');
    expect(env.port).toBe(3000);
    expect(env.shelfScannerApiKey).toBeUndefined();
  });

  it('fails when a required variable is missing', () => {
    expect(() => loadEnvironment({ STORAGE_BUCKET: 'photos' })).toThrow(InvalidEnvironment);
  });

  it('lists every missing variable at once', () => {
    expect(() => loadEnvironment({})).toThrow(/DATABASE_PATH[\s\S]*STORAGE_BUCKET/);
  });

  it('treats an empty variable as absent', () => {
    expect(() => loadEnvironment({ ...complete, DATABASE_PATH: '   ' })).toThrow(/DATABASE_PATH/);
  });

  it('rejects a PORT outside its bounds', () => {
    expect(() => loadEnvironment({ ...complete, PORT: '70000' })).toThrow(/PORT/);
    expect(() => loadEnvironment({ ...complete, PORT: 'eight-thousand' })).toThrow(/PORT/);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => loadEnvironment({ ...complete, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });
});
