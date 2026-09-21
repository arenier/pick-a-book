# Quickstart: valider l'upload d'une photo d'étagère

## Prérequis

```bash
cp .env.example .env      # si pas déjà fait
yarn install
```

Aucune clé de fournisseur VLM n'est nécessaire : `SHELF_SCANNER_PROVIDER` vaut `stub` par défaut
(`.env.example`), et le stub renvoie des livres fixes sans appel externe — suffisant pour valider
le flux d'upload de bout en bout. `OWNER_ID` vaut `default` par défaut (research.md §10) —
suffisant tant qu'il n'y a qu'un seul utilisateur ; le changer dans `.env` avant un envoi fait
apparaître le sous-dossier correspondant dans le bucket émulé.

## Lancer les deux services

```bash
yarn api     # http://localhost:3000 (POST /shelf-photos, POST /shelf-photos/:id/scan, GET /health)
yarn web     # http://localhost:4200
```

(Deux terminaux, ou `docker compose up --build` — inclut désormais l'émulateur de bucket,
research.md §9.)

## Scénario 1 — chemin heureux (US1 + US3)

1. Ouvrir `http://localhost:4200` sur un téléphone (ou réduire la fenêtre du navigateur en
   largeur ≤ 400px pour simuler — SC-004).
2. Choisir une photo (prise à l'instant ou existante).
3. Envoyer.
4. **Attendu côté écran** : un état de chargement s'affiche pendant les deux appels enchaînés
   (`POST /shelf-photos` puis `POST /shelf-photos/{id}/scan`, research.md §7 — un seul état visible
   à l'écran, FR-004), puis la liste des livres renvoyés par le stub (titre, auteur quand présent)
   — voir `libs/recognition/infrastructure/src/lib/stub-shelf-scanner.adapter.ts` pour les livres
   exacts renvoyés.
5. **Attendu côté persistance (US3, invisible à l'écran)** : le premier appel crée une ligne dans
   `uploads` (`type = 'shelf_photo'`) et une ligne `shelf_scans` liée par `upload_id`
   (`status = 'pending'`) ; le second passe `shelf_scans.status` à `'completed'`, `detected_books`
   peuplé des mêmes livres. L'objet correspondant existe dans le bucket émulé, sous la clé
   `{owner_id}/shelf_photo/{id}` (`owner_id` = `OWNER_ID`, défaut `default`) où `id` est la valeur
   de la colonne `id` de la ligne `uploads` — jamais le nom du fichier envoyé (research.md §10,
   FR-015). `size_bytes` (sur `uploads`) reflète le poids réel du fichier ; `original_filename`
   porte le nom tel qu'envoyé par le navigateur, uniquement pour référence.
   ```bash
   docker compose exec db psql -U pick_a_book -d pick_a_book -c "
     select u.id, u.owner_id, u.type, u.bucket_key, u.media_type, u.size_bytes,
            u.original_filename, s.status, s.detected_books, u.created_at
     from uploads u join shelf_scans s on s.upload_id = u.id
     order by u.created_at desc limit 1;"
   ```
6. **Rejeu manuel des deux étapes (optionnel, pour voir la séparation)** :
   ```bash
   curl -F "photo=@photo.jpg" http://localhost:3000/shelf-photos
   # {"id":"<uuid>"} — la ligne est déjà en base à ce stade, status pending
   curl -X POST http://localhost:3000/shelf-photos/<uuid>/scan
   # {"books":[...]} — un second appel sur le même <uuid> renvoie 409
   ```

## Scénario 2 — fichier refusé (US2)

1. Choisir un fichier non-image (ex. un `.pdf`) ou une image de plus de 20 Mo.
2. Tenter l'envoi.
3. **Attendu** : un message d'erreur compréhensible s'affiche sans appel réseau pour le cas
   « mauvais format » détectable côté client (FR-003), sans page blanche ni blocage.

## Scénario 3 — échec en amont (US2 + US3)

1. Démarrer l'API avec `SHELF_SCANNER_PROVIDER=gemini` mais sans `GEMINI_API_KEY` valide (ou
   couper l'accès réseau sortant de l'API).
2. Envoyer une photo valide.
3. **Attendu côté écran** : message d'erreur distinct de « aucun livre détecté », invitant à
   réessayer plus tard (`POST /shelf-photos/{id}/scan` renvoie 502 sur `ShelfScanFailed` — voir
   `contracts/scan-api.md`).
4. **Attendu côté persistance (US3)** : contrairement au scénario 2 (fichier refusé, où le premier
   appel échoue et rien n'est créé), le premier appel a ici réussi (`status = 'pending'`) avant que
   le second échoue ; la ligne passe alors à `status = 'failed'`, `detected_books` reste `null` —
   et l'objet existe dans le bucket émulé. C'est le point qui distingue US3 scénario 2 (conservé
   malgré l'échec du scan) de US2 scénario 2 (fichier refusé dès le premier appel, rien de
   conservé) et de FR-014 (coupure entre les deux appels : reste `pending`, pas `failed`).

## Scénario 4 — recommencer (US4)

1. Après un résultat (succès ou erreur), déclencher l'action « recommencer ».
2. **Attendu** : retour à l'état initial, sans rechargement de page, prêt pour un nouvel envoi.

## Tests automatisés

```bash
yarn nx test web                        # specs de la feature (TDD : écrites avant le code, cf. tasks.md)
yarn nx test recognition-domain         # + specs des deux nouveaux ports (forme des types)
yarn nx test recognition-application    # + specs de StoreShelfPhotoUseCase et ScanStoredShelfPhotoUseCase (succès, échec 502, id inconnu, 409)
yarn nx test recognition-infrastructure # + specs des deux nouveaux adapters, contre Postgres et l'émulateur de bucket
yarn nx test api                        # specs de environment.ts (WEB_ORIGIN, BUCKET_NAME) et shelf-photos.controller.ts
yarn lint                               # frontières de modules, y compris scope:web ne dépendant pas de scope:api
```
