# ADR 0006 — Persistance : Postgres managé (Neon)

Statut : proposé · Date : 2026-08-14 · Socle · Précise l'ADR 0004 (hébergement)

## Contexte

Catalogue petit et à croissance lente : livres reconnus, notices réconciliées, enrichissements,
historique des scans. À 20–200 photos par mois, quelques milliers à quelques dizaines de milliers
de lignes — une base de quelques dizaines de mégaoctets au plus.

**Un seul utilisateur**, donc un seul écrivain de fait. Cloud Run scale-to-zero et budget quasi nul
([0004](0004-hebergement-cloud-run.md)). Cloud Run et le bucket restent : Cloud Run héberge l'API
conteneurisée sans état, le bucket stocke les images d'étagère et les assets du front — ce sont là
leurs seules finalités selon 0004. Le point à trancher est le seul qui reste ouvert : **où vit la
base relationnelle.**

Ce que 0004 ne dit pas, et que le présent ADR fixe : la base n'a pas de rôle assigné dans le bucket.
Une version antérieure de cet ADR l'y logeait (SQLite sur le bucket monté) ; nous revenons sur ce
choix avant qu'il ne touche le code — rien n'est encore écrit.

### Précédent empirique, et sa portée

Deux services tournent sur le motif SQLite-sur-bucket dans le même projet GCP :

| Service | Depuis | Données | Base autoritative |
|---|---|---|---|
| `actual-server` | 2026-01-04 | ~20 Mo | Non — le navigateur détient la référence |
| `readeck` | 2026-05-03 | ~32 Mo | **Oui — serveur seul détenteur** |

Bucket monté en volume gcsfuse, `--max-instances=1`, gen2, aucun incident. C'est une donnée solide :
le motif **tient** dans ces conditions. Mais il tient au prix d'un montage FUSE que Google déconseille
pour une base, d'un écrivain unique imposé, et d'une discipline de déploiement. La question de cet ADR
n'est pas *si* ce motif marche — il marche — mais **s'il vaut son prix opérationnel alors qu'un
Postgres managé gratuit existe et n'en demande aucun.**

## Problématique

Où placer la base, et donc où retombe l'effort. Deux familles :

- **La garder dans le bucket** (SQLite) : self-contained, sauvegarde dans le même bucket que les
  images. En échange, un montage gcsfuse (pas de verrouillage POSIX, écriture qui réécrit l'objet
  entier), `max-instances=1` comme **contrainte d'intégrité**, mode journal *rollback* imposé, et
  déploiement hors usage pour éviter deux écrivains le temps d'une transition de trafic.
- **La sortir vers un Postgres managé** : ACID natif, concurrence gérée, motif conventionnel derrière
  un port. En échange, une dépendance externe de plus, et une sauvegarde à réoutiller puisque les
  données ne sont plus dans le bucket.

**Le coût n'est pas l'axe** : les deux familles sont gratuites à ce volume (le free tier d'un Postgres
managé couvre très largement quelques dizaines de mégaoctets). L'arbitrage réel est **un hack
self-contained contre une dépendance externe conventionnelle** — et lequel des deux laisse la
récupérabilité intacte.

Corollaire, à nommer : le choix décide aussi si le bucket doit être **monté** (gcsfuse) ou reste un
simple object store, et si **`max-instances=1`** est une contrainte d'intégrité ou disparaît.

## Critères de choix

Légende : 🔴 fort · 🟠 moyen · 🟢 faible

| Critère | Poids | Motif |
|---|---|---|
| Récupérabilité après incident | 🔴 | Le catalogue ne se reconstitue pas |
| Coût de développement | 🔴 | Ressource la plus rare |
| Intégrité et absence de hack | 🟠 | Motif conventionnel vs montage FUSE déconseillé — critère qui départage |
| Portabilité pour un tiers | 🟠 | Contrainte open source |
| Coût de stockage au repos | 🟠 | Discriminant seulement contre une base *payante*, pas entre options gratuites |
| Antécédent éprouvé | 🟠 | Deux déploiements en service — mais dans d'autres repos, pas ici |
| Concurrence en écriture | 🟢 | Mono-utilisateur ; neutralisée nativement par un vrai SGBD |

## Solutions proposées

**A — SQLite sur le bucket monté, versioning + snapshots datés.** Le choix de la version précédente
de cet ADR.
- Pour : self-contained, sauvegarde dans le même bucket que les images, éprouvé sur `readeck`.
- Contre : montage gcsfuse déconseillé, `max-instances=1` comme contrainte d'intégrité, mode journal
  *rollback* à imposer, déploiement hors usage. Et dans *ce* repo tout reste à écrire — l'antécédent
  vit dans d'autres services, son avance « zéro code » ne s'y transporte pas.

**B — Postgres managé, plan gratuit (Neon), backup `pg_dump` vers le bucket.** ← retenue
- Pour : vrai Postgres (ACID, concurrence gérée), aucun hack gcsfuse, plus de `max-instances=1`,
  scale-to-zero natif (suspend/resume automatique) adapté à l'usage intermittent, schéma standard
  portable via `DATABASE_URL`. Le `pg_dump` périodique ramène la sauvegarde **dans notre bucket** —
  récupérabilité préservée et rendue indépendante de la survie du fournisseur.
- Contre : une dépendance externe de plus dans la chaîne, un driver et un job de dump à écrire (coût
  ponctuel modéré), free tier soumis à évolution.

**C — Supabase (managé, plan gratuit).** Écartée pour *ce* workload : pause après 7 jours
d'inactivité (réveil manuel) et aucune sauvegarde sur le plan gratuit — mal adapté à un usage qui peut
rester plus d'une semaine sans écriture. Neon domine sur exactement ce point (scale-to-zero natif,
pas d'unpause manuel).

**D — Firestore.** Écartée : gratuit à ce volume, mais modèle documents sans SQL et verrouillage
fournisseur qui abîme la portabilité.

**E — Cloud SQL / AlloyDB (managé GCP).** Écartée : pas de free tier — crédit d'essai puis
facturation, plancher de l'ordre de 8–10 € par mois au repos. Le coût que 0004 refuse.

**F — Self-host Postgres sur VM GCP « Always Free » (e2-micro).** Écartée : réintroduit le « VPS géré
à la main » que 0004 a rejeté (patchs, maintenance système), casse le scale-to-zero, ~1 Go de RAM
partagé, et la base reste hors du bucket. On paierait en maintenance ce qu'on économise en euros.

**G — Postgres en conteneur sur Cloud Run.** Écartée : pas de disque persistant.

**H — Litestream (SQLite répliqué).** Écartée : achète une intégrité que Neon fournit nativement, au
prix d'un binaire et d'une restauration à froid — pertinent seulement en restant sur SQLite.

**I — Base autoritative côté client (le modèle d'Actual).** Fonctionnerait hors réseau, ce qui a une
valeur produit réelle en ressourcerie. Mais c'est une décision *produit*, pas de persistance : ADR
distinct. Un Postgres managé lui est plus contraire que SQLite — à peser si ce besoin monte.

## Solution retenue

**B — Postgres managé sur Neon, avec backup `pg_dump` vers le bucket.**

Périmètre : MVP et au-delà. Réversibilité prévue : le domaine ignore le SQL
([0002](0002-ddd-et-architecture-hexagonale.md)), schéma, migrations et dialecte restent dans
`infrastructure` derrière un port — revenir à SQLite ou changer de Postgres reste local à l'infra.
Neon est notre instance ; le code n'est lié qu'à Postgres, pas à Neon.

1. **La récupérabilité est préservée et rendue indépendante du fournisseur** (🔴) : le `pg_dump`
   périodique vit dans notre bucket, avec le versioning et la rétention qu'on contrôle — le même
   artefact-cible que les snapshots de l'option A. Si Neon disparaît, on restaure le dump dans
   n'importe quel Postgres. On ne troque donc pas la récupérabilité contre l'ergonomie : on la garde,
   ce qui lève la seule objection sérieuse à un managé (« données hors sauvegarde »).

2. **Le surcoût de développement est ponctuel, modéré, et plus faible qu'il n'y paraît** (🔴) : rien
   n'est encore écrit dans ce repo. L'avance « zéro code » de A tenait à un antécédent situé dans
   *d'autres* services — construire A ici serait tout autant du net-new. Le delta de B se réduit alors
   à un driver, un `DATABASE_URL` et un job de dump (≈ l'effort du snapshot que A demandait déjà). En
   face, on supprime deux coûts **récurrents** : le montage gcsfuse et la discipline `max-instances=1`.

3. **Suppression du hack, gain d'intégrité** (🟠, critère qui départage un choix par ailleurs serré) :
   Postgres derrière un port est le motif conventionnel ; l'intégrité ACID est native au lieu d'être
   garantie par trois conditions sur un montage FUSE que Google déconseille. C'est le critère sur
   lequel A score le plus mal, et celui qui fait pencher une fois le coût neutralisé et la
   récupérabilité tenue par ailleurs.

### Conditions de bascule

- **Free tier Neon supprimé ou trop restreint** → Cloud SQL si le budget évolue, sinon self-host au
  prix de la maintenance. Le `pg_dump` portable rend cette bascule non-catastrophique.
- **Coût qui dérive avec l'usage** → réévaluer. À 20–200 photos/mois on reste très en deçà du free
  tier ; à instrumenter par un simple suivi du volume et des quotas Neon.
- **Fonctionnement hors réseau prioritaire** (ressourcerie) → base autoritative côté client (solution
  I), par un ADR *produit* distinct. Un managé y étant plus contraire que SQLite, ce besoin peut
  rouvrir le présent arbitrage.

### Conséquences

- **Sur 0004 (accepté) : `max-instances=1` n'est plus une contrainte d'intégrité.** La base ne vit
  plus dans le bucket ; Cloud Run retrouve le scale-to-zero (0→N) que 0004 assumait nativement. Le
  cœur de 0004 (Cloud Run pour l'API, bucket pour images et assets) est inchangé ; 0004 porte un
  renvoi vers le présent ADR pour cette conséquence révisée.
- **Le bucket n'a plus besoin d'être monté en gcsfuse** : il redevient un object store accédé via le
  SDK GCS, pour les seules images d'étagère et assets du front — sa finalité 0004. Un hack de moins.
- **Nouvelle dépendance de démarrage** : un `DATABASE_URL` requis, cohérent avec le fail-fast des
  variables d'environnement déjà en place. Pour un tiers qui déploie le projet, c'est la seule
  variable à fournir — n'importe quel Postgres convient, ce qui *améliore* la portabilité par rapport
  à un montage gcsfuse à reproduire.
- **Backup à instrumenter et à surveiller** : un `pg_dump` périodique vers le bucket, dont la
  **fraîcheur se vérifie** — une sauvegarde silencieusement morte donne une fausse assurance, pire
  qu'une absence de sauvegarde.
- **Le client Postgres et l'ORM sont en pur JavaScript** : le driver (`pg`) et **Drizzle** par-dessus
  n'apportent aucune dépendance native — contrairement à un binding SQLite, ou au moteur natif en Rust
  de Prisma. Le déclencheur de bascule *attendu* par [0007](0007-vite-et-vitest-outillage-unique.md)
  (une dépendance native que le build doit traiter) ne se matérialise donc pas via la persistance.
- **Schéma, migrations et dialecte Postgres restent dans `infrastructure`**
  ([0002](0002-ddd-et-architecture-hexagonale.md)) : le domaine ne connaît pas Postgres. Les images
  restent des objets du bucket, référencées par leur clé.
- **Deux révisions concurrentes ne corrompent plus rien** : Postgres gère la concurrence, le
  déploiement se simplifie d'autant.

## Question ouverte

- **Cadence et rétention du `pg_dump`** — après chaque scan, ou périodique ; combien de générations
  conserver. À trancher au scaffolding, la taille réelle de la base sous les yeux.
- **Outillage de persistance (ORM, migrations)** — l'ORM est **Drizzle** (avec `drizzle-kit` pour les
  migrations). Ce choix et son détail — schéma, configuration — relèvent du module `infrastructure`,
  pas d'un ADR : interchangeable derrière le port, sans impact architectural. Consigné ici pour
  mémoire, la décision vit dans le README de `infrastructure`.
