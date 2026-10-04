# ADR 0014 — Référentiel bibliographique : catalogue général de la BnF, appariement en cascade, Google Books en complément

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

Quatre candidats ont été examinés. ISBNdb est écarté sur son coût. **BnF** (API SRU du catalogue
général) et **OpenLibrary** ont été mesurés comme référentiels sur les 552 livres de la vérité
terrain du bench (#10) :
- sur une lecture parfaite ;
- sur une lecture avec une faute ;
- sur 240 témoins négatifs (livres inexistants).

Chaque variante de stratégie a été rejouée sur les mêmes réponses, puis un échantillon de verdicts
a été relu à la main. La stratégie a enfin été appliquée sans réglage aux sorties réelles de deux
VLM, sur 8 photos jamais vues : c'est [le jeu de validation](https://github.com/arenier/pick-a-book/issues/20#issuecomment-5979222261). **Google Books** n'est pas un référentiel possible : il demande une clé, son
quota est partagé, sa recherche par champ est en panne, et une édition retrouvée sur cinq seulement
est celle de la notice BnF. Il a été mesuré comme source d'enrichissement. Méthode, chiffres, contrôle manuel et limites sont dans
[l'étude de l'issue #20](https://github.com/arenier/pick-a-book/issues/20#issuecomment-5978322572).

## Solution retenue

**Le catalogue général de la BnF, seul juge de la réconciliation et première source
d'enrichissement. Google Books complète l'enrichissement, sans jamais décider.** L'appariement est
une cascade de requêtes pilotée par le contexte, et le verdict une règle du domaine, indépendante
du référentiel.

### Référentiel

L'API SRU du catalogue général, filtrée sur les textes imprimés. L'identifiant stable est l'**ARK**
de la notice. OpenLibrary n'est pas interrogé : c'est le repli nommé par les conditions de bascule.

### Appariement

Cet ADR fixe les principes. Les réglages (séparateurs, taille des pages de résultats, pondération,
marge, ordre détaillé des étapes) relèvent de la spec 002 ; leurs valeurs mesurées sont dans
l'étude.

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

### Deux appels, deux exigences

- **L'appel à la BnF est critique : il ne doit pas échouer.** Il porte le verdict. Il a son délai
  et ses nouvelles tentatives, bornés par le budget de la spec 002. S'il échoue malgré tout, le
  livre est **non vérifié**, jamais « non trouvé ». La lecture étant stockée, sa réconciliation
  se rejoue plus tard.
- **Les appels de complément sont tolérés : leur échec ne bloque rien.** Google Books n'est
  appelé qu'après le verdict, pour les livres confirmés. Il a un délai court et aucune nouvelle
  tentative dans la requête. S'il échoue, ou s'il n'a pas répondu à l'échéance de la spec 002, le
  livre reste confirmé et son enrichissement est marqué **incomplet**, à compléter plus tard.
  Toute source de complément ajoutée ensuite suit le même régime.

### Deux scores : la lecture et la réconciliation se notent à part

La confiance du VLM dit **à quel point la tranche a été bien lue** (ADR 0005). La réconciliation
produit son propre **score de résultat**, calculé par le domaine, qui dit **à quel point le livre
retenu est sûr**. Les deux ne sont jamais fusionnés : un titre bien lu peut ne correspondre à rien,
et une lecture hésitante peut tomber sur une notice certaine.

- **Le score de réconciliation** vient de l'appel à la BnF : similarité du titre et de l'auteur,
  étape de la cascade qui a trouvé (titre et auteur avant segment), rapprochement partiel, nombre
  de candidats.
- **Une confirmation sans auteur lu vaut moins.** Le score baisse quand la lecture ne porte qu'un
  titre. Sur le jeu de validation, presque toutes les fausses confirmations hors invention viennent
  de lectures sans auteur : un nom d'autrice lu comme titre, un morceau de titre, un titre mal lu
  qui en rencontre un autre. Le statut reste « confirmé » : c'est l'affichage et les alertes qui
  en tiennent compte.
- **L'état de l'enrichissement** vient des appels de complément : pour chaque source, réussi, en
  échec ou sans résultat. Un complément en échec rend l'enrichissement incomplet sans abaisser le
  score de réconciliation.
- **Le statut reste le verdict** (confirmé, ambigu, non trouvé, non vérifié). Le score le qualifie
  pour l'affichage, le tri et les alertes. Il ne le remplace pas.
- **Google Books n'entre pas dans le score de réconciliation** tant que son appariement n'a pas été
  éprouvé sur les témoins négatifs. Trouver le même livre chez lui pourrait alors corroborer la
  BnF.

La formule relève de la spec 002.

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

L'enrichissement est d'abord la notice BnF retenue, lue dans la même réponse que la réconciliation.

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

Le libellé des codes de genre reste à établir sur la table officielle avant de l'afficher.

**Google Books complète ce que la BnF n'a pas**. Sa recherche plein texte part du titre et des
auteurs de la notice BnF, et l'appariement suit la même règle du domaine :

| Donnée | Disponibilité, sur les livres qu'il retrouve | Usage produit |
|---|---:|---|
| Description, une quatrième de couverture d'éditeur | 75 % | le résumé, quand la BnF n'en a pas |
| Couverture | 51 % | idem, quand la BnF n'en sert pas |
| Catégorie (« Fiction », « Juvenile Fiction »…) | 56 % | appoint pour `curation` |
| Identifiant du volume | 100 % | clé de la donnée stockée, lien vers la fiche |

Il retrouve 83 % des livres confirmés par la BnF. **Sur un champ que les deux fournissent, la BnF
l'emporte** : Google Books ne remplit que des champs vides. Il n'y a donc aucun désaccord à
arbitrer. Ses notes ne sont pas reprises : une ou deux notes par livre, inexploitables.

**Le résultat de chaque appel est stocké.** Pour la BnF, ce sont les notices retenues et, pour un
livre ambigu, les candidats. Pour Google Books, c'est le volume retenu. Chacun est stocké avec sa
source, son identifiant, sa date de consultation et le statut de l'appel. Un livre déjà réconcilié
ne rappelle personne : l'historique et l'affichage lisent la base. Le schéma vit dans
`libs/bibliography/infrastructure` (ADR 0006), fixé avec le code.

### Portée des mesures

Les chiffres de l'étude sont des **ordres de grandeur** : ils sont mesurés sur une lecture parfaite,
avec une stratégie réglée sur les livres qui l'évaluent (limites détaillées dans l'étude).

Le jeu de validation corrige cette réserve dans le bon sens pour la couverture. Gemini, le
défaut de prod, y lit les auteurs : 89 lectures correctes sur 90 sont confirmées, et un seul livre
sur 92 l'est à tort. Mais il n'a lu que 3 photos, et ces chiffres restent à consolider par le bench
sur sorties VLM réelles : c'est la première condition de bascule.

La décision tient, car les écarts qui la fondent (BnF contre OpenLibrary, requête unique contre
cascade) sont trop grands pour qu'un réglage les inverse.

### Raisons

1. **(🔴 couverture)** Sur une lecture parfaite, la BnF confirme **84,8 %** des livres et en
   laisse **7,4 %** ambigus. OpenLibrary en confirme 55,8 %. Sur les romans de poche, la BnF
   confirme 93 %. Ajouter OpenLibrary en repli ne gagne que **0,9 point** : un second adapter, un
   second contrat, pour presque rien.
2. **(🔴 filet)** Contre un livre qui **n'existe pas**, le filet tient. Aucun titre fabriqué ni
   aucun auteur permuté n'est confirmé quand un auteur est lu, et 1 sur 120 l'est sans auteur. Sur
   le jeu de validation, les lectures fautives de Gemini sont rejetées. Deux principes tiennent ce
   résultat sans sacrifier la couverture : le rapprochement partiel qui ne confirme pas seul
   ramène les titres fabriqués confirmés de 7,5 % à 0 %, et le regroupement par notre règle fait
   passer les confirmés de 74,5 % à 84,8 % sans faux positif.

   Contre un livre **réel** inventé par le VLM, il ne peut rien, quel que soit le référentiel.
   Sur une photo où aucune tranche n'est lisible, Qwen 2.5-VL invente 49 livres, et la BnF en
   confirme 35. Gemini substitue un titre du même auteur à celui de la tranche. Le reste du filet
   est donc ailleurs : dans le choix du VLM, éprouvé par le témoin négatif du bench, et dans un
   score qui pèse moins un titre lu seul.
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
   seul » passe en format léger. Google Books s'inscrit dans le temps restant. Sa latence n'est
   pas mesurée, et ce qui dépasse l'échéance est marqué incomplet.
7. **(🟢 attributs) Google Books, pour le résumé.** La BnF n'a un résumé que pour 17 % des livres
   confirmés. Google Books en donne un pour les trois quarts de ceux qu'il retrouve, et une
   couverture pour la moitié. Il enfreint le critère « sans clé ni quota partagé ». C'est accepté
   parce qu'il ne porte pas le verdict et que son échec est toléré. Son quota courant (de l'ordre
   de 1 000 requêtes par jour) dépasse largement le besoin : quelques centaines de livres par jour
   au plus.

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
- **Google Books** est retiré dans trois cas, et le résumé redevient « quand la BnF l'a » :
  - ses conditions d'utilisation interdisent de conserver ce qu'il renvoie ;
  - son quota ne suffit plus ;
  - plus de **5 %** de descriptions décrivent un autre livre, sur un contrôle manuel.

### Conséquences

- **Un seul contexte, confirmé** (ADR 0010). La notice qui réconcilie est celle qui enrichit d'abord,
  dans le même cycle de vie synchrone. Google Books est une seconde source, mais elle ne remplit
  que des champs vides et n'a aucun désaccord à arbitrer avec la BnF. Aucun des signaux de
  scission de l'ADR 0010 n'est présent.
- **La spec 002 est à réaligner avant son implémentation**, la spec passant avant le code
  (`CLAUDE.md`) :
  - le port de recherche accepte une requête sans titre (auteur seul) et un nombre de notices ;
  - la notice expose ses auteurs secondaires et son contexte (série, collection, tome, éditeur) ;
  - la clé d'œuvre calculée par l'adapter disparaît, au profit du regroupement par la règle du
    domaine ;
  - la cascade et le rapprochement partiel rejoignent la règle d'appariement, avec leurs réglages
    mesurés dans l'issue #20 ;
  - le livre réconcilié porte un score de réconciliation, distinct de la confiance du VLM, et
    l'état de son enrichissement par source ;
  - un port d'enrichissement, distinct du port de recherche, porte Google Books. Son échec est une
    valeur attendue (ADR 0013), pas une exception.
- **TDD** : les tests d'appariement s'écrivent sur des **réponses BnF enregistrées**, avant le code.
  L'étude en donne le premier jeu :
  - série et tome : « Percy Jackson - La Mer des Monstres » ;
  - un nombre qui distingue deux œuvres : « 17 lunes » face à « 18 lunes » ;
  - une mention de tome lue : « Éternels (tome 3) » ;
  - roman et adaptation en BD de même titre : « Le Mystère des pavots blancs » ;
  - illustrateur cosignataire : « D. Pennac - J. Ferrandez » ;
  - fausse ambiguïté d'éditions : « Exercices de style » ;
  - titre fauté ; témoins permutés et fabriqués.

  L'adapter Google Books se teste de même, sur des réponses enregistrées.
- **L'ARK identifie une édition, pas une œuvre.** Deux éditions d'un même livre ont deux ARK :
  `curation` ne peut pas détecter un doublon par égalité d'ARK. Elle compare par la règle d'œuvre
  du domaine, ou par ISBN pour une édition exacte.
- **La notice représentative d'une œuvre est un choix du domaine**, pas un accident d'ordre de
  réponse : une adaptation en BD retenue pour un roman fait décrire le mauvais livre à
  l'enrichissement. La règle de choix relève de la spec 002.
- **Attribution** : la Licence Ouverte impose de citer la source. L'interface mentionne la BnF
  partout où une notice s'affiche, et Google Books à côté de ce qui vient de lui. La date de
  consultation est stockée.
- **Les conditions d'utilisation de Google Books sont à relire avant d'implémenter**, en
  particulier sur la conservation des descriptions et des couvertures : elles n'ont pas pu être
  consultées pendant l'étude. Si elles limitent la conservation, le stockage de ces champs suit
  leur règle. Sinon, c'est la condition de bascule qui s'applique.
- **Une clé d'API entre dans la configuration.** C'est un secret, validé au démarrage comme les
  autres (`adapters.md`) et posé par l'infrastructure, jamais dans le dépôt.
- **Le produit n'appelle les sources qu'à la réconciliation**, puis, pour compléter un
  enrichissement incomplet, plus tard. Ensuite, l'historique et l'affichage n'en dépendent plus.
- **Usage poli d'un service public** : 4 requêtes en parallèle au plus, un `User-Agent` qui
  identifie le projet.
- **Le filet a une limite de construction, désormais mesurée.** Il attrape un livre qui n'existe
  pas. Il n'attrape pas un livre **qui existe**, qu'il soit lu à la place d'un autre (« Souviens-toi »
  pour « Douce nuit », même autrice) ou inventé sur une photo illisible. Seul le bench sur sorties
  VLM le mesure : c'est la seconde condition de bascule de l'ADR 0005.
- **Le bench porte un témoin négatif** : une photo sans aucune tranche lisible
  (`shelf-fixture-11.jpg`). Un fournisseur qui y détecte des livres invente des livres réels que
  la réconciliation confirmera. Le départager relève de l'ADR 0005 et de sa note de décision.
- **Le « taux de résolution » de l'ADR 0005 se compte confirmés et ambigus ensemble.** Dans les deux
  cas, une notice correspond à la lecture, ce qui est la preuve attendue du filet ; l'ambiguïté
  porte sur *quelle* œuvre, pas sur son existence. Son plafond mesuré côté référentiel est de
  **92,2 %**.
- **« Ambigu » est surtout de la prudence** : le bon livre est presque toujours parmi les
  candidats. Le coût est un choix de plus pour l'utilisateur, pas un risque pour le filet. Le
  premier gisement de confirmés est la confusion entre une série et son tome, à traiter dans la
  spec 002.
- **Les rayons BD et cuisine restent faibles** : 64 % et 40 % de confirmés, sur 44 et 20 livres.
  Le catalogue y a des trous, et les tranches portent des séries ou pas d'auteur. C'est accepté
  pour un usage centré sur le poche.

## Questions ouvertes

- **Quand compléter un enrichissement incomplet** : à la consultation suivante du livre, ou par un
  rattrapage périodique. C'est à trancher dans la spec, sans event bus (ADR 0003).
- **Prix littéraires** : Wikidata les donne par l'ISNI de l'auteur. Ils sont surtout rattachés à
  l'auteur, et rarement au livre. S'ils sont ajoutés, c'est comme une information sur l'auteur, et
  comme un complément toléré.
- **Couverture du livre** : la BnF et Google Books réunis en couvrent une partie. L'API de
  couvertures d'OpenLibrary reste disponible, par ISBN, si l'interface en demande davantage.
- **Matière pour `curation`** : le genre (85 %) et désormais le résumé. Ce qu'il faut de plus à
  la préférence en texte libre est à instruire avec l'ADR de `curation`.

## Parking

- **Construire notre propre donnée bibliographique** plutôt qu'appeler les sources à chaque
  réconciliation. Il s'agirait d'une base locale, alimentée par les résultats stockés et, à terme,
  par les exports du catalogue de la BnF sous Licence Ouverte. Elle serait interrogée en premier,
  avant tout appel réseau. Les résultats stockés dès le MVP en sont la première brique. C'est à
  rouvrir si la disponibilité ou la latence de la BnF déclenchent leur condition de bascule, ou
  quand le volume le justifie. Ce serait un nouvel ADR.
- **Repérer une liste inventée au niveau de la photo.** Un livre réel inventé échappe à la
  réconciliation. Mais une liste inventée laisse des traces : beaucoup de titres sans auteur, des
  doublons, une série complète, une langue hors du périmètre, une photo dont la netteté ne permet
  pas de lire. Ces signaux pourraient abaisser le score de toute la photo ou alerter
  l'utilisateur. C'est à instruire dans une spec quand le bench montrera que le VLM de prod en a
  besoin.
