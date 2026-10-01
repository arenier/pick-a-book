# ADR 0014 — Référentiel bibliographique : catalogue général de la BnF, appariement en cascade

Statut : proposé · Date : 2026-09-30 · Couplé aux ADR [0005](0005-reconnaissance-livres-photo-etagere.md) (réconciliation comme filet anti-hallucination), [0010](0010-decoupage-bounded-contexts.md) (contexte `bibliography`) et [0003](0003-orchestration-sans-event-bus.md) (traitement synchrone)

## Contexte

La reconnaissance (ADR 0005) rend, pour chaque tranche lisible, un titre et parfois un auteur, tels
qu'un VLM les a lus. Ce qui en fait un livre, c'est la **réconciliation** contre un référentiel de
notices. L'ADR 0005 en a fait **le filet anti-hallucination du projet**, à la place de l'OCR : un
titre inventé ne doit pas résoudre. L'ADR 0010 place réconciliation et enrichissement dans un seul
contexte, `bibliography`, tant qu'aucun second langage métier n'apparaît.

Le cadre est déjà posé :
- usage personnel, 20 à 200 photos par mois, budget quasi nul ;
- surtout de l'édition française de poche : Folio, Points, Livre de Poche ;
- traitement synchrone dans la requête (ADR 0003).

La spec 002 (PR #74) a construit la réconciliation sans attendre le référentiel. Elle y définit :
- quatre statuts : **confirmé**, **ambigu**, **non trouvé**, **non vérifié** ;
- un port de recherche ;
- des réglages provisoires (seuil 0,85, marge 0,1, 4 recherches en parallèle, 8 s par
  recherche, 18 s au total), que le présent ADR doit confirmer ou remplacer.

Ses critères de succès fixent la barre :
- **SC-001** : au moins 80 % des livres correctement lus ressortent confirmés ;
- **SC-002** : moins de 2 % de confirmés à tort ;
- **SC-003** : 30 livres en 20 s.

Le cadrage et l'étude sont dans l'issue #20.

## Problématique

Contre quel référentiel réconcilier, et comment apparier une lecture bruitée à une notice, de sorte
que **le filet attrape les livres inventés sans rejeter les vrais** ?

Deux points n'étaient pas sus avant la mesure :
- **aucun candidat ne tolère une faute** ;
- **l'écart entre une tranche et une notice est d'abord structurel**, plus qu'orthographique :
  série et tome lus avec le titre, scénariste et dessinateur, mentions d'éditeur.

L'arbitrage porte donc autant sur la stratégie d'appariement que sur le référentiel. Et chaque
tolérance ajoutée pour rattraper un vrai livre peut laisser passer un faux.

Le corollaire, à trancher aussi : ce qu'on garde de la notice (l'**enrichissement**), et si cela
confirme ou réfute l'hypothèse d'un contexte unique de l'ADR 0010.

## Critères de choix

Légende : 🔴 fort · 🟠 moyen · 🟢 faible · ⚪ à clarifier

| Critère | Poids | Motif |
|---|---|---|
| Couverture de l'édition française, poche d'abord | 🔴 | ADR 0005 : critère principal ; SC-001 |
| Aucun livre inexistant confirmé | 🔴 | ADR 0005, point 2 : c'est le filet ; SC-002 |
| Coût récurrent nul, sans clé ni quota partagé | 🔴 | budget quasi nul, un seul mainteneur |
| Tolérance aux fautes de lecture | 🔴 | ADR 0005 ; mesurée **nulle chez tous les candidats** : elle ne départage pas, elle se construit chez nous |
| Stabilité des identifiants | 🟠 | FR-006 : l'identifiant de la notice est stocké et sert de clé |
| Latence d'une étagère entière | 🟠 | SC-003, dans une requête synchrone (ADR 0003) |
| Licence de réutilisation | 🟠 | projet open source ; les notices sont stockées et affichées |
| Attributs utiles au tri en ressourcerie | 🟢 | l'enrichissement sert, il ne décide pas |

## Étude des candidats

Quatre candidats ont été examinés. Google Books (clé, quota partagé) et ISBNdb (payant) sont écartés
sur le coût. **BnF** (API SRU du catalogue général) et **OpenLibrary** ont été mesurés sur les 552
livres de la vérité terrain du bench (#10) :
- sur une lecture parfaite ;
- sur une lecture avec une faute ;
- sur 240 témoins négatifs (livres inexistants).

Chaque variante de stratégie a été rejouée sur les mêmes réponses. Méthode, chiffres et limites
sont consignés dans l'issue #20.

## Solution retenue

**Le catalogue général de la BnF, seul, pour réconcilier et pour enrichir.** L'appariement est une
cascade de requêtes pilotée par le contexte, et le verdict une règle du domaine, indépendante du
référentiel.

### Référentiel

L'API SRU du catalogue général, filtrée sur les textes imprimés (`bib.doctype any "a"`).
L'identifiant stable est l'**ARK** de la notice. OpenLibrary n'est pas interrogé : c'est le repli
nommé par les conditions de bascule.

### Appariement

1. **Normalisation** : `normalizeText` de `libs/shared/text-match` des deux côtés.
   - **Côté lecture** :
     - parenthèses retirées ;
     - titre découpé en segments sur ` - `, ` : ` et ` / `, mentions de tome retirées ;
     - un auteur par nom lu (séparateurs `-`, `/`, `et`, `&`, `,`).
   - **Côté notice** :
     - titre propre, titre avec son complément, et formes coupées avant ` : ` ou ` / ` ;
     - tous les auteurs, principaux et secondaires, dans les deux ordres du nom ;
     - le nom de famille seul vaut correspondance.
2. **Seuils** : **0,85** sur le titre, **0,85** sur l'auteur quand un auteur est lu (`similarity`).
   Un auteur lu qui ne correspond pas écarte la notice. 0,85 est le coude mesuré : 0,90 perd
   9 points sur les titres fautés, 0,80 en gagne 3 mais double les faux positifs sans auteur.
3. **Cascade de requêtes**, arrêtée dès qu'une notice passe les seuils :
   1. titre et auteur (20 notices) ;
   2. pour chaque auteur lu, auteur seul (100 notices, format léger), le titre étant apparié
      localement ;
   3. titre seul (20 notices) ;
   4. chaque segment du titre lu.

   La cascade vit dans **`application`** et l'adapter n'exécute qu'une requête à la fois. La raison :
   l'arrêt dépend du verdict du domaine, qui doit être le même quel que soit le référentiel, et
   testable sans infrastructure.
4. **Verdict** :
   - **Regroupement par œuvre selon notre règle** : deux notices sont la même œuvre si les titres
     par lesquels elles ont été appariées se ressemblent au seuil et, quand aucun auteur n'est lu,
     si leurs auteurs se ressemblent. On ne regroupe pas d'après l'identifiant du référentiel.
   - **Candidats** : score combiné 0,7 × titre + 0,3 × auteur, marge 0,1, cinq au plus.
   - **Statut** : une œuvre → **confirmé** ; plusieurs → **ambigu**.
5. **Segment expliqué** : quand seul un segment du titre lu correspond, le livre n'est confirmé que
   si les autres segments se retrouvent dans la notice (série, collection, tome, éditeur). Sinon il
   est **ambigu**.
6. **Un candidat ambigu est signalé, jamais rejeté ni tranché d'office** : c'est l'utilisateur qui
   choisit (spec 002, US2). La confiance de lecture du VLM n'entre pas dans le verdict : sans
   notice, un livre est non trouvé, quelle que soit sa confiance (FR-004).

### Ce qui est enrichi et stocké

L'enrichissement est la notice BnF retenue, lue dans la même réponse que la réconciliation. Il ne
demande aucun appel ni aucune source de plus.

| Donnée (disponibilité mesurée sur les confirmés) | Usage produit |
|---|---|
| ARK | identifiant stable (FR-006), clé de stockage, lien vers la notice pour l'utilisateur |
| Titre et auteurs de référence | affichage ; complète un auteur absent de la tranche ; entrée de `curation` (bibliothèque, liste de souhaits) |
| Éditeur, année (≈ 100 %), collection et numéro (40 %) | reconnaître l'édition : poche ou grand format, ancienne ou récente — le cœur du tri en ressourcerie |
| ISBN (86 %) | identifier une édition exacte ; clé d'échange pour `curation` et pour une couverture future |
| Sujets (38 %), résumé (17 %), langue | matière pour la préférence en texte libre de `curation` ; stockés quand ils existent, **jamais promis** |
| Date de consultation | attribution exigée par la licence ; savoir d'où date une notice |

Le schéma reste dans `libs/bibliography/infrastructure` (ADR 0006). Il est fixé avec le code.

### Raisons

1. **(🔴 couverture)** Sur une lecture parfaite, la BnF confirme **84,8 %** des livres et en
   laisse **7,4 %** ambigus. OpenLibrary en confirme 55,8 %.
   - Sur les romans de poche, la BnF confirme 93 %, et 92 % sur les polars.
   - Ajouter OpenLibrary en repli ne gagne que **0,9 point** : un second adapter, un second
     contrat, pour presque rien.
2. **(🔴 filet)** Sur les témoins négatifs :
   - **aucun** livre inexistant n'est confirmé quand un auteur est lu : ni un vrai titre prêté au
     mauvais auteur, ni un titre fabriqué ;
   - sans auteur, 1 sur 120.

   Deux règles tiennent ce résultat sans sacrifier la couverture, et la mesure les justifie une à
   une. Le segment expliqué ramène les titres fabriqués confirmés de 7,5 % à 0 %, pour 2 points de
   confirmés. Le regroupement par notre règle fait passer les confirmés de 74,5 % à 84,8 % sans
   créer de faux positif.
3. **(🔴 tolérance aux fautes)** Aucun référentiel ne la fournit. Une requête stricte sur un titre
   fauté résout moins de 1 % des livres, chez les deux. La cascade la construit : **71,8 %** des
   titres fautés sont confirmés. Elle coûte 1,3 requête par livre en moyenne sur une lecture
   parfaite, et 2,3 sur un titre fauté.
4. **(🔴 coût)** Gratuite, sans clé, sans quota documenté, sous licence ouverte. Le seul autre
   candidat gratuit couvre moins bien.
5. **(🟠 identifiants)** L'ARK est conçu pour être pérenne. OpenLibrary, lui, fusionne ses
   nombreux doublons d'œuvres, et l'identifiant d'une œuvre fusionnée devient une redirection.
6. **(🟠 latence)** Une étagère de 30 livres se réconcilie en **8 s médiane, 10 s au 90ᵉ
   centile** (simulation sur latences relevées). C'est dans le budget de SC-003 et dans les
   réglages 4 × 8 s / 18 s de la spec 002, que cet ADR confirme.

   Une condition : la requête « auteur seul » passe en format léger. En UNIMARC, ses 100 notices
   pèsent 320 Ko et coûtent 2,5 s médiane.

**Repli nommé : OpenLibrary**. Il est gratuit, sans clé, et plus rapide (169 ms médiane contre
410 ms). Il couvre nettement moins bien, et son identifiant d'œuvre ne suffit pas à regrouper.

### Conditions de bascule

- **Couverture** : un re-calcul sur la vérité terrain, par le bench et l'adapter réel, qui tombe
  sous **80 % de confirmés**.
  - Revoir d'abord l'appariement : les échecs mesurés viennent surtout de là.
  - Ajouter OpenLibrary en second référentiel seulement si les livres « non trouvés par la BnF,
    confirmés par OpenLibrary » dépassent **5 %** (0,9 % aujourd'hui).
- **Filet** : plus de **2 %** de confirmés à tort, sur les témoins ou sur le bench des sorties VLM
  (SC-002).
  - Retirer d'abord l'étape qui les produit : avec un auteur lu, la mesure attribue tous les faux
    positifs aux étapes « auteur seul » et « segment ».
  - Ne toucher aux seuils qu'ensuite.
- **Seuil** : si le bench sur sorties VLM montre des « non trouvés » dominés par une ou deux
  lettres mal lues, descendre à **0,80**. La mesure y donne 3 points de plus sur les titres
  fautés. En contrepartie, 2 titres fabriqués sur 120 sont confirmés sans auteur, au lieu de 1.
- **Disponibilité** : plus de **5 %** de livres « non vérifiés » sur un mois de production, ou une
  réconciliation d'étagère au-delà de **20 s** au 90ᵉ centile. Cache et format d'abord, puis
  OpenLibrary en repli de disponibilité.
- **Retrait de l'API SRU ou changement de licence** : OpenLibrary, en acceptant sa couverture
  (55,8 % de confirmés mesurés).

### Conséquences

- **Un seul contexte, confirmé** (ADR 0010). La notice qui réconcilie est celle qui enrichit, dans
  la même réponse et le même cycle de vie synchrone. Il n'y a ni seconde source ni arbitrage de
  désaccords : aucun des signaux de scission de l'ADR 0010 n'est présent.
- **La spec 002 est à réaligner avant son implémentation**, la spec passant avant le code
  (`CLAUDE.md`).
  - **Port** : la recherche accepte une requête sans titre (auteur seul) et un nombre de notices.
  - **Notice** : elle expose ses auteurs secondaires et son contexte (série, collection, tome,
    éditeur).
  - **Clé d'œuvre** : `workKey` calculé par l'adapter disparaît, au profit du regroupement par la
    règle du domaine.
  - **Réconciliation** : la cascade et le segment expliqué rejoignent la règle d'appariement.
  - **SC-001** est atteignable sur une lecture parfaite (84,8 %). Reste à le vérifier sur sorties
    VLM.
- **TDD** : les tests d'appariement s'écrivent sur des **réponses BnF enregistrées**, avant le code.
  Les cas de l'étude en donnent le premier jeu :
  - série et tome : « Percy Jackson - La Mer des Monstres » ;
  - illustrateur en 702 : « D. Pennac - J. Ferrandez » ;
  - fausse ambiguïté d'éditions : « Exercices de style » ;
  - titre fauté ;
  - témoins permutés et fabriqués.
- **L'ARK identifie une édition, pas une œuvre.** Deux éditions d'un même livre ont deux ARK :
  `curation` ne peut pas détecter un doublon par égalité d'ARK. Elle compare par la règle d'œuvre
  du domaine, ou par ISBN pour une édition exacte.
- **Attribution** : la Licence Ouverte impose de citer la source. L'interface mentionne la BnF
  partout où une notice s'affiche, et la date de consultation est stockée.
- **Le produit n'appelle la BnF qu'à la réconciliation.** La notice est stockée ; l'historique et
  l'affichage n'en dépendent plus ensuite.
- **Usage poli d'un service public** : 4 requêtes en parallèle au plus, un `User-Agent` qui
  identifie le projet.
- **Le filet a une limite de construction.** Il attrape un livre qui n'existe pas. Il n'attrape
  pas un livre **qui existe**, lu à la place d'un autre (« La Peste » pour « La Chute », même
  auteur). Seul le bench sur sorties VLM le mesure : c'est la seconde condition de bascule de
  l'ADR 0005.
- **Le « taux de résolution » de l'ADR 0005 se compte confirmés et ambigus ensemble.** Dans les deux
  cas, une notice correspond à la lecture, ce qui est la preuve attendue du filet ; l'ambiguïté
  porte sur *quelle* œuvre, pas sur son existence. Son plafond mesuré côté référentiel est de
  **92,2 %**. Un taux VLM sous 80 % parlera donc de la lecture, pas du référentiel.
- **Les rayons BD et cuisine restent faibles** : 64 % et 40 % de confirmés, sur de petits
  échantillons de 44 et 20 livres. Le catalogue y a des trous, et les tranches portent des séries
  ou pas d'auteur. C'est accepté pour un usage centré sur le poche.

## Question ouverte

- **Couverture du livre** : l'API de couvertures d'OpenLibrary la donne par ISBN, avec une limite
  de 100 requêtes par IP toutes les 5 minutes. OpenLibrary a une couverture pour 76 % des œuvres
  qu'il confirme. À décider avec l'interface, selon l'usage réel qu'on en attend devant
  l'étagère. Ce serait une seconde source **sans arbitrage de conflit** (un attribut nouveau, pas
  disputé) : cela ne rouvre pas l'ADR 0010 à soi seul.
- **Genre et résumé pour `curation`** : la BnF en donne peu (sujets 38 %, résumé 17 %). La
  préférence en texte libre aura peu de matière bibliographique ; à instruire avec l'ADR de
  `curation`.
- **Choix de la notice représentative** parmi les éditions d'une même œuvre : poche ou grand
  format, roman ou adaptation en BD cosignée par l'auteur. C'est un réglage de niveau inférieur,
  qui relève de la spec.
