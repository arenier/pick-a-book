Routine d'implémentation sur le dépôt **arenier/pick-a-book**. Tu démarres sans aucun contexte : tout part d'ici. Écris en français dans la PR et les commentaires ; **anglais dans le code**.

Aucun humain ne te relit pendant l'exécution. Tu ne poses donc pas de question : les décisions qui auraient pu bloquer sont tranchées plus bas. Ce qui reste incertain se **signale dans la PR**, jamais ne s'invente.

## Étape 0 — Charger le cadre

Lis, dans cet ordre, avant d'écrire une ligne :

1. `CLAUDE.md` à la racine — conventions, garde-fous, commandes. Il **prime** sur tes habitudes.
2. L'issue **#10** (`arenier/pick-a-book`) — le *quoi* contractuel.
3. **Les deux commentaires de l'issue #10.** Ils ne sont pas décoratifs : le second arrête le fournisseur Qwen (**OpenRouter**, pas DashScope) et resserre le périmètre du bench. Une implémentation qui ignore ces commentaires est fausse.
4. Les ADR cités : `docs/adr/0005` (reconnaissance, port, filet anti-hallucination en aval), `0002` (hexagonal, frontières), `0003` (orchestration), `0007` (Vite/Vitest), `0008` (oxlint/oxfmt).
5. Le code existant du contexte : `libs/recognition/domain/src/lib/` (`shelf-scanner.port.ts`, `detected-book.ts`, `shelf-photo.ts`, `confidence.ts`, `author.ts`, `book-title.ts`), `libs/recognition/application/src/lib/scan-shelf.use-case.ts`, `libs/recognition/infrastructure/src/lib/stub-shelf-scanner.adapter.ts`, `apps/api/src/config/environment.ts`, `apps/api/src/recognition/recognition.module.ts`.

## Périmètre — ce que tu livres cette nuit

Les étapes **1, 2, 3, 4, 5 et 7** du découpage de l'issue #10 :

1. `GeminiShelfScannerAdapter` — client Gemini, prompt, JSON schema natif, mapping vers `DetectedBook`, gestion d'erreur.
2. `QwenShelfScannerAdapter` — client OpenAI-compatible pointé sur OpenRouter, même contrat. L'URL de base et le nom du modèle sont **configurables par variable d'environnement** (le catalogue OpenRouter bouge ; ne fige aucune référence de modèle dans le code).
3. Config d'environnement + sélection du fournisseur (`SHELF_SCANNER_PROVIDER=gemini|qwen|stub`) câblée dans la composition root d'`apps/api`, avec la validation fail-fast existante étendue — une clé requise manquante fait échouer le démarrage en listant ce qui manque.
4. Harnais de réponses enregistrées + fixtures des deux adapters + tests de contrat.
5. Endpoint `POST /scan` (multipart **ou** JSON base64) → `ScanShelfCommand` → use case → JSON, avec mapping des erreurs (400 image invalide, 502/503 échec fournisseur).
6. Doc : `.env.example`, README de `libs/recognition/infrastructure`.

**Le `StubShelfScannerAdapter` reste disponible** via `SHELF_SCANNER_PROVIDER=stub` — ne le supprime pas, c'est le mode « développer sans clé ».

## Hors périmètre — n'y touche pas

- **L'étape 6 (le bench, le tableau de métriques, la note de décision, le défaut posé sur le gagnant).** Les photos de référence ne sont pas dans cet environnement : elles sont gitignorées et vivent sur la machine du mainteneur. Sans elles, ni rappel, ni précision, ni hallucination ne se mesurent. **Ne produis aucun chiffre de qualité, sous aucune forme.** Un tableau de métriques inventé ou extrapolé serait le pire livrable possible de cette nuit : il déciderait du fournisseur de production sur du vide.
- Réconciliation bibliographique, enrichissement, UI d'upload, persistance des scans, auth, rate limiting.
- Le provisioning GCP (issue #12).
- **Ne ferme pas l'issue #10.** Elle reste ouverte pour l'étape 6. Dans la PR, écris `Refs #10`, jamais `Closes #10`.

## Décisions déjà tranchées — applique-les, ne les rouvre pas

| Sujet | Décision | Source |
|---|---|---|
| Fournisseur Qwen | **OpenRouter**, secret `OPENROUTER_API_KEY` | commentaire #2 de l'issue #10 |
| Fournisseur Gemini | `GEMINI_API_KEY` (AI Studio) | issue #10 |
| Candidats | **deux**, pas trois. Claude n'est pas construit en V1 | issue #10 + commentaire #2 |
| Politique d'erreur | **Exceptions** (`ShelfScanFailed`), comme le spécifie le contrat de #10. **N'adopte pas `Result`** | voir ci-dessous |
| Photo soumise | **éphémère** — rien n'est persisté, ne touche ni bucket ni base | issue #10 |
| Branche | `feat/recognition-v1-vlm-adapters`, créée depuis `main` | — |

> **Sur la politique d'erreur.** `libs/shared/result` existe, est testé, et n'a **aucun consommateur** ; l'issue #24 doit trancher entre `Result` aux frontières et exceptions. Elle n'est pas tranchée. Tu appliques les **exceptions** parce que c'est ce que le contrat de #10 spécifie — mais c'est un **défaut faute de décision, pas une décision**. Dis-le explicitement dans le corps de la PR, en renvoyant à #24. N'utilise pas `Result`, et ne supprime pas la lib non plus.

## Méthode — non négociable

**TDD systématique** (`CLAUDE.md`) : le test qui échoue d'abord, puis le code minimal qui le fait passer, puis refactor. Constate réellement le rouge avant d'écrire le code — ne l'écris pas « de mémoire du cycle ». Ça vaut pour chaque adapter, pour la validation d'environnement, et pour l'endpoint.

Commits **petits et en anglais**, un par unité cohérente. Ne fais pas un commit unique de 40 fichiers.

Contraintes de code, toutes vérifiées par le lint — le lint échouera si tu les violes, ne cherche pas à le contourner :

- **Pas de `as`.** `satisfies` pour contraindre un type ; **type guard ou vérification explicite** quand le type n'est pas connu à la compilation — et c'est exactement le cas d'une réponse HTTP de fournisseur. C'est le point où tu seras le plus tenté de tricher : ne le fais pas, la validation de la réponse **est** le travail.
- Pas de `any` implicite. TypeScript strict.
- Pas de primitive nue dans le domaine : passe par `Author`, `BookTitle`, `Confidence`.
- `require-await` est désactivée à dessein : une fonction qui rend une `Promise` porte `async` même sans `await`. Ne « corrige » pas un `async` qui paraît inutile.
- Fichiers en `kebab-case`, use cases en verbe explicite.
- **Anglais** dans le code, les commentaires, les messages d'erreur, les logs et les descriptions de tests (`it('rejects an empty image')`).
- **Tags Nx** (`type:` / `context:recognition` / `scope:api`) sur tout nouveau projet, dans `nx.tags` de son `package.json`. Sans tag, un projet échappe aux frontières.
- Personne ne dépend d'`infrastructure` hors de la composition root d'`apps/api`.

## Les fixtures de réponses — lis ce point en entier

Les tests déterministes rejouent des **réponses enregistrées**, sans réseau ni clé (`CLAUDE.md`, ADR 0005). Se pose la question de savoir d'où viennent ces réponses, puisque tu n'as pas de photo réelle.

Par ordre de préférence :

1. **Capter la forme réelle du payload.** Génère une **image synthétique** de tranches de livres — du texte dessiné sur un fond, orientations mêlées : Chromium est disponible dans l'environnement standard (Playwright, `/opt/pw-browsers`), une page HTML capturée en screenshot suffit. Fais **un** appel réel par fournisseur avec cette image, et enregistre la réponse. La qualité d'OCR obtenue n'a aucune importance — ce qu'on capture, c'est la **forme du payload**, et elle, elle est réelle. C'est le seul moyen d'avoir des fixtures qui ne reposent pas sur une supposition.
2. **À défaut** (réseau sortant bloqué, clé absente, quota) : écris les fixtures d'après le **schéma documenté** de chaque fournisseur — et **signale-le dans la PR comme une limite explicite**, en une phrase qui ne se noie pas : « les fixtures sont construites d'après la documentation, pas enregistrées depuis un appel réel ; les tests valident donc notre mapping contre notre hypothèse de payload, pas contre le format réel ». Cette limite devra être levée quand les photos arriveront.

Ne commite **jamais** d'image de référence réelle. L'image synthétique, elle, peut être commitée (ou son script de génération), puisqu'elle ne montre aucun lieu.

Les cas de contrat à couvrir, au minimum : photo sans livre lisible → **tableau vide, pas une erreur** ; JSON invalide → `ShelfScanFailed` ; champ manquant → `ShelfScanFailed` ; `confidence` hors de `[0,1]` → `ShelfScanFailed` ; fournisseur indisponible → `ShelfScanFailed` ; auteur ou titre vide → rejeté. **Jamais** un `DetectedBook` incohérent qui remonte.

Sur le prompt envoyé au VLM, la consigne de l'issue : ne pas inventer ; laisser un champ incertain plutôt que compléter ; **distinguer auteur et titre de l'éditeur et de la collection** ; renvoyer vide si illisible.

## Avant d'ouvrir la PR — vérifications

Lance les trois, et **pas seulement la première** :

```bash
yarn check          # oxlint --type-aware + lint + test + build
yarn typecheck
yarn format:check
```

`yarn check` ne couvre **ni** `typecheck` **ni** `format:check` (c'est un écart connu entre le script et la CI, suivi par l'issue #25) — la CI, elle, les exige. Les trois doivent être verts. Si l'un échoue, corrige ; ne l'annonce pas vert.

Ne touche pas au `.env` local, ne crée pas de `.env` commité, **n'affiche jamais la valeur d'une variable d'environnement** et ne colle aucune clé dans un fichier, un log, un commit ou le corps de la PR.

## Ouvrir la PR

Utilise le skill **`create-pr`** du dépôt (`.claude/skills/create-pr/SKILL.md`) — il porte le format maison. Le corps doit dire, en français et sans enjoliver :

- ce qui est livré (étapes 1-5 et 7) ;
- **ce qui ne l'est pas et pourquoi** : l'étape 6 attend les photos de référence, donc **aucun fournisseur n'est désigné comme défaut** — dis explicitement quel fournisseur est le défaut provisoire du code et que ce choix n'est **pas** le résultat du bench ;
- les trois points d'attention : la politique d'erreur assumée par défaut faute de #24 ; l'origine des fixtures (réelles ou documentées, selon ce que tu as pu faire) ; le fait que #10 reste ouverte.

`Refs #10`. Ne demande aucune review, ne merge rien, ne pousse sur aucune autre branche.

## Si tu es bloqué

N'invente rien et ne rends pas la main les mains vides. Ouvre la PR avec ce qui **est** fait, et liste en clair ce qui manque et pourquoi. Une PR partielle honnête est utile au réveil ; une PR complète en apparence dont les chiffres sont inventés fait perdre une journée et peut faire prendre une mauvaise décision de fournisseur.
