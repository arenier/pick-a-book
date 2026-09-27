# Quickstart : valider l'historique des envois

Ce guide valide la feature de bout en bout, sans rien implémenter. Le contrat est dans
[`contracts/shelf-photos-history-api.md`](contracts/shelf-photos-history-api.md), les formes de
données dans [`data-model.md`](data-model.md).

## Prérequis

```bash
cp .env.example .env               # si pas déjà fait ; DAILY_SCAN_LIMIT y apparaît (50 par défaut)
yarn install
docker compose up -d db bucket     # Postgres + émulateur de bucket (migrations appliquées au démarrage de l'API)
yarn api                           # http://localhost:3000
yarn web                           # http://localhost:4200
```

`SHELF_SCANNER_PROVIDER=stub` suffit pour tout ce guide, sauf pour le scénario 4, qui simule une
panne.

## Scénario 1 : historique vide, puis alimenté (US1)

1. Sur une base neuve (`docker compose down -v` puis `up -d db bucket`), ouvrir
   `http://localhost:4200/#/historique`.
   **Attendu** : un message « aucun envoi » avec un lien vers la prise de photo (US1, scénario 2).
2. Revenir à l'envoi (`#/`), envoyer trois photos : deux JPEG et un PNG.
3. Rouvrir `#/historique`.
   **Attendu** : trois entrées, la plus récente en tête. Chacune a sa date, une vignette et
   « N livres détectés » (nombre de livres du stub).
4. Vérifier la vignette en base et dans le bucket :
   ```bash
   docker compose exec db psql -U pick_a_book -d pick_a_book -c "
     select t.type, t.bucket_key, t.media_type, t.size_bytes, t.original_filename, t.source_upload_id
     from uploads t where t.type = 'shelf_photo_thumbnail' order by t.created_at desc limit 3;"
   ```
   **Attendu** : `original_filename` est vide, `size_bytes` vaut 256 Ko au plus, et `bucket_key` a la
   forme `{owner}/shelf_photo_thumbnail/{id de la photo}`.

## Scénario 2 : pagination et poids (FR-006, SC-002)

1. Envoyer au moins 45 photos, par exemple avec un script `curl` sur
   `POST /shelf-photos` suivi de `POST /shelf-photos/{id}/scan`.
   Attention : au-delà de 50 analyses dans la journée, le plafond s'applique, ce qui est aussi le
   scénario 5. Pour ce scénario-ci, fixer `DAILY_SCAN_LIMIT=500` dans `.env`.
2. Ouvrir `#/historique`, outils de développement ouverts, onglet Réseau.
   **Attendu** : la première page (20 entrées) s'affiche en moins de 2 s, et ses vignettes pèsent
   moins de 5 Mo au total. Faire défiler charge les pages suivantes jusqu'à la toute première
   photo. Aucune entrée n'est en double, aucune ne manque.
3. `curl 'http://localhost:3000/shelf-photos?limit=51'` → **400**.
   `curl 'http://localhost:3000/shelf-photos?cursor=abc'` → **400**.

## Scénario 3 : détail et retour (US2)

1. Dans l'historique, défiler jusqu'à la deuxième page, puis ouvrir une entrée.
   **Attendu** : l'URL devient `#/historique/{id}`. La photo est affichée en grand et les livres
   détectés dans le même ordre qu'à l'écran de résultat. Le score de confiance n'est pas affiché.
2. Revenir en arrière (bouton du navigateur ou lien « Historique »).
   **Attendu** : la liste est au même endroit, sans nouvelle requête de liste.
3. Ouvrir `#/historique/00000000-0000-4000-8000-000000000000`.
   **Attendu** : un message « envoi introuvable » avec un retour à l'historique.
4. Confirmer qu'aucune réponse ne divulgue le nom de fichier d'origine (FR-009) :
   ```bash
   curl -s http://localhost:3000/shelf-photos | grep -c original   # 0
   ```

## Scénario 4 : échec, puis relance (US3)

1. Démarrer l'API avec un fournisseur qui échouera, par exemple
   `SHELF_SCANNER_PROVIDER=gemini GEMINI_API_KEY=invalide yarn api`, et envoyer une photo.
   **Attendu** : l'écran d'envoi affiche l'échec. Dans l'historique, l'entrée indique « analyse en
   échec ».
2. Redémarrer l'API avec `SHELF_SCANNER_PROVIDER=stub`, ouvrir le détail de cet envoi et cliquer
   sur « Relancer l'analyse ».
   **Attendu** : un chargement s'affiche, le bouton est désactivé, puis les livres apparaissent.
   L'entrée de l'historique indique « N livres détectés ».
3. Rouvrir le détail.
   **Attendu** : le bouton de relance n'est plus proposé (US3, scénario 4).
4. `curl -X POST http://localhost:3000/shelf-photos/{id}/scan` → **409**
   `"code":"SCAN_ALREADY_COMPLETED"`.
5. Analyse jamais lancée : `curl -F photo=@photo.jpg http://localhost:3000/shelf-photos`, sans
   appeler `/scan`.
   **Attendu** : l'entrée indique « analyse non lancée », et la relance est proposée et aboutit.

## Scénario 5 : plafond quotidien (FR-015, SC-006)

1. Fixer `DAILY_SCAN_LIMIT=2` dans `.env`, redémarrer l'API, envoyer trois photos depuis l'écran
   d'envoi.
   **Attendu** : les deux premières sont analysées. La troisième affiche le message du plafond
   (« photo conservée, relancez demain depuis l'historique ») et n'appelle pas le service de
   reconnaissance.
2. Dans l'historique, la troisième indique « analyse non lancée ». Sa relance répond avec le même
   message tant que la journée (heure de Paris) n'est pas finie.
3. Vérifier le compte :
   ```bash
   docker compose exec db psql -U pick_a_book -d pick_a_book -c "
     select count(*) from scan_attempts
     where started_at >= date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';"
   ```
   **Attendu** : 2.

## Scénario 6 : limite de requêtes (FR-014)

```bash
for i in $(seq 1 12); do
  curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/shelf-photos/00000000-0000-4000-8000-000000000000/scan
done
```

**Attendu** : 404 pour les 10 premières, puis **429** avec `"code":"TOO_MANY_REQUESTS"` et un
en-tête `Retry-After`. `curl http://localhost:3000/health` répond toujours 200.

## Scénario 7 : photo non affichable (FR-008)

Envoyer un HEIC depuis Chrome sur ordinateur : le navigateur ne sait pas le réduire, la photo part
donc sans vignette.

**Attendu** : l'entrée s'affiche avec l'indicateur neutre, sans requête `/thumbnail`. Dans le
détail, la photo en grand ne s'affiche pas et laisse place au même indicateur, sans bloquer la liste
des livres. Depuis Safari (iOS ou macOS), le même HEIC produit une vignette.

## Scénario 8 : téléphone (SC-004)

Refaire les scénarios 1 et 3 à 360 px de large (émulation mobile). **Attendu** : aucun défilement
horizontal, ni sur la liste ni sur le détail.

## Vérification automatisée

```bash
yarn check     # lint + format + typecheck + test + build, tous projets
```

Les specs des adapters de `recognition-infrastructure` (liste paginée, réservation de tentative
concurrente, plafond, vignette) tournent contre le Postgres et l'émulateur de bucket démarrés
plus haut.
