# Réponses enregistrées

Fixtures rejouées par les tests des adapters. Le transport est stubbé : aucun appel réseau,
aucune clé, aucun coût, quel que soit le nombre de runs (ADR 0005). Aucune vraie image n'est
nécessaire non plus — `ShelfPhoto` se construit avec quelques octets valides.

## Provenance — à lire avant de s'y fier

| Fichier | Origine | Fiabilité |
|---|---|---|
| `gemini-shelf-scan.json` | **Appel réel**, capturé une fois le 2026-08-31 sur `gemini-3.6-flash`, photo de référence `20260801_114252.jpg` | Authentique : l'enveloppe est exactement celle que renvoie l'API |
| `qwen-shelf-scan.json` | **Écrite à la main**, d'après la forme documentée de l'API chat-completions OpenAI | ⚠️ Non authentique — voir ci-dessous |

## Pourquoi la fixture Qwen n'est pas un enregistrement

`openrouter.ai` n'est pas joignable depuis l'environnement où ces adapters ont été écrits :
le proxy sortant refuse la connexion (HTTP 000 ; `generativelanguage.googleapis.com`, lui,
répond). La fixture reproduit donc la forme documentée de l'enveloppe, pas une réponse
observée.

Ce que cela coûte : les tests de contrat de `QwenShelfScannerAdapter` prouvent que l'adapter
traite correctement l'enveloppe **telle que nous la supposons**. Si OpenRouter s'en écarte —
un champ absent, un `content` structuré autrement — les tests resteront verts et l'adapter
échouera en vrai. C'est précisément ce que l'enregistrement d'une réponse réelle sert à
éliminer, et c'est la garantie qui manque ici.

**À faire dès qu'`openrouter.ai` est accessible** : rejouer un appel réel, remplacer ce
fichier par la réponse obtenue, et réaligner les assertions de
`qwen-shelf-scanner.adapter.spec.ts` sur son contenu — comme cela a été fait côté Gemini,
où l'enregistrement a d'ailleurs révélé que `gemini-2.5-flash` était retiré au profit de
`gemini-3.6-flash`.
