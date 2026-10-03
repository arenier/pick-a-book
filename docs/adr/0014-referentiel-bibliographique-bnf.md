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

Chaque variante de stratégie a été rejouée sur les mêmes réponses. Un échantillon de 80 verdicts a
ensuite été relu à la main. Méthode, chiffres, contrôle et limites sont consignés dans l'issue #20.

## Solution retenue

**Le catalogue général de la BnF, seul, pour réconcilier et pour enrichir.** L'appariement est une
cascade de requêtes pilotée par le contexte, et le verdict une règle du domaine, indépendante du
référentiel.

### Référentiel

L'API SRU du catalogue général, filtrée sur les textes imprimés. L'identifiant stable est l'**ARK**
de la notice. OpenLibrary n'est pas interrogé : c'est le repli nommé par les conditions de bascule.

### Appariement

Cet ADR fixe les principes. Les réglages (séparateurs, taille des pages de résultats, pondération,
marge, ordre détaillé des étapes) relèvent de la spec 002. Leurs valeurs mesurées sont dans
l'issue #20.

1. **Comparaison floue, des deux côtés normalisée** par `libs/shared/text-match`. Le seuil est de
   **0,85** sur le titre, et sur l'auteur quand un auteur est lu. Un auteur lu qui ne correspond
   pas écarte la notice.
2. **La lecture est décomposée, la notice est lue en entier.** Une tranche porte souvent série,
   tome et titre, ou plusieurs noms : on compare chaque segment et chaque nom lu. Côté notice, on
   prend en compte tous les auteurs, y compris illustrateurs et traducteurs, et le contexte
   (série, collection, tome, éditeur).
3. **Une cascade de requêtes**, de la plus précise à la plus large (titre et auteur, auteur seul,
   titre seul, segments), arrêtée au premier verdict. Elle vit dans **`application`**, et l'adapter
   n'exécute qu'une requête à la fois. La raison : l'arrêt dépend du verdict du domaine, qui doit
   être le même quel que soit le référentiel, et testable sans infrastructure.
4. **Le verdict est une règle du domaine.** Les notices qui passent les seuils sont regroupées par
   œuvre selon notre règle, et non d'après l'identifiant du référentiel. Une seule œuvre donne
   **confirmé**, plusieurs donnent **ambigu**.
5. **Un rapprochement partiel ne confirme pas seul.** Quand seul un segment du titre lu
   correspond, le reste de la lecture doit s'expliquer par la notice. Sinon le livre est **ambigu**.
6. **Un candidat ambigu est signalé, jamais rejeté ni tranché d'office** : c'est l'utilisateur qui
   choisit (spec 002, US2). La confiance de lecture du VLM n'entre pas dans le verdict : sans
   notice, un livre est non trouvé, quelle que soit sa confiance (FR-004).

### Périmètre : éditions françaises, traductions comprises

Le référentiel couvre ce que la BnF reçoit au dépôt légal, c'est-à-dire tout ce qui est publié en
France. Les **traductions françaises** d'œuvres étrangères en font partie : elles représentent 31 %
des notices confirmées, et se réconcilient comme le reste.

Les **éditions en langue originale** n'y sont que si la BnF les a acquises : elle en confirme 18
sur un échantillon de 23 titres connus, et manque surtout les best-sellers anglophones récents.
Elles sont **hors du périmètre du MVP** :

- elles sont rares là où le produit s'utilise : une seule sur les 552 livres du jeu de référence ;
- les accueillir ne demande aucun changement d'architecture. La règle d'appariement ne dépend pas du
  référentiel, et OpenLibrary s'ajouterait comme second adapter derrière le même port, sans conflit
  à arbitrer avec la BnF.

Les alphabets non latins ne sont pas mesurés et restent hors périmètre.

### Ce qui est enrichi et stocké

L'enrichissement est la notice BnF retenue, lue dans la même réponse que la réconciliation. Il ne
demande aucun appel ni aucune source de plus.

| Donnée | Disponibilité | Usage produit |
|---|---:|---|
| ARK | 100 % | identifiant stable (FR-006), clé de stockage, lien vers la notice |
| Titre et auteurs de référence, avec leur rôle | 100 % | affichage ; complète un auteur absent de la tranche ; entrée de `curation` |
| Éditeur, année | ≈ 100 % | reconnaître l'édition |
| Pages et format en centimètres | 99 % | distinguer un poche d'un grand format : le cœur du tri en ressourcerie |
| Collection et numéro | 41 % | idem |
| ISBN | 86 % | identifier une édition exacte ; clé d'échange pour `curation` |
| Prix neuf | 84 % | situer le prix demandé en ressourcerie |
| Genre (cadre de classement de la Bibliographie nationale française) | 85 % | regrouper et filtrer ; matière pour `curation` |
| Forme, genre et sujets RAMEAU, indice Dewey | 15 à 28 % | idem, plus fin quand il existe |
| Résumé de quatrième de couverture | 17 % | affichage quand il existe, **jamais promis** |
| Langue, langue et titre d'origine d'une traduction | 100 %, 31 % | signaler une traduction ; relier deux éditions d'une même œuvre |
| Couverture servie par le catalogue | 20 % | aider à reconnaître le livre ; jamais promise |
| ISNI des auteurs | 94 % | relier l'auteur à sa notice d'autorité (data.bnf.fr, Wikidata, VIAF) |
| Date de consultation | 100 % | attribution exigée par la licence |

Le libellé des codes de genre reste à établir sur la table officielle avant de l'afficher. Le schéma
vit dans `libs/bibliography/infrastructure` (ADR 0006), fixé avec le code.

### Portée des mesures

Les chiffres qui suivent sont des **ordres de grandeur**, pas des garanties :

- la stratégie a été réglée en regardant les échecs des 552 livres qui servent à l'évaluer, sans
  jeu de validation séparé : les taux sont optimistes ;
- ils partent d'une lecture parfaite, le bruit de lecture n'étant que simulé ;
- les témoins négatifs sont grossiers (titres recollés, auteurs permutés), loin d'une
  hallucination plausible ;
- les petits échantillons (rayons BD et cuisine, titres étrangers) ne donnent qu'une tendance.

Le contrôle manuel de 50 confirmés ne trouve aucune œuvre étrangère au livre lu, et au plus un
mauvais tome. Cela borne les confirmés à tort à quelques pourcents, sans prouver SC-002.

**La décision tient malgré ces limites.** Les écarts qui la fondent (BnF contre OpenLibrary,
requête unique contre cascade) sont trop grands pour qu'un réglage les inverse. Les chiffres, eux,
ne seront établis que par le bench sur sorties VLM réelles : c'est la première condition de
bascule.

### Raisons

1. **(🔴 couverture)** Sur une lecture parfaite, la BnF confirme **84,8 %** des livres et en
   laisse **7,4 %** ambigus. OpenLibrary en confirme 55,8 %. Sur les romans de poche, la BnF
   confirme 93 %. Ajouter OpenLibrary en repli ne gagne que **0,9 point** : un second adapter, un
   second contrat, pour presque rien.
2. **(🔴 filet)** Aucun témoin négatif n'est confirmé quand un auteur est lu, et 1 sur 120 sans
   auteur. Deux principes tiennent ce résultat sans sacrifier la couverture : le rapprochement
   partiel qui ne confirme pas seul ramène les titres fabriqués confirmés de 7,5 % à 0 %, et le
   regroupement par notre règle fait passer les confirmés de 74,5 % à 84,8 % sans faux positif.
3. **(🔴 tolérance aux fautes)** Aucun référentiel ne la fournit : une requête stricte sur un titre
   fauté résout moins de 1 % des livres, chez les deux. La cascade la construit : **71,8 %** des
   titres fautés sont confirmés, pour 1,3 requête par livre en moyenne sur une lecture parfaite.
4. **(🔴 coût)** Gratuite, sans clé, sans quota documenté, sous licence ouverte. Le seul autre
   candidat gratuit couvre moins bien.
5. **(🟠 identifiants)** L'ARK est conçu pour être pérenne. OpenLibrary, lui, fusionne ses
   nombreux doublons d'œuvres, et l'identifiant d'une œuvre fusionnée devient une redirection.
6. **(🟠 latence)** Une étagère de 30 livres se réconcilie en **8 s médiane, 10 s au 90ᵉ
   centile**, en simulation sur des latences relevées un seul jour. C'est dans le budget de SC-003
   et dans les réglages de la spec 002, que cet ADR confirme, à condition que la requête « auteur
   seul » passe en format léger.

**Repli nommé : OpenLibrary**. Il est gratuit, sans clé et plus rapide. Il couvre nettement moins
bien, et son identifiant d'œuvre ne suffit pas à regrouper.

### Conditions de bascule

- **Couverture** : le bench sur sorties VLM réelles, avec l'adapter réel, tombe sous **80 % de
  confirmés**.
  - Revoir d'abord l'appariement : les échecs mesurés viennent surtout de là.
  - Ajouter OpenLibrary en second référentiel seulement si les livres « non trouvés par la BnF,
    confirmés par OpenLibrary » dépassent **5 %** (0,9 % aujourd'hui).
- **Filet** : plus de **2 %** de confirmés à tort, sur les témoins ou sur un contrôle manuel des
  sorties du bench (SC-002).
  - Retirer d'abord l'étape de la cascade qui les produit. Avec un auteur lu, la mesure attribue
    tous les faux positifs aux étapes « auteur seul » et « segment ».
  - Ne toucher au seuil qu'ensuite.
- **Seuil** : si le bench montre des « non trouvés » dominés par une ou deux lettres mal lues,
  descendre à **0,80**. La mesure y donne 3 points de plus sur les titres fautés, et un titre
  fabriqué de plus confirmé sans auteur, sur 120.
- **Disponibilité** : plus de **5 %** de livres « non vérifiés » sur un mois de production, ou une
  réconciliation d'étagère au-delà de **20 s** au 90ᵉ centile. Cache et format d'abord, puis
  OpenLibrary en repli de disponibilité.
- **Éditions en langue originale** : plus de **5 %** des livres détectés en usage réel sont en
  langue étrangère, ou ils dominent les « non trouvés ». OpenLibrary s'ajoute alors en second
  référentiel, interrogé quand la BnF ne trouve rien. L'ADR 0010 n'est pas rouvert pour autant : les
  deux sources ne se contredisent pas, l'une prend le relais de l'autre.
- **Retrait de l'API SRU ou changement de licence** : OpenLibrary, en acceptant sa couverture.

### Conséquences

- **Un seul contexte, confirmé** (ADR 0010). La notice qui réconcilie est celle qui enrichit, dans
  la même réponse et le même cycle de vie synchrone. Il n'y a ni seconde source ni arbitrage de
  désaccords : aucun des signaux de scission de l'ADR 0010 n'est présent.
- **La spec 002 est à réaligner avant son implémentation**, la spec passant avant le code
  (`CLAUDE.md`) :
  - le port de recherche accepte une requête sans titre (auteur seul) et un nombre de notices ;
  - la notice expose ses auteurs secondaires et son contexte (série, collection, tome, éditeur) ;
  - la clé d'œuvre calculée par l'adapter disparaît, au profit du regroupement par la règle du
    domaine ;
  - la cascade et le rapprochement partiel rejoignent la règle d'appariement, avec leurs réglages
    mesurés dans l'issue #20.
- **TDD** : les tests d'appariement s'écrivent sur des **réponses BnF enregistrées**, avant le code.
  L'étude en donne le premier jeu, contrôle manuel compris :
  - série et tome : « Percy Jackson - La Mer des Monstres » ;
  - un nombre qui distingue deux œuvres : « 17 lunes » face à « 18 lunes » ;
  - une mention de tome lue : « Éternels (tome 3) » ;
  - roman et adaptation en BD de même titre : « Le Mystère des pavots blancs » ;
  - illustrateur cosignataire : « D. Pennac - J. Ferrandez » ;
  - fausse ambiguïté d'éditions : « Exercices de style » ;
  - titre fauté ; témoins permutés et fabriqués.
- **L'ARK identifie une édition, pas une œuvre.** Deux éditions d'un même livre ont deux ARK :
  `curation` ne peut pas détecter un doublon par égalité d'ARK. Elle compare par la règle d'œuvre
  du domaine, ou par ISBN pour une édition exacte.
- **La notice représentative d'une œuvre est un choix du domaine**, pas un accident d'ordre de
  réponse. Le contrôle manuel trouve une adaptation en BD retenue pour un roman dans 2 à 3
  confirmés sur 50 : l'enrichissement décrirait alors le mauvais livre. La règle de choix relève de
  la spec 002.
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
  **92,2 %**.
- **« Ambigu » est surtout de la prudence.** Dans le contrôle manuel, le bon livre est parmi les
  candidats 27 fois sur 30, et l'ambiguïté n'est réelle que 8 fois. Le coût est un choix de plus
  pour l'utilisateur, pas un risque pour le filet. Le premier gisement est la confusion entre une
  série et son tome, à traiter dans la spec 002.
- **Les rayons BD et cuisine restent faibles** : 64 % et 40 % de confirmés, sur 44 et 20 livres.
  Le catalogue y a des trous, et les tranches portent des séries ou pas d'auteur. C'est accepté
  pour un usage centré sur le poche.

## Question ouverte

- **Couverture du livre** : la BnF en sert une pour 20 % des notices confirmées. L'API de
  couvertures d'OpenLibrary la donne par ISBN, pour 76 % des œuvres qu'il confirme. À décider avec
  l'interface. Ce serait une seconde source **sans arbitrage de conflit** (un attribut nouveau, pas
  disputé) : cela ne rouvre pas l'ADR 0010 à soi seul.
- **Matière pour `curation`** : le genre est là (85 %), le résumé rarement (17 %). Ce qu'il faut de
  plus à la préférence en texte libre est à instruire avec l'ADR de `curation`.
