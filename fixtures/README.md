# Jeu de référence du bench de reconnaissance

Ce dossier accueille le jeu de référence qui **départage les deux fournisseurs VLM** de la V1
reconnaissance ([#10](https://github.com/arenier/pick-a-book/issues/10)) : Gemini 2.5 Flash et
Qwen3-VL via OpenRouter. Sans lui, seul le contrat des adapters est testable — ni rappel, ni
précision, ni hallucination ne se mesurent, donc aucune sélection de fournisseur n'est possible.

Deux moitiés, deux régimes :

| Dossier | Commité ? | Contenu |
|---|---|---|
| `reference-photos/` | **non** — gitignoré | les photos d'étagère |
| `ground-truth/` | **oui** | la vérité terrain, en YAML, un fichier par photo |

Les photos ne sont jamais commitées (poids, et contexte ressourcerie). La vérité terrain est du
texte : elle vit dans le dépôt, se relit et se corrige en PR.

## Déposer les photos

```bash
mkdir -p fixtures/reference-photos
cp /chemin/vers/tes/photos/*.jpg fixtures/reference-photos/
```

**Garde la copie de référence hors du dépôt.** Le travail se fait en worktrees dédiés
([règle](../.claude/rules/always-work-in-a-worktree.md)) et `wt remove` supprime le worktree : des
photos déposées là disparaissent avec lui. Or elles ne se reproduisent pas sans retourner à la
ressourcerie. Garde-les dans un dossier stable de ta machine, et fais pointer le worktree dessus :

```bash
ln -s ~/chemin/stable/reference-photos fixtures/reference-photos
```

## Ce qui fait une bonne photo de référence

Le bench mesure ce que le VLM sait lire dans les conditions réelles d'usage. Une photo soignée
flatterait les deux fournisseurs à égalité et ne les départagerait pas.

- **Prise comme en usage réel** — au téléphone, à main levée, dans la lumière du lieu.
- **Tranches majoritairement, orientations mêlées** — titres montants et descendants dans la même
  image : c'est le régime où l'OCR se distingue.
- **L'étagère entière dans le cadre** — le rappel se calcule sur les livres *réellement présents*,
  la vérité terrain doit donc être exhaustive sur ce qu'on voit.
- **1 ou 2 cas durs** (reflet, tranche usée, livre à moitié masqué), marqués `legible: false` : la
  cible de ~70 % ne porte que sur les tranches lisibles.
- **5 à 10 photos** suffisent.

## Saisir la vérité terrain

Copier `ground-truth/shelf-01.example.yaml`, un fichier par photo, nommé comme elle
(`shelf-01.jpg` → `shelf-01.yaml`). C'est le poste le plus fastidieux du bench, et le seul qui ne
s'automatise pas : c'est lui qui définit la bonne réponse.

## Où tourne le bench

Les appels sont **live** et **manuels** — jamais en CI (ADR 0005, et `CLAUDE.md` : la non-régression
sur photos réelles est un test séparé et manuel). Les tests déterministes, eux, rejouent des
réponses enregistrées et n'ont besoin d'aucune photo.

Comme les photos ne sont pas dans le dépôt, une session distante ne les voit pas : le bench tourne
sur la machine qui les héberge, ou il faut leur donner un chemin (le bucket, ce qui rouvre une
dépendance vers [#12](https://github.com/arenier/pick-a-book/issues/12)).
