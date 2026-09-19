# Quickstart: valider l'upload d'une photo d'étagère

## Prérequis

```bash
cp .env.example .env      # si pas déjà fait
yarn install
```

Aucune clé de fournisseur VLM n'est nécessaire : `SHELF_SCANNER_PROVIDER` vaut `stub` par défaut
(`.env.example`), et le stub renvoie des livres fixes sans appel externe — suffisant pour valider
le flux d'upload de bout en bout.

## Lancer les deux services

```bash
yarn api     # http://localhost:3000 (POST /scan, GET /health)
yarn web     # http://localhost:4200
```

(Deux terminaux, ou `docker compose up --build`.)

## Scénario 1 — chemin heureux (US1)

1. Ouvrir `http://localhost:4200` sur un téléphone (ou réduire la fenêtre du navigateur en
   largeur ≤ 400px pour simuler — SC-004).
2. Choisir une photo (prise à l'instant ou existante).
3. Envoyer.
4. **Attendu** : un état de chargement s'affiche, puis la liste des livres renvoyés par le stub
   (titre, auteur quand présent) — voir `libs/recognition/infrastructure/src/lib/stub-shelf-scanner.adapter.ts`
   pour les livres exacts renvoyés.

## Scénario 2 — fichier refusé (US2)

1. Choisir un fichier non-image (ex. un `.pdf`) ou une image de plus de 20 Mo.
2. Tenter l'envoi.
3. **Attendu** : un message d'erreur compréhensible s'affiche sans appel réseau pour le cas
   « mauvais format » détectable côté client (FR-003), sans page blanche ni blocage.

## Scénario 3 — échec en amont (US2)

1. Démarrer l'API avec `SHELF_SCANNER_PROVIDER=gemini` mais sans `GEMINI_API_KEY` valide (ou
   couper l'accès réseau sortant de l'API).
2. Envoyer une photo valide.
3. **Attendu** : message d'erreur distinct de « aucun livre détecté », invitant à réessayer plus
   tard (le contrôleur renvoie 502 sur `ShelfScanFailed` — voir `contracts/scan-api.md`).

## Scénario 4 — recommencer (US3)

1. Après un résultat (succès ou erreur), déclencher l'action « recommencer ».
2. **Attendu** : retour à l'état initial, sans rechargement de page, prêt pour un nouvel envoi.

## Tests automatisés

```bash
yarn nx test web      # specs de la feature (TDD : écrites avant le code, cf. tasks.md)
yarn nx test api      # specs de environment.ts (WEB_ORIGIN) et scan.controller.ts existantes
yarn lint             # frontières de modules, y compris scope:web ne dépendant pas de scope:api
```
