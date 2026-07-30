import { err, isErr, isOk, map, ok, unwrap } from './result.js';

describe('Result', () => {
  it('porte la valeur en cas de succes', () => {
    const result = ok(42);

    expect(isOk(result)).toBe(true);
    expect(unwrap(result)).toBe(42);
  });

  it("porte l'erreur en cas d'echec", () => {
    const result = err('panne');

    expect(isErr(result)).toBe(true);
    expect(() => unwrap(result)).toThrow('panne');
  });

  it('applique map au succes seulement', () => {
    expect(map(ok(2), (n: number) => n * 2)).toEqual(ok(4));
    expect(map(err<string>('panne'), (n: number) => n * 2)).toEqual(err('panne'));
  });
});
