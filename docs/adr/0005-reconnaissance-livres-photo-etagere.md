# ADR 0005 — Source de reconnaissance des livres sur photo d'étagère

Statut : proposé · Date : 2026-07-29 · Phase 1 · Couplé à l'ADR d'enrichissement (à écrire)

## Contexte

Extraction de couples `(auteur, titre)` depuis une photo d'étagère prise au téléphone en ressourcerie.

Conditions de prise de vue :
- tranches majoritairement, couvertures parfois
- texte vertical à 90°, orientations mélangées
- perspective, fuite sur les bords, livres empilés à plat
- tranches usées ; éditeur/collection souvent plus proéminents que l'auteur

Cadre : usage perso, 20–200 photos/mois, latence de quelques secondes acceptable, budget quasi nul, bounded context isolé derrière un port hexagonal (choix réversible sans impact domaine).

## Problématique

La question n'est pas « qui lit mieux les caractères » mais **où placer l'effort de structuration** : code applicatif maintenu par nous, ou modèle.

Corollaire : où placer la détection d'erreur. L'OCR produit du bruit détectable ; le VLM (*vision-language model* : modèle multimodal image + consigne) produit des erreurs plausibles, indétectables sans référentiel externe.

## Critères de choix

Légende : 🔴 fort · 🟠 moyen · 🟢 faible · ⚪ à clarifier

| Critère | Poids | Motif |
|---|---|---|
| Coût de développement / maintenance | 🔴 | Ressource la plus rare |
| Qualité de structuration `(auteur, titre)` | 🔴 | Contrat de sortie du BC |
| Détectabilité des erreurs | 🔴 | Une erreur silencieuse ruine la confiance |
| Réversibilité | 🟠 | Atténué par l'hexagonal |
| Robustesse rotations / perspective | 🟠 | C'est la norme, pas l'exception |
| Coût d'exécution | 🟢 | Non discriminant à cette volumétrie |
| Latence | 🟢 | Quelques secondes acceptables |
| Conformité « open source » | ⚪ | Voir question ouverte |

## Solutions proposées

**A — OCR seul.** Fragments + bounding boxes, regroupement géométrique par code applicatif.
- Pour : pas d'hallucination (sortie ancrée sur les pixels), scores de confiance par fragment, auto-hébergeable (Tesseract, PaddleOCR).
- Contre : toute la structuration à notre charge, et c'est le gros du travail. La segmentation de tranches penchées est un problème de vision à part entière — l'état de l'art mobilise de la détection orientée (Oriented R-CNN, YOLO adapté) parce que le géométrique simple plafonne. Aucune distinction sémantique auteur / titre / éditeur.

**B — VLM seul.** Image + consigne → JSON `{ auteur, titre, confiance }[]`, validé par schéma.
- Pour : coût de dev minimal (prompt + schéma + validateur). Structuration, rotations, distinction auteur/titre/éditeur traitées nativement. Un adaptateur, un secret.
- Contre : hallucination — complétion silencieuse d'un titre partiellement lisible vers l'œuvre attendue, indétectable dans la sortie. Pas de confiance calibrée, pas de traçabilité pixels. API propriétaire, sortie non déterministe donc tests plus délicats.

**C — OCR + VLM.** Texte OCR injecté dans le prompt aux côtés de l'image ; rejet a posteriori de tout token absent du texte OCR.
- Pour : meilleure garantie anti-hallucination sans référentiel externe. Approche hybride texte + image retenue dans la littérature sur les tranches.
- Contre : ~3× le coût d'implémentation et de test de B (deux fournisseurs, deux adaptateurs, fusion, arbitrage des désaccords), pour un gain non mesuré. Latence cumulée. Et l'OCR n'est pas le seul ancrage disponible — voir solution retenue.

**D — Segmentation dédiée puis OCR par tranche.** Écartée : suppose un jeu annoté à l'échelle de 10⁴ instances et un hébergement GPU, incompatible avec Cloud Run à bas coût.

## Solution retenue

**B pour le MVP, port conçu pour accueillir C sans refonte.**

Trois raisons :

1. La tâche coûteuse est la structuration, pas la lecture. A la met dans notre code, B la délègue. À contrainte de temps dominante, décisif.
2. **Le filet anti-hallucination du projet est la réconciliation bibliographique, pas l'OCR.** Un titre halluciné ne résout pas contre un référentiel de notices, ou résout avec une similarité faible qu'il suffit de seuiller. Cette réconciliation est de toute façon requise (identifiants stables pour l'enrichissement et la détection de doublons). Le contrôle que C achète au prix d'un second fournisseur existe déjà en aval — à condition de le concevoir explicitement comme tel.
3. `ShelfScannerPort.scan(image): Promise<DetectedBook[]>` — passer à C = substituer un adaptateur composite. Domaine, application et frontend indifférents.

### Conditions de bascule vers C

À instrumenter dès la phase 3 sur un jeu de référence de 20–30 photos réelles :
- taux de résolution contre le référentiel durablement < 80 % ;
- ou faux positifs à haute similarité (titres hallucinés qui résolvent quand même) — le cas qui invaliderait le point 2 et justifierait seul l'ancrage OCR.

### Conséquences

- L'ADR d'enrichissement n'est plus indépendant : la source d'enrichissement doit être choisie d'abord sur sa **recherche floue tolérante aux fautes** et sa couverture de l'édition française de poche (Folio, Points, Livre de Poche). Catalogues nationaux et référentiels ouverts a priori mieux placés que les API commerciales sur ce critère — à instruire.
- Le port expose une confiance par livre détecté, pour que l'orchestration (phase 5) puisse écarter ou signaler les détections faibles.
- Tests d'intégration phase 3 : réponses enregistrées pour le déterministe, test de non-régression séparé et manuel sur le jeu de référence.

## Question ouverte

**Périmètre de « open source ».** Si la contrainte couvre toute la chaîne d'exécution, seule A auto-hébergée est admissible et l'arbitrage s'inverse, au prix décrit en A. Si elle couvre le code du projet et sa portabilité, B et C restent ouvertes — reste à décider si un repli auto-hébergé est maintenu comme second adaptateur ou si la dépendance est assumée.

Le fournisseur précis (modèle, version, région) n'est pas figé ici : ADR de niveau inférieur, plus volatil, sans impact architectural.
