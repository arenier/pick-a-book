---
paths:
  - "docs/adr/**"
  - "docs/decisions/**"
  - ".claude/rules/**"
  - "CLAUDE.md"
  - ".specify/memory/constitution.md"
---

# Écrire un ADR, et le relier aux rules

- **La procédure est dans [`docs/adr/README.md`](../../docs/adr/README.md)** : la lire avant d'écrire
  ou de modifier un ADR (numérotation, conditions de bascule, étude dans l'issue, index).
- **Un ADR accepté ne se réécrit pas et ne se supprime pas.** Pour changer d'avis, on en écrit un
  nouveau, et l'ancien passe en « Remplacé par [NNNN] ».
- **Un ADR dit pourquoi, une rule dit quoi faire.** Quand un ADR acte une règle d'exécution, la
  même PR crée ou met à jour la rule correspondante dans `.claude/rules/`, et l'ajoute à l'index de
  `CLAUDE.md`.
- **Une rule ne recopie pas l'ADR** : elle donne l'impératif et renvoie à l'ADR par un lien.
- **Ce que l'outillage peut vérifier, il le vérifie** (lint, CI). La rule se contente alors de le
  signaler, avec le moyen de constater que le garde-fou est opérant.
- La constitution (`.specify/memory/constitution.md`) reflète ces principes. Elle se met à jour
  avec `/speckit-constitution`, jamais à la main.
