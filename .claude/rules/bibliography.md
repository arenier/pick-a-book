---
paths:
  - "libs/bibliography/**"
---

# Contexte `bibliography` : réconcilier et enrichir

Pourquoi : [ADR 0014](../../docs/adr/0014-referentiel-bibliographique-bnf.md) (référentiel,
appariement, enrichissement), [ADR 0005](../../docs/adr/0005-reconnaissance-livres-photo-etagere.md)
(la réconciliation est le filet anti-hallucination),
[ADR 0013](../../docs/adr/0013-politique-d-erreur-result-aux-frontieres.md) (échecs attendus). Les
réglages (seuils, marge, pages de résultats, ordre de la cascade) vivent dans la spec 002, pas ici.

## La BnF décide, les compléments complètent

- **Seule la BnF tranche la réconciliation.** Aucune autre source ne crée, ne change ni ne
  confirme un statut (confirmé, ambigu, non trouvé, non vérifié).
- **L'appel à la BnF est critique.** Il a un délai et des nouvelles tentatives, bornés par le budget
  de la spec 002. Son échec est un `Err` du port de recherche, qui donne **non vérifié**, jamais
  **non trouvé**.
- **Un appel de complément (Google Books…) est toléré.** Il passe par un port d'enrichissement
  distinct du port de recherche. Il n'est appelé qu'après le verdict, pour les seuls confirmés, avec
  un délai court et sans nouvelle tentative dans la requête. Son échec est un `Err` qui marque
  l'enrichissement **incomplet**, et le livre reste confirmé.
- **Sur un champ commun, la BnF l'emporte.** Un complément ne remplit qu'un champ vide, et chaque
  champ garde sa source, pour l'attribution à l'affichage.

## Apparier

- **La cascade de requêtes vit dans `application`.** L'adapter n'exécute qu'une requête à la fois
  et ne décide jamais de s'arrêter.
- **Le verdict et le regroupement par œuvre sont des règles de `domain`.** On ne regroupe jamais
  d'après l'identifiant d'œuvre du référentiel.
- **On compare avec `libs/shared/text-match`**, des deux côtés, sans réimplémenter de normalisation.
- **Un nombre distingue deux titres**, et une mention de tome lue se compare au numéro de la notice.
- **La confiance du VLM n'entre jamais dans le verdict.**

## Scores et stockage

- **Le score de réconciliation est calculé par `domain`.** Il reste à part de la confiance du VLM :
  aucun champ, aucun calcul ne fusionne les deux. Un complément n'y entre pas.
- **Une confirmation sans auteur lu a un score plus bas** qu'une confirmation où l'auteur
  correspond : un titre seul est une preuve faible. Le statut, lui, ne change pas.
- **L'état de l'enrichissement se tient par source** (réussi, en échec, sans résultat), sans
  toucher au score de réconciliation.
- **Le résultat de chaque appel est stocké** : ce qui est retenu, la source, l'identifiant (ARK,
  volume Google Books), la date de consultation et le statut de l'appel. Pour un livre ambigu, on
  stocke aussi les candidats.
- **Un livre déjà réconcilié ne rappelle aucune source** pour l'historique ou l'affichage. Seul un
  enrichissement incomplet, ou une réconciliation non vérifiée, se rejoue.

## Avec les sources

- **4 requêtes en parallèle au plus vers la BnF**, et un `User-Agent` qui identifie le projet, sans
  donnée personnelle.
- **La clé Google Books est un secret de configuration**, validée au démarrage
  ([`adapters.md`](adapters.md)). Elle n'apparaît jamais dans le dépôt ni dans les logs.
- **Les adapters se testent sur des réponses enregistrées**, BnF comme Google Books, avec leur
  provenance ([`tdd.md`](tdd.md)). Les cas de départ sont listés dans l'ADR 0014.

## Don't

- Confirmer un livre parce que Google Books le trouve alors que la BnF ne le trouve pas.
- Mettre « non trouvé » sur un livre dont l'appel à la BnF a échoué.
- Faire échouer une réconciliation, ou dépasser l'échéance de la spec 002, à cause d'un complément.
- Additionner ou moyenner la confiance du VLM et le score de réconciliation.
