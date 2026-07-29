# ADR 0006 — Persistance : SQLite sur bucket monté, avec snapshots datés

Statut : proposé · Date : 2026-07-30 · Socle · Précise l'ADR 0004 (hébergement)

## Contexte

Catalogue petit et à croissance lente : livres reconnus, notices réconciliées, enrichissements,
historique des scans. À 20–200 photos par mois, quelques milliers à quelques dizaines de milliers
de lignes — une base de quelques dizaines de mégaoctets au plus.

**Un seul utilisateur**, donc un seul écrivain de fait. Scale-to-zero assumé, budget quasi nul
([0004](0004-hebergement-cloud-run.md)). Le conteneur n'a pas de disque persistant, et une base
managée facture un plancher mensuel même à trafic nul — ce que la contrainte de coût refuse. Les
images d'étagère sont déjà des objets du bucket.

### Précédent empirique

Deux services tournent sur ce motif dans le même projet GCP. C'est la donnée la plus solide de cet
ADR :

| Service | Depuis | Données | Base autoritative |
|---|---|---|---|
| `actual-server` | 2026-01-04 | ~20 Mo | Non — le navigateur détient la référence |
| `readeck` | 2026-05-03 | ~32 Mo | **Oui — serveur seul détenteur** |

Tous deux : bucket monté en volume gcsfuse, `--max-instances=1`, gen2. Aucun incident de
corruption. `readeck` est le cas pertinent — base autoritative unique, comme pick-a-book.

## Problématique

Un bucket n'est pas un système de fichiers : gcsfuse ne fournit pas le verrouillage POSIX dont
SQLite dépend, une écriture réécrit l'objet entier, et Google déconseille cet usage pour une base.

La question n'est donc pas si le motif est propre — il ne l'est pas — mais **sous quelles
conditions il est sûr**. Trois conditions, toutes remplies ici :

1. **Un seul processus écrivain** : le verrouillage inter-processus n'est jamais sollicité.
2. **Débit d'écriture faible** : des écritures ponctuelles, pas continues.
3. **Écriture atomique des objets GCS** : une génération remplace l'ancienne ou n'existe pas. Le
   pire cas réaliste est la perte de la dernière transaction, pas un fichier déchiré.

Le risque résiduel n'est donc pas la corruption au fil de l'eau, c'est **l'absence de sortie de
secours** si la base est perdue et le constat tardif.

## Critères de choix

Légende : 🔴 fort · 🟠 moyen · 🟢 faible

| Critère | Poids | Motif |
|---|---|---|
| Coût de stockage au repos | 🔴 | Motif d'origine de la décision |
| Coût de développement | 🔴 | Ressource la plus rare |
| Récupérabilité après incident | 🔴 | Le catalogue ne se reconstitue pas |
| Antécédent éprouvé | 🟠 | Deux déploiements en service valent mieux qu'un raisonnement |
| Portabilité pour un tiers | 🟠 | Contrainte open source |
| Intégrité au fil de l'eau | 🟢 | Neutralisée par les trois conditions ci-dessus |
| Concurrence en écriture | 🟢 | Mono-utilisateur |

## Solutions proposées

**A — SQLite sur le bucket monté, sans plus.** Le motif tel qu'il tourne aujourd'hui.
- Pour : zéro code, zéro processus annexe, éprouvé deux fois.
- Contre : la seule récupération est la soft delete par défaut, 7 jours. Impose de détecter
  l'incident dans la semaine, et n'offre aucun historique.

**B — A, plus versioning du bucket et snapshot daté.** `VACUUM INTO` vers un préfixe horodaté.
- Pour : garde tout de A, et ajoute un horizon de récupération choisi plutôt que subi. Produit un
  fichier cohérent sans arrêter le service, pour un coût de stockage négligeable.
- Contre : une vingtaine de lignes et un déclencheur à surveiller.

**C — SQLite local répliqué en continu (Litestream).** Sémantique de disque correcte et
restauration à un instant donné, au prix d'un binaire, d'une restauration au démarrage à froid et
de mémoire d'instance. Achète une intégrité que les trois conditions fournissent déjà.

**D — Firestore.** Gratuit à ce volume et sans contrainte d'écrivain, mais modèle documents sans
SQL, et verrouillage fournisseur qui abîme la portabilité.

**E — Postgres managé sur plan gratuit (Neon).** SQL complet, plusieurs écrivains — mais
dépendance à la pérennité d'un plan tiers, et données hors de notre bucket donc hors sauvegarde.

**F — Cloud SQL.** Écartée : plancher de l'ordre de 8–10 € par mois au repos.

**G — Base autoritative côté client (le modèle d'Actual).** Fonctionnerait **hors réseau**, ce qui
a une valeur produit réelle en ressourcerie. Mais c'est une décision produit, pas de persistance :
ADR distinct.

**H — Postgres en conteneur sur Cloud Run.** Écartée : pas de disque persistant.

## Solution retenue

**B — SQLite sur le bucket monté, plus versioning et snapshots datés.**

1. **Coût au repos minimal** (critère 🔴 d'origine) : stockage objet seul. F le prouve par
   l'absurde.
2. **Coût de développement le plus faible des options robustes** (🔴) : le motif est déjà
   opérationnel deux fois, scripts de déploiement à l'appui. Le seul ajout est un snapshot —
   contre un binaire de réplication en C, un modèle de données à repenser en D, un fournisseur
   externe en E.
3. **Ferme le seul risque qui compte** (🔴) : la perte constatée hors de la fenêtre de 7 jours.
   C'est tout l'écart entre A et B.

L'antécédent de `readeck` autorise à ne pas payer le prix de C : la théorie dit le motif fragile,
deux déploiements en service disent qu'il tient dans ces conditions précises. On documente les
conditions, on garde les escalades sous la main.

### Conditions de bascule

- **Toute corruption ou perte constatée en conditions réelles → C.** Un seul incident suffit.
- **Plus d'un écrivain concurrent nécessaire → E**, ou une base managée si le budget évolue.
- **Base au-delà de quelques centaines de mégaoctets, ou écritures fréquentes → C** : chaque
  écriture réécrivant l'objet entier, le motif se dégrade en latence et en opérations.
- **Fonctionnement hors réseau prioritaire → G**, par un ADR produit distinct.

### Conséquences

- **`max-instances=1` est une contrainte d'intégrité, pas un réglage d'échelle** — à poser dans le
  script de déploiement avec son motif en commentaire. Précédent à ne pas reproduire : sur
  `actual-server`, une annotation `maxScale: 20` subsiste au niveau du service alors que la
  révision est à 1.
- **Deux révisions ne doivent pas écrire en parallèle.** Une transition de trafic les fait
  cohabiter ; en usage personnel la mitigation est procédurale — déployer hors utilisation.
- **Versioning à activer explicitement** à la création du bucket, et **fraîcheur du snapshot à
  vérifier** : une sauvegarde silencieusement morte donne une fausse assurance, ce qui est pire
  qu'une absence de sauvegarde.
- **Mode de journalisation à trancher** : le WAL s'appuie sur de la mémoire partagée dont la
  sémantique n'est pas garantie sur un montage FUSE. Le mode par annulation est le choix prudent —
  à vérifier au scaffolding, pas à supposer.
- **Le domaine ignore SQLite** : schéma, migrations et dialecte restent dans `infrastructure`
  ([0002](0002-ddd-et-architecture-hexagonale.md)), ce qui garde C, D et E atteignables sans
  toucher au métier. Les images restent des objets du bucket, référencées par leur clé.

## Question ouverte

Cadence et déclencheur du snapshot — après chaque scan, ou périodique — et rétention des
générations. À trancher au scaffolding, avec la taille réelle de la base sous les yeux.
