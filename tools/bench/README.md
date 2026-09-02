# bench — départage des adapters de reconnaissance (#10, étape 6)

Bench **manuel** qui départage les deux adapters `ShelfScannerPort` sur de vraies photos
d'étagère, pour poser le **défaut de prod** (ADR 0005, phase 3 : le bench *est* l'instrumentation
prévue). Il n'est **jamais en CI** — chaque run coûte un appel payant par photo.

Projet Nx dédié, tagué `type:app` / `scope:api` : comme `apps/api`, il a le droit de connaître
`infrastructure`, parce qu'il instancie les adapters réels. La logique pure (normalisation,
matching, métriques) vit soit dans la lib partagée [`shared-text-match`](../../libs/shared/text-match),
réutilisable par la réconciliation, soit dans `src/lib/` (testée en CI, sans réseau). Seul
`src/main.ts` et ses modules de run appellent le réseau.

## Ce que le bench mesure

Pour chaque fournisseur, sur le jeu de référence :

| Métrique | Définition |
|---|---|
| **Rappel** | couples `(auteur, titre)` corrects / livres réellement présents |
| **Précision** | corrects / détectés |
| **Exactitude auteur / titre** | par champ, sur les détections rattachées à un vrai livre |
| **Erreurs de structuration** | auteur/titre permutés — cible ≈ 0 |
| **Hallucination haute confiance** | détections inventées avec `confidence ≥ seuil` (ADR 0005 pt 2) |
| **Coût / scan** | tokens facturés (coût rendu par OpenRouter, sinon estimé au prix du token) |
| **Latence médiane** | temps mur par scan |

Un couple est « correct » si **auteur ET titre** correspondent, à la faute d'OCR près
(`shared-text-match`, seuil 0.85). Une tranche illisible non détectée est un **faux négatif**,
pas une erreur ; une photo sans livre lisible se lit en **tableau vide**.

## Pré-requis

1. **Photos de référence** dans `fixtures/reference-photos/` (gitignoré). Source de vérité : le
   bucket GCS `pick-a-book-505922-reference-photos` (voir le commentaire du 31/08 sur #10). Les
   10 JPEG font ~54 Mo.
2. **Vérité terrain** dans `tools/bench/ground-truth.yaml` — copier
   [`ground-truth.template.yaml`](ground-truth.template.yaml) et la remplir **à la main**. Sans
   elle, le bench tourne quand même mais ne mesure que le contrat, le coût et la latence : ni
   rappel, ni précision, ni hallucination, donc **aucune sélection possible**.

   > La vérité terrain **doit être vérifiée par un humain**. Un brouillon produit par un VLM pour
   > départager deux VLM mesure leur accord, pas leur exactitude. La sortie `output/<provider>.json`
   > d'un premier run fait gagner de la saisie — elle ne dispense pas de la vérification.
3. **Clés** dans l'environnement : `GEMINI_API_KEY` et `OPENROUTER_API_KEY`.
4. **Egress réseau** vers les hôtes des fournisseurs (`generativelanguage.googleapis.com`,
   `openrouter.ai`). Certains environnements restreignent l'egress par politique réseau : un
   fournisseur injoignable fait échouer ses scans en `ShelfScanFailed` (« unreachable » ou
   `403 Host not in allowlist`) — ce n'est pas un bug de l'adapter. Autoriser le domaine côté
   environnement, et voir la note sur `NODE_USE_ENV_PROXY=1` ci-dessous.

## Lancer

```bash
yarn nx build bench                 # bundle le runner + ses dépendances de workspace
node tools/bench/dist/main.js       # appels live, depuis la racine du repo
```

En **environnement proxifié** (egress via un proxy, `HTTPS_PROXY` posé), le `fetch` de Node ne lit
pas `HTTPS_PROXY` par défaut : préfixer par `NODE_USE_ENV_PROXY=1` (Node ≥ 22.21), sinon les appels
échouent en `403 Host not in allowlist` ou en « unreachable » quand bien même le domaine est autorisé.

Sortie dans `tools/bench/output/` (gitignoré, dérivé des photos privées) :
`report.md` (le tableau) et `<provider>.json` (les détections brutes, par photo).

## Configuration (variables d'environnement)

| Variable | Défaut | Rôle |
|---|---|---|
| `BENCH_PROVIDERS` | `gemini,qwen` | fournisseurs à départager |
| `GEMINI_MODEL` / `QWEN_MODEL` | modèles de prod | épingler un modèle précis pour ce run |
| `QWEN_BASE_URL` | OpenRouter | pointer un endpoint OpenAI-compatible (ex. Ollama local pour **itérer le prompt** — jamais pour produire les chiffres, cf. #10) |
| `BENCH_HIGH_CONFIDENCE` | `0.8` | seuil de l'hallucination « haute confiance » |
| `BENCH_PHOTOS_DIR` | `fixtures/reference-photos` | dossier des photos |
| `BENCH_GROUND_TRUTH` | `tools/bench/ground-truth.yaml` | vérité terrain |
| `BENCH_OUTPUT_DIR` | `tools/bench/output` | sortie |

## Après le run

Consigner le tableau et le fournisseur gagnant dans
[`docs/decisions/0001-fournisseur-vlm-par-defaut.md`](../../docs/decisions/0001-fournisseur-vlm-par-defaut.md),
puis **poser le gagnant comme défaut** de `SHELF_SCANNER_PROVIDER`. Ce n'est pas un ADR : la
sélection de fournisseur est un niveau inférieur, tranché par l'ADR 0005.
