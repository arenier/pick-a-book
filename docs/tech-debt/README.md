# Dette technique

Les défauts **connus et acceptés** : fondés, mesurés, mais volontairement laissés hors d'une PR.
Une fiche par sujet, avec de quoi la reprendre sans relire la PR qui l'a ouverte.

| Objet | Où | Répond à |
|---|---|---|
| **Dette technique** | `docs/tech-debt/` | *Qu'est-ce qu'on sait qui cloche, et pourquoi on ne l'a pas réglé ?* Disparaît quand elle est payée. |
| **ADR** | `docs/adr/` | *Pourquoi* une décision transverse. Une dette qui exige une décision de ce niveau le dit, et ouvre un ADR. |

Une fiche dit : **le constat** (ce qui cloche, observé), **pourquoi on a reporté**, **ce qu'il
faudrait faire**, et **à quel signal la reprendre**. Une fiche se supprime dans la PR qui règle la
dette, jamais avant.

| Fiche | Sujet |
|---|---|
| [`analyses-sans-delai.md`](analyses-sans-delai.md) | L'appel au scanner n'a pas de délai propre, et une base qui rejette `markCompleted` verrouille l'envoi |
| [`photo-orpheline-apres-vignette.md`](photo-orpheline-apres-vignette.md) | Un bucket qui refuse la vignette laisse la photo sans ligne en base |
| [`plafond-envois-en-attente.md`](plafond-envois-en-attente.md) | Seules les analyses sont plafonnées, pas les envois |
| [`verifications-hors-ci.md`](verifications-hors-ci.md) | T076 (iPhone) et `X-Forwarded-For` sur une révision déployée |
