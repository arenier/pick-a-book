# Contrat consommé : `POST /scan`

Cet endpoint existe déjà (`apps/api/src/recognition/scan.controller.ts`) — cette feature ne le
crée pas, elle en devient le premier appelant HTTP réel (jusqu'ici non consommé que par des tests).
Documenté ici du point de vue du frontend, pour fixer ce que `apps/web` doit envoyer et attendre.

## Requête

```
POST {VITE_API_BASE_URL}/scan
Content-Type: multipart/form-data

photo: <fichier image>
```

- Champ `photo`, un seul fichier (le port de reconnaissance ne traite qu'une image à la fois).
- Type MIME et poids validés côté client avant envoi (voir `data-model.md#SelectedPhoto`), puis
  revalidés côté serveur (`ShelfPhoto`, réponse 400 sinon) — le client ne fait pas confiance à sa
  propre validation pour la sécurité, seulement pour l'ergonomie (retour immédiat, FR-003).

## Réponses

### 200 — analyse effectuée (avec ou sans livre)

```json
{
  "books": [
    { "author": "Albert Camus", "title": "La Peste", "confidence": 0.92 },
    { "title": "Les Choses", "confidence": 0.71 }
  ]
}
```

- `books` peut être un tableau vide : c'est le cas « aucun livre détecté » (US1, scénario 3), pas
  une erreur.
- `author` absent (pas de clé, pas de chaîne vide) quand la tranche ne portait pas d'auteur
  lisible.

### 400 — requête refusée

Corps : `{ "message": string, "statusCode": 400 }` (format par défaut de Nest). Causes possibles
détectées par le serveur : fichier absent, vide, type MIME non supporté, poids supérieur à 20 Mo.
Une partie de ces cas est déjà interceptée côté client avant l'envoi (FR-003, FR-009) ; ce statut
reste le filet de sécurité serveur, et le message affiché à l'utilisateur ne dépend pas du texte
technique renvoyé (FR-009 : « message compréhensible sans jargon technique »).

### 502 — échec en amont

Corps : `{ "message": string, "statusCode": 502 }`. Le service de reconnaissance (VLM) est en
panne ou hors contrat (`ShelfScanFailed`). Distinct du 400 : ce n'est pas la photo qui est en
cause (FR-006, US2 scénario 3).

### Échec réseau (pas de réponse HTTP)

Pas de statut — `fetch` rejette (délai, coupure). Traité par la feature comme un cas d'erreur
distinct des deux précédents, avec son propre message (Edge case de `spec.md` : coupure réseau).

## Ce que le frontend n'utilise pas

- Le repli JSON base64 du contrôleur (`{"image": "<base64>", "mediaType": ...}`) — prévu pour
  d'autres appelants, pas pour cette UI (research.md §3).
- Le champ `confidence` n'est pas affiché (voir `data-model.md#DetectedBook`), seulement transporté.
