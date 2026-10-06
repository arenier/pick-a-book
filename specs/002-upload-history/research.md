# Research: Historique des photos envoyées

Phase 0 de `/speckit-plan`. Chaque section tranche une inconnue du Technical Context de
[`plan.md`](plan.md) : décision, raison, alternatives écartées. Les numéros de section sont cités
par `plan.md`, `data-model.md` et `contracts/`.

## 1. Où vit la feature

**Décision** : côté back, tout reste dans le contexte `recognition` (`libs/recognition/*`) et son
module de composition dans `apps/api/src/recognition/`. Côté front, nouvelle feature-slice en
dossier : `apps/web/src/features/upload-history/`, sur le modèle de `photo-upload`.

**Raison** : l'historique relit des données que `recognition` possède déjà, puisque la spec 001 a
posé `ShelfScanRecord`, les tables `uploads` et `shelf_scans` et le bucket. La relance (US3) et le
plafond d'analyses (FR-015) portent sur l'appel au `ShelfScannerPort`, le seul appel payant de
`recognition`. Aucun autre contexte n'est traversé, donc il n'y a pas d'orchestrateur
([ADR 0003](../../docs/adr/0003-orchestration-sans-event-bus.md)) et pas de nouveau bounded context
([ADR 0010](../../docs/adr/0010-decoupage-bounded-contexts.md)). Le mot « bibliothèque » reste à
`curation` (spec, *Vocabulaire*).

**Alternatives écartées** :
- *Une lib Nx pour la slice web.* Rien ne la réutilise ailleurs, comme pour `photo-upload`
  (spec 001, research.md §1).
- *Un contexte « médiathèque » séparé.* Il posséderait les fichiers sans la reconnaissance qui leur
  donne un sens. Ce serait un découpage technique, pas un langage métier (critères de l'ADR 0010).

## 2. Navigation entre écrans : routage par hash

**Décision** : trois écrans adressables par le fragment d'URL, routés dans le shell `apps/web/src/app/`
par un petit hook maison (`useHashRoute`, qui écoute `hashchange`) :

| Fragment | Écran |
|---|---|
| `#/` (ou vide) | envoi d'une photo (slice `photo-upload`, inchangée) |
| `#/historique` | historique (slice `upload-history`) |
| `#/historique/{id}` | détail d'un envoi (slice `upload-history`) |

Le shell porte la navigation entre les deux slices (lien « Historique » / « Nouvelle photo ») :
aucune slice n'importe l'autre (ADR 0002).

**Raison** :
- **L'hébergement impose le hash.** Le front est servi en fichiers statiques depuis un bucket
  public, sur `https://storage.googleapis.com/<bucket>/` (ADR 0004, `infra/envs/prod/main.tf`,
  module `static_site`), sans réécriture d'URL. Une route par chemin (`/envois/123`) renverrait une
  404 au rechargement ou à l'ouverture d'un lien. Le fragment, lui, n'est jamais envoyé au serveur.
- **Un lien vers un détail doit exister.** La spec traite le cas d'un lien obsolète vers un envoi
  (Edge Cases).
- **Trois routes ne justifient pas une bibliothèque de routage.** Le hook tient en une vingtaine
  de lignes et se teste sans dépendance.

**Alternatives écartées** :
- *`react-router` avec `createHashRouter`.* Dépendance légitime (ce n'est pas un outil de build, de
  test ou de lint, donc pas visé par le principe IV), mais surdimensionnée pour trois écrans. À
  reconsidérer si les routes se multiplient (curation, fiche livre).
- *État React sans URL.* Pas de bouton retour du navigateur, pas de lien vers un détail.
- *Routage par chemin.* Il faudrait un 404 de secours qui renvoie `index.html`, soit une
  configuration du bucket (`not_found_page`), soit un load balancer. Cela modifie l'hébergement pour
  un besoin que le hash couvre.

## 3. Retour à l'historique à l'endroit quitté (US2, scénario 4)

**Décision** : le shell garde l'historique **monté** quand le détail s'affiche (il le masque
seulement), et la slice mémorise la position de défilement au départ vers un détail pour la
restaurer au retour. Les pages déjà chargées restent en mémoire : le retour ne refait aucune
requête.

**Raison** : démonter la liste perdrait les pages chargées (FR-006) et la position. Le navigateur
ne restaure pas le défilement d'un contenu re-rendu après un `hashchange`.

**Alternative écartée** : *remettre les pages en cache puis re-rendre.* On obtiendrait le même
résultat avec un cache à invalider en plus.

## 4. Pagination : curseur sur (date d'envoi, id)

**Décision** : `GET /shelf-photos?cursor=…&limit=…` renvoie une page d'au plus `limit` envois (20 par
défaut, 50 au plus) et un `nextCursor` opaque, `null` sur la dernière page. Le curseur encode
(`created_at`, `id`) du dernier élément. La requête compare le couple, ce qui départage deux envois
de même horodatage. Le tri est `created_at desc, id desc`, et un index `(owner_id, type,
created_at desc, id desc)` sur `uploads` sert à la fois le filtre et l'ordre. Côté front, la page
suivante se charge quand la fin de la liste approche (`IntersectionObserver`). Un bouton « Afficher
plus » reste présent en repli accessible.

**Raison** : FR-006 exige d'atteindre tous les envois sans attendre le chargement de tous. Le
curseur, contrairement à un décalage (`offset`), ne saute ni ne double aucun envoi quand une photo
arrive pendant qu'on fait défiler (SC-003). Au volume visé (quelques centaines à quelques milliers
de lignes), l'index rend chaque page quasi instantanée (SC-002).

**Alternatives écartées** :
- *`offset`/`limit`.* Un envoi inséré en tête décale tout, et la page suivante répète un élément.
- *Tout charger d'un coup.* Tenable à 200 envois, plus à 2 000, et contraire à FR-006.

## 5. Vignettes : produites par le navigateur à l'envoi

**Décision** : au moment de l'envoi, la slice `photo-upload` réduit la photo dans le navigateur
(`createImageBitmap` puis canvas, **480 px** de large, JPEG qualité 0,7, soit quelques dizaines de
Ko) et l'ajoute au même `POST /shelf-photos`, dans un champ multipart optionnel `thumbnail`. L'API
la valide (value object `ShelfPhotoThumbnail` : JPEG, PNG ou WebP, **256 Ko** au plus), la range
dans le bucket sous `{ownerId}/shelf_photo_thumbnail/{id}` et la référence en base (§6).

- Si le navigateur ne sait pas lire la photo (HEIC hors Safari) ou si la réduction échoue, la photo
  part **sans** vignette. L'envoi n'est jamais bloqué.
- Une vignette invalide côté serveur est **ignorée** (journalisée en avertissement) : l'envoi
  garde la photo (spec 001, FR-014), l'historique affiche l'indicateur neutre (FR-008).
- Les envois antérieurs à cette feature n'ont pas de vignette et montrent l'indicateur neutre. Il
  n'y a pas de rattrapage, pour la raison suivante : la prod ne conserve encore aucune photo, puisque
  `infra/envs/prod/main.tf` ne fournit ni bucket de photos ni `BUCKET_NAME` (voir le point 3 des
  *Prérequis hors scope* de `plan.md`). Seules les bases de développement ont des envois anciens.

**Raison** :
- **HEIC.** Le téléphone de la ressourcerie est souvent un iPhone, et son Safari décode le HEIC.
  C'est donc le navigateur qui sait faire une vignette de ces photos. Côté serveur, `sharp` en
  binaires précompilés ne décode pas le HEIC (codec HEVC exclu de libheif pour des raisons de
  brevets).
- **Coût et abus (FR-015, FR-016).** Aucun calcul d'image sur Cloud Run, facturé au temps CPU. Une
  requête de lecture ne déclenche aucun traitement lourd qu'un tiers pourrait répéter pour faire
  monter la facture.
- **Pas de dépendance native.** Le dépôt désactive les scripts d'installation
  (`enableScripts: false`, `.yarnrc.yml`), et le build Docker devrait embarquer les binaires de la
  bonne plateforme.
- **Budget.** 20 vignettes de ~40 Ko font moins de 1 Mo par page, loin des 5 Mo de SC-002.

**Alternatives écartées** :
- *Génération serveur à l'envoi avec `sharp`.* HEIC impossible, dépendance native, et ~300 ms de
  CPU ajoutées à chaque envoi.
- *Génération serveur à la demande (première lecture), mise en cache dans le bucket.* Mêmes limites.
  En plus, une lecture écrit dans le bucket, et le premier affichage d'une page lance 20 réductions
  de photos de plusieurs Mo sur une instance de 512 Mo.
- *Réduction à la volée sans stockage.* Recalculée à chaque nouvel appareil, et facile à exploiter
  pour faire travailler le serveur.
- *Service d'images managé (Imgix, Cloudinary).* Un compte et une facture de plus, hors du
  périmètre d'hébergement de l'ADR 0004.

**Point de vigilance à l'implémentation** : l'orientation EXIF. `createImageBitmap` l'applique par
défaut (`imageOrientation: 'from-image'`) dans les navigateurs actuels. Il faut le vérifier sur une
photo portrait d'iPhone avant de clore la tâche.

## 6. Référence Postgres de la vignette

**Décision** : une vignette est un fichier du bucket. Elle a donc sa ligne dans `uploads`, comme
toute photo : c'est la règle posée avec le porteur du projet par la spec 001 (research.md §8, §10 :
« une référence Postgres complète pour chaque fichier du bucket »). Il faut une migration :
- `uploads.type = 'shelf_photo_thumbnail'` ;
- nouvelle colonne `uploads.source_upload_id` (FK vers `uploads.id`, nullable, unique), qui relie la
  vignette à sa photo ;
- `uploads.original_filename` devient nullable. Un fichier dérivé n'a pas de nom d'origine. Une
  contrainte `check` impose `(source_upload_id is null) = (original_filename is not null)` : une photo
  envoyée a un nom d'origine et pas de source, un fichier dérivé l'inverse.

La photo et sa vignette sont écrites dans la **même transaction** que la ligne `shelf_scans`
(`createPending`). Côté bucket, les objets sont écrits avant la transaction, comme aujourd'hui pour
la photo.

**Raison** : pas d'exception à une règle posée trois jours plus tôt. `uploads` est déjà la table
générique de « tout fichier du bucket, quel que soit son auteur » (commentaire de
`drizzle/schema.ts`).

**Alternatives écartées** :
- *Colonnes `thumbnail_*` sur la ligne de la photo.* Cela couple la table générique à un seul type
  de dérivé.
- *Pas de référence en base.* Contraire à la règle de la spec 001.

## 7. Servir les images : l'API relaie le bucket

**Décision** : `GET /shelf-photos/{id}/photo` et `GET /shelf-photos/{id}/thumbnail` renvoient les
octets lus dans le bucket, avec le bon `Content-Type` et
`Cache-Control: private, max-age=31536000, immutable`. Une photo ne change jamais sous un id
donné : le navigateur ne la redemande pas. Une vignette absente répond 404, et le front affiche
l'indicateur neutre (FR-008). Le bucket reste privé.

**Raison** : la limite de requêtes (§9) s'applique naturellement. Le bucket de photos n'est jamais
rendu lisible publiquement. L'émulateur local marche sans configuration spéciale.

**Alternatives écartées** :
- *URL signées V4 vers le bucket.* Sur Cloud Run, sans clé de compte de service, il faut accorder
  `iam.serviceAccountTokenCreator` au compte lui-même (appel `signBlob`). L'émulateur les gère mal.
  Et le lien, une fois émis, échappe à la limite de requêtes.
- *Bucket de photos public.* Contraire à FR-012, qui assume un risque borné, pas un bucket listable.

**Limite connue** : le port de stockage rend la photo entière en mémoire (`ShelfPhoto`, jusqu'à
20 Mo) plutôt qu'en flux. C'est acceptable au volume visé et avec l'en-tête `immutable`, puisque
chaque photo n'est lue qu'une fois par appareil. Passer au flux imposerait un type Node dans un port
du domaine. À revoir si la mémoire de l'instance (512 Mo) devient un souci.

## 8. Relance d'analyse, concurrence et plafond quotidien

**Décision** :
- **Relance (FR-011).** `POST /shelf-photos/{id}/scan` accepte désormais un envoi `pending` **ou**
  `failed`. `completed` reste définitif (409). Le même point d'entrée sert l'analyse initiale
  (spec 001) et la relance, sans nouvelle route.
- **Tentatives.** Chaque analyse commence par la réservation d'une **tentative**, une ligne dans une
  nouvelle table `scan_attempts` (`upload_id`, `started_at`, `finished_at`). La réservation est
  **atomique** : une transaction prend un verrou consultatif Postgres (`pg_advisory_xact_lock`) puis
  vérifie trois choses, dans cet ordre :
  1. l'envoi existe et n'est pas `completed`, sinon `ShelfScanNotFound` ou
     `ShelfScanAlreadyProcessed` ;
  2. aucune tentative ouverte de moins de **5 minutes** n'existe pour cet envoi, sinon
     `ShelfScanInProgress` ;
  3. moins de `DAILY_SCAN_LIMIT` tentatives (50 par défaut) ont commencé depuis minuit, heure de
     Paris (`Europe/Paris`), sinon `DailyScanQuotaExceeded`.

  La tentative est ensuite insérée, puis refermée (`finished_at`) par `markCompleted` ou
  `markFailed`. *(Amendement du 04/10/2026, revue de la PR #82)* `startAttempt` rend l'**identifiant
  de la tentative** (`ScanAttemptId`), que les deux autres reçoivent en retour : une analyse ne
  referme que la sienne. Une analyse qui a dépassé son bail ne referme donc pas la tentative de
  celle qui a démarré après elle.
- **Toute erreur après la réservation referme la tentative** *(ajouté le 27/09/2026, après
  `/speckit-analyze`)*. Une photo introuvable dans le bucket, ou une erreur de lecture, passe
  l'envoi en `failed`, comme un échec du scanner, et referme la tentative. Sinon, la tentative
  resterait ouverte 5 minutes, compterait dans le plafond et bloquerait l'envoi en
  `ShelfScanInProgress`. Pour l'utilisateur, c'est une analyse qui a échoué et qu'il peut relancer.
  L'erreur remonte telle quelle au HTTP (502).
- **Pas de nouveau statut.** L'envoi reste `pending` ou `failed` pendant son analyse. L'historique
  l'affiche comme tel, mais le système refuse une relance concurrente (`SCAN_IN_PROGRESS`, spec,
  *Edge Cases*).

**Raison** :
- **Le plafond compte les tentatives, pas les résultats.** Une analyse qui échoue chez le
  fournisseur a pu être facturée. Un compteur tiré de `shelf_scans` ne verrait que le dernier
  résultat de chaque envoi, et une relance l'écraserait.
- **Double paiement.** Sans réservation, deux relances simultanées du même envoi paieraient deux
  appels VLM, dont un seul serait retenu. Le bail de 5 minutes couvre largement les ~27 s mesurées
  (`docs/decisions/0001`). Il libère aussi un envoi dont l'instance serait morte en pleine analyse :
  sans lui, l'envoi resterait bloqué pour toujours.
- **La correction ne dépend pas du bail.** `markCompleted` et `markFailed` ne bougent qu'un envoi non
  `completed` (condition dans l'`UPDATE`, comme aujourd'hui avec `pending`). Si une analyse dépasse
  le bail et qu'une relance démarre, un seul résultat abouti peut être posé (FR-011).
- **Verrou consultatif plutôt que niveau d'isolation `serializable`.** Deux réservations proches du
  plafond ne peuvent pas passer toutes les deux, sans boucle de reprise sur erreur de sérialisation.
  Le verrou ne vit que le temps de la transaction de réservation, quelques millisecondes, jamais
  pendant l'appel VLM.
- **Heure de Paris.** « Jusqu'au lendemain » (FR-015) doit se lire à l'heure de l'utilisateur, pas
  en UTC.
- **La photo reste conservée au plafond.** Une analyse refusée pour quota laisse l'envoi `pending` :
  la photo est déjà conservée et pourra être relancée depuis l'historique (spec, FR-015).

**Alternatives écartées** :
- *Statut `scanning` dans `shelf_scans`.* Il ajoute un état visible que la spec ne prévoit pas, et
  il faudrait quand même un compteur à part pour le plafond.
- *Compteur en mémoire.* Remis à zéro à chaque démarrage à froid (Cloud Run scale-to-zero) et
  propre à chaque instance (3 au plus). Il ne borne rien.
- *Quota côté fournisseur (Google AI Studio).* Utile en complément, mais hors du dépôt, différent
  pour chaque fournisseur (ADR 0005), et il ne rend pas de message propre à l'utilisateur.

## 9. Limite de requêtes par source (FR-014)

**Décision** : `@nestjs/throttler`, en garde globale dans `AppModule` avec son stockage en mémoire
par défaut. La source est l'adresse IP du client, lue via `trust proxy` (voir la vérification plus
bas). Deux paliers :

| Palier | Routes | Limite par source |
|---|---|---|
| `default` | toutes (lectures, images, santé exclue) | 300 requêtes / minute |
| `write` | `POST /shelf-photos`, `POST /shelf-photos/{id}/scan` | 10 requêtes / minute |

Au-delà, l'API répond 429 avec le code `TOO_MANY_REQUESTS` (contrat, §Erreurs communes). Les
limites sont des constantes du module, pas de la configuration, et `GET /health` en est exempté (la
sonde de démarrage de Cloud Run ne doit jamais être limitée).

**Raison** :
- **Le calibrage.** Une page d'historique coûte 1 requête de liste et jusqu'à 20 vignettes. Faire
  défiler vite, une dizaine de pages par minute, reste sous 300. L'envoi normal, c'est 2 écritures
  par photo, loin de 10 par minute.
- **Pas d'infrastructure nouvelle.** Cloud Armor, la protection anti-DDoS managée de Google, exige
  un load balancer HTTPS externe, soit ~18 $/mois de coût fixe, ce que l'ADR 0004 écarte à ce volume.
- **Le stockage en mémoire suffit.** Il est propre à chaque instance, et Cloud Run en lance 3 au plus
  (`max_instances`, déjà un plafond de coût). La limite effective est donc au plus triplée, ce qui
  reste un plafond. Le plafond qui protège la facture, lui, est le quota d'analyses en base (§8).
- **Pas d'ADR.** Le choix reste interne à `apps/api`, se change sans toucher à l'infra ni au front, et
  n'engage aucun autre projet. C'est ce que la spec demandait de vérifier (Assumptions). Passer à
  Cloud Armor ou à une limite partagée entre instances, en revanche, justifierait un ADR.

**Vérification à l'implémentation** : Cloud Run ajoute l'IP du client en **dernière** position de
`X-Forwarded-For`. Avec `app.set('trust proxy', 1)`, Express prend cette dernière entrée, que le
client ne peut pas forger (il ne contrôle que les entrées de gauche). À confirmer sur une révision
déployée, en envoyant un `X-Forwarded-For` forgé : il ne doit pas changer la source comptée. En
local, sans proxy, la source est l'adresse de la socket.

**Alternatives écartées** :
- *`express-rate-limit`.* Équivalent, mais hors de l'écosystème Nest : pas de décorateur par route,
  et le 429 ne passe pas par les filtres d'exception.
- *Stockage partagé (Redis, Postgres).* Un service de plus, ou une écriture en base à chaque
  requête, pour un gain nul à ce volume.

## 10. Codes d'erreur stables

**Décision** : quand un statut HTTP ne suffit plus à distinguer deux cas que le front affiche
différemment, le corps porte un champ `code` stable. Deux 429 et deux 409 sont maintenant possibles :

| Statut | `code` | Cas |
|---|---|---|
| 429 | `TOO_MANY_REQUESTS` | limite par source (FR-014) : réessayer dans une minute |
| 429 | `DAILY_SCAN_QUOTA_EXCEEDED` | plafond quotidien (FR-015) : photo conservée, relancer demain |
| 409 | `SCAN_ALREADY_COMPLETED` | envoi déjà analysé avec succès |
| 409 | `SCAN_IN_PROGRESS` | une analyse de cet envoi est en cours |

Le module `api/` du front traduit le couple (statut, `code`) en **type d'échec**
(`dailyQuota`, `rateLimited`…), jamais d'après le `message` technique (spec 001, FR-009). L'UI le
formule par une table explicite vers son catalogue i18next (ADR 0011). Un code inconnu donne
l'échec générique `unexpected`.

**Raison** : c'est la règle que l'[ADR 0011](../../docs/adr/0011-internationalisation-de-l-interface.md)
(proposé) généralise. L'adopter maintenant ne dépend pas de son acceptation.

**Alternative écartée** : *d'autres statuts HTTP (403, 423…).* Ce serait détourner leur sens pour
faire passer une information que le corps porte mieux.

## 11. Partage de code entre les deux slices web

**Décision** : la slice `upload-history` a sa propre copie du type `DetectedBook`, de ses gardes de
type et de l'affichage de la liste de livres, soit une vingtaine de lignes. Elle n'importe rien de
`photo-upload`.

**Raison** : les slices ne s'importent pas entre elles (ADR 0002, CLAUDE.md). La spec 001 a déjà
posé des copies locales du contrat (research.md §5). Ouvrir une lib partagée `scope:web` pour deux
consommateurs et vingt lignes serait prématuré. Le troisième consommateur, sans doute la fiche livre
de `bibliography`, justifiera l'extraction.

**Alternative écartée** : *une lib `libs/web/…` dès maintenant.* Cela voudrait dire un projet Nx de
plus, ses tags, son `vitest.config.mts` et une ligne dans le Dockerfile (qui doit lister chaque
manifeste), pour vingt lignes.

## 12. Textes de l'interface (ADR 0011) et design system (ADR 0012)

*Révisé le 28/09/2026* : l'[ADR 0011](../../docs/adr/0011-internationalisation-de-l-interface.md)
est **accepté et implémenté** sur `main` (#64). La constitution suit, en version 1.1.0, principe V.
Conséquences pour cette feature :

- **Aucun texte affiché dans le code.** La slice `upload-history` a son propre namespace i18next,
  `features/upload-history/i18n/{fr,en}.json`, le français étant la langue source et l'anglais la
  seconde langue. Il est déclaré dans `apps/web/src/i18n/resources.ts`, seul module à connaître
  tous les catalogues. Les liens de navigation du shell (« Historique », « Nouvelle photo ») vont
  dans `app/i18n/`.
- **`model/` et `api/` rendent un type d'échec, jamais une phrase.** L'UI le formule par une table
  explicite (`Record<Failure, () => string>`), sur le modèle de `photo-upload/ui/failure-message.tsx`.
  Une clé construite dynamiquement échapperait au typage.
- **Les slices passent par `useMessages`** de `@pick-a-book/shared-i18n`. Jamais d'import direct
  d'i18next (`bannedExternalImports`).
- **Les gardes existants s'appliquent.** La cible `translations` refuse une traduction absente ou un
  texte en dur dans le JSX. Le test de parité des catalogues vérifie les formes plurielles CLDR
  (« 1 livre détecté » et « 12 livres détectés » sont une clé plurielle, `count`) et les
  paramètres.
- **Les tests restent lisibles en français.** La configuration de test épingle la langue sur le
  français, donc les textes cités dans `tasks.md` sont les valeurs françaises attendues.

*Amendement du 03/10/2026* : l'[ADR 0012](../../docs/adr/0012-design-system-de-l-interface.md)
(shadcn/ui, Tailwind) est **accepté**. Les nouveaux écrans se composent avec `libs/shared/ui` et
des classes Tailwind sur les tokens, sans CSS Module ; le comportement décrit ici ne change pas.
Le repli d'image (photo, vignette, indicateur neutre) devient un composant du design system,
`FallbackImage`, puisqu'il ne dépend d'aucune slice. L'[ADR 0013](../../docs/adr/0013-politique-d-erreur-result-aux-frontieres.md)
(`Result` aux frontières) est lui aussi accepté : les erreurs de ce document que le domaine
« lève » sont des `Err` (voir l'amendement de `tasks.md`).

## 13. Plafond d'envois (FR-017)

*Amendement du 04/10/2026, revue de la PR #82.*

**Décision** :
- `StoreShelfPhotoUseCase` demande au dépôt, **avant d'écrire la photo dans le bucket**,
  `checkUploadQuota(ownerId, policy)` : il compte les envois (`uploads` de type `shelf_photo`, jamais
  les vignettes) du propriétaire depuis minuit, heure de Paris, et rend `DailyUploadQuotaExceeded`
  quand il y en a déjà `DAILY_UPLOAD_LIMIT` (100 par défaut).
- `DailyUploadQuotaExceeded` devient un **429** `DAILY_UPLOAD_QUOTA_EXCEEDED`. La photo n'est pas
  conservée et aucune ligne n'est créée.
- `DAILY_UPLOAD_LIMIT` se lit comme `DAILY_SCAN_LIMIT` : entier ≥ 1, optionnel, et posé aussi dans
  `infra/envs/prod` (`daily_upload_limit`), avec la même valeur par défaut et la même validation.

**Raison** :
- **Avant le bucket, pas après.** Le use case écrit la photo, puis la vignette, puis la ligne. Un
  plafond vérifié à la création de la ligne laisserait **un objet orphelin par envoi refusé** : le
  bucket se remplirait précisément quand on abuse, ce que le plafond doit empêcher.
- **Un simple comptage, sans verrou.** Contrairement aux analyses, l'envoi n'a pas de coût par
  unité : le plafond protège le stockage, pas la facture. Deux envois simultanés proches du plafond
  peuvent donc passer tous les deux. Le dépassement est borné par le nombre d'envois que la limite de
  requêtes par source (research.md §9, 10 écritures par minute) laisse passer en parallèle, soit
  quelques unités, et il ne se répète pas : l'envoi suivant voit le compte réel.
- **Tous les envois, pas seulement ceux jamais analysés.** Un seul `count`, qui ne bouge pas quand
  une analyse aboutit ; « en attente » obligerait à reconsidérer le compte à chaque transition.
- **100 par jour.** Chaque analyse suit un envoi (au plus 50 par jour), et les photos envoyées une
  fois le plafond d'analyses atteint doivent encore passer pour être relancées le lendemain.

**Alternatives écartées** :
- *Vérifier dans `createPending`, sous le verrou des tentatives.* Atomique, mais après le bucket :
  un orphelin par refus.
- *Écrire la ligne avant les objets.* Atomique et sans orphelin d'objet, mais un échec du bucket
  laisse alors une ligne sans photo, visible dans l'historique (voir
  `docs/tech-debt/photo-orpheline-apres-vignette.md`).
- *Une table de réservations d'envoi.* Une table de plus pour borner un dépassement de quelques
  unités.
