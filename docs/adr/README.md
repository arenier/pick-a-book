# Architecture Decision Records

Les ADR consignent les décisions structurantes du projet : le cadre dans lequel elles ont été
prises, l'arbitrage réel, l'option retenue et ce qu'elle coûte. Un ADR n'est pas de la
documentation d'architecture — il ne décrit pas comment le système marche, il explique
**pourquoi** il est comme ça, et **à quelles conditions** on en changerait.

## Index

| #                                                   | Titre                                                   | Statut   | Phase | Date       |
| --------------------------------------------------- | ------------------------------------------------------- | -------- | ----- | ---------- |
| [0000](0000-template.md)                            | _Squelette à copier — jamais une décision_              | —        | —     | —          |
| [0001](0001-stack-et-monorepo-nx.md)                | Stack Node/TypeScript et monorepo Nx                    | Accepté  | Socle | 2026-07-29 |
| [0002](0002-ddd-et-architecture-hexagonale.md)      | DDD complet, hexagonal au back, feature-slice au front  | Accepté  | Socle | 2026-07-29 |
| [0003](0003-orchestration-sans-event-bus.md)        | Orchestration inter-contextes sans event bus            | Accepté  | Socle | 2026-07-29 |
| [0004](0004-hebergement-cloud-run.md)               | Hébergement sur Cloud Run + bucket                      | Accepté  | Socle | 2026-07-29 |
| [0005](0005-reconnaissance-livres-photo-etagere.md) | Source de reconnaissance des livres sur photo d'étagère  | Proposé  | 1     | 2026-07-29 |
| [0006](0006-persistance-sqlite-bucket-monte.md)     | Persistance : SQLite sur bucket monté, avec snapshots datés | Proposé  | Socle | 2026-07-30 |
| [0007](0007-vite-et-vitest-outillage-unique.md)     | Vite et Vitest comme outillage unique de build et de test | Accepté  | Socle | 2026-07-31 |

**À écrire** — la source d'enrichissement bibliographique. Elle n'a pas de numéro tant que le
fichier n'existe pas ; [0005](0005-reconnaissance-livres-photo-etagere.md) s'y réfère par son sujet
et en contraint déjà le critère de choix principal (recherche floue tolérante aux fautes, couverture
de l'édition française de poche).

Les ADR marqués **Socle** consignent des contraintes actées avant l'ouverture du repo ; ils ont
été rédigés a posteriori et leurs sections « Alternatives » et « Conséquences » sont une
reconstitution du raisonnement, à valider.

## Ajouter un ADR

1. Copier [`0000-template.md`](0000-template.md) en `NNNN-titre-en-kebab-case.md`, `NNNN` étant le
   numéro suivant. Un numéro **s'attribue à la création du fichier** — jamais de réservation à
   l'avance, qui laisserait un trou dans la suite. Un numéro n'est en revanche jamais réutilisé,
   même si l'ADR est rejeté ou abandonné.
2. **Renvoyer à un ADR non écrit par son sujet, pas par un numéro** (« l'ADR d'enrichissement »).
   Un numéro annoncé avant l'écriture devient faux dès que l'ordre change.
3. Le rédiger au présent, en énonçant la décision — pas « on pourrait », mais « nous faisons ».
4. Pondérer les critères, et rattacher chaque raison de la solution retenue à un critère fort.
5. Donner les **conditions de bascule** : le seuil mesurable qui rouvrirait la décision.
6. Ajouter la ligne dans l'index ci-dessus.
7. Le faire passer en PR, comme le code. La discussion a lieu dans la PR ; l'ADR mergé en est
   le résultat.

## Statuts

- **Proposé** — en discussion, PR ouverte, ou décision prise mais pas encore éprouvée par le code.
- **Accepté** — en vigueur.
- **Déprécié** — plus pertinent, sans remplaçant.
- **Remplacé par [NNNN]** — une décision plus récente prend le dessus.

Un ADR accepté ne se réécrit pas et ne se supprime pas. Pour changer d'avis, on en écrit un
nouveau, et on met à jour le statut de l'ancien avec un lien vers le nouveau. L'historique des
décisions fait partie de la valeur du dossier.

## Niveaux

Tout ne mérite pas un ADR. On y consigne ce qui a un **impact architectural** : ce qui contraint
les autres décisions, ou qui coûterait cher à défaire. Les choix plus volatils et sans impact
structurel (version précise d'un modèle, région d'un service, bibliothèque interchangeable) se
documentent dans le code ou le README du module concerné.
