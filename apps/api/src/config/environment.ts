/**
 * Validation de la configuration au demarrage.
 *
 * Le principe : une variable requise manquante fait echouer le demarrage tout de suite,
 * avec la liste complete de ce qui manque — plutot qu'une erreur obscure a la premiere
 * requete qui touche le bucket ou la base.
 *
 * Ecrit a la main plutot qu'avec une bibliotheque de schema : quelques variables, aucune
 * dependance de plus, et le message d'erreur est le notre. Le jour ou la configuration
 * grossit, un schema se justifiera.
 */

export type NodeEnvironment = 'development' | 'test' | 'production';

export interface Environment {
  readonly nodeEnv: NodeEnvironment;
  readonly port: number;
  /**
   * Chemin du fichier SQLite sur le bucket monte (ADR 0006).
   * Le domaine l'ignore : seul `infrastructure` s'en sert.
   */
  readonly databasePath: string;
  /** Bucket des photos d'etagere (ADR 0004). */
  readonly storageBucket: string;
  /**
   * Point d'entree d'un emulateur de stockage objet, en developpement local
   * (`fake-gcs-server` du docker-compose). Absent en production.
   */
  readonly storageEmulatorHost: string | undefined;
  /**
   * Cle du fournisseur de VLM (ADR 0005). Optionnelle tant que l'adaptateur actif est le
   * bouchon ; requise le jour ou l'adaptateur reel est branche.
   */
  readonly shelfScannerApiKey: string | undefined;
}

const REQUIRED = ['DATABASE_PATH', 'STORAGE_BUCKET'] as const;

const NODE_ENVIRONMENTS: readonly NodeEnvironment[] = ['development', 'test', 'production'];

export class InvalidEnvironment extends Error {
  constructor(problems: readonly string[]) {
    super(
      [
        'Configuration invalide, demarrage interrompu :',
        ...problems.map((problem) => `  - ${problem}`),
        '',
        'Voir .env.example pour la liste des variables et leur role.',
      ].join('\n'),
    );
    this.name = 'InvalidEnvironment';
  }
}

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  const problems: string[] = [];

  for (const name of REQUIRED) {
    if (!isPresent(source[name])) {
      problems.push(`${name} est requise et n'est pas definie`);
    }
  }

  const rawNodeEnv = source.NODE_ENV ?? 'development';
  if (!isNodeEnvironment(rawNodeEnv)) {
    problems.push(`NODE_ENV vaut "${rawNodeEnv}" — attendu ${NODE_ENVIRONMENTS.join(', ')}`);
  }

  const rawPort = source.PORT ?? '3000';
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    problems.push(`PORT vaut "${rawPort}" — attendu un entier entre 1 et 65535`);
  }

  if (problems.length > 0) {
    throw new InvalidEnvironment(problems);
  }

  return {
    nodeEnv: rawNodeEnv as NodeEnvironment,
    port,
    databasePath: source.DATABASE_PATH as string,
    storageBucket: source.STORAGE_BUCKET as string,
    storageEmulatorHost: optional(source.STORAGE_EMULATOR_HOST),
    shelfScannerApiKey: optional(source.SHELF_SCANNER_API_KEY),
  };
}

function isPresent(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

function optional(value: string | undefined): string | undefined {
  return isPresent(value) ? value : undefined;
}

function isNodeEnvironment(value: string): value is NodeEnvironment {
  return (NODE_ENVIRONMENTS as readonly string[]).includes(value);
}

/** Jeton d'injection de la configuration validee. */
export const ENVIRONMENT = 'Environment';
