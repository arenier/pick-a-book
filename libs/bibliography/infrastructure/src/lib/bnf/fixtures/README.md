# Réponses enregistrées de la BnF

Réponses réelles de l'API SRU du catalogue général de la BnF (`https://catalogue.bnf.fr/api/SRU`),
enregistrées **le 25/10/2026** par un appel `GET` chacune, avec le `User-Agent`
`pick-a-book (+https://github.com/arenier/pick-a-book)`. Les URL sont celles que construit
`searchUrl` / `authorityUrl` (`../sru-url.ts`) : une requête construite autrement ne rejouerait pas
ce qui a été enregistré. Aucun appel réel en CI (`.claude/rules/adapters.md`) : les specs rejouent
ces fichiers par un `fetch` injecté.

Rien n'a été retouché à la main : un fichier est la réponse telle que reçue. Ce que cela prouve :
la forme réelle des notices UNIMARC et Dublin Core de la BnF et le comportement de ses index à
cette date. Ce que cela ne prouve pas : que la BnF répondra encore de même (le catalogue évolue,
les nombres de résultats aussi) ni la qualité de l'appariement sur des photos réelles (c'est le
rôle du bench, `tools/bench`).

Les cas sont ceux de l'[ADR 0014](../../../../../../../docs/adr/0014-referentiel-bibliographique-bnf.md).

| Fichier | Requête (titre / auteur / notices / format) | Cas |
|---|---|---|
| `percy-title-whole.xml` | « Percy Jackson La Mer des Monstres » / — / 20 / UNIMARC | « Percy Jackson - La Mer des Monstres », lecture entière |
| `percy-title-segment.xml` | « La Mer des Monstres » / — / 20 / UNIMARC | le même, par son segment : la série est dans la notice |
| `lunes-17-title-and-author.xml` | « 17 lunes » / « Kami Garcia » / 20 / UNIMARC | « 17 lunes » |
| `lunes-18-title-and-author.xml` | « 18 lunes » / « Kami Garcia » / 20 / UNIMARC | « 18 lunes », jamais confondu avec le précédent |
| `eternels-title-and-author.xml` | « Éternels » / « Alyson Noël » / 20 / UNIMARC | « Éternels (tome 3) » : la série et ses tomes |
| `yacoubian-title-and-author.xml` | « L'Immeuble Yacoubian » / « Alaa El Aswany » / 20 / UNIMARC | auteur translittéré : la forme rejetée de l'autorité |
| `authority-aswani.xml` | autorité n° 14623756 | la notice d'autorité de cet auteur et ses formes rejetées |
| `authority-camus.xml` | autorité n° 11894985 | une autorité sans forme rejetée |
| `pavots-title-and-author.xml` | « Le Mystère des pavots blancs » / « Nancy Springer » / 20 / UNIMARC | le roman et son adaptation en bande dessinée |
| `oeil-du-loup-title-and-author.xml` | « L'Oeil du loup » / « D. Pennac » / 20 / UNIMARC | « D. Pennac - J. Ferrandez » : un illustrateur dans les auteurs |
| `exercices-title-and-author.xml` | « Exercices de style » / « Raymond Queneau » / 20 / UNIMARC | plusieurs éditions d'une même œuvre |
| `exercices-faute-title-and-author.xml` | « Exercices de stile » / « Raymond Queneau » / 20 / UNIMARC | un titre fauté |
| `queneau-author-only.xml` | — / « Raymond Queneau » / 100 / Dublin Core | l'étape « auteur seul » |
| `peste-hugo-title-and-author.xml` | « La Peste » / « Victor Hugo » / 20 / UNIMARC | un témoin permuté : le titre de Camus, l'auteur de Hugo |
| `hugo-author-only.xml` | — / « Victor Hugo » / 100 / Dublin Core | idem, étape « auteur seul » |
| `peste-title-only.xml` | « La Peste » / — / 20 / UNIMARC | idem, étape « titre seul » |
| `fabricated-title-and-author.xml` | « Les Ombres du lac de verre » / « Margaux Delcourt » / 20 / UNIMARC | un témoin fabriqué : rien ne correspond |
| `delcourt-author-only.xml` | — / « Margaux Delcourt » / 100 / Dublin Core | idem, étape « auteur seul » |
| `fabricated-title-only.xml` | « Les Ombres du lac de verre » / — / 20 / UNIMARC | idem, étape « titre seul » |

## URL exactes

- `percy-title-whole.xml` — `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=bib.doctype+any+%22a%22+and+bib.title+all+%22Percy+Jackson+La+Mer+des+Monstres%22&maximumRecords=20&recordSchema=unimarcXchange`
- `percy-title-segment.xml` — `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=bib.doctype+any+%22a%22+and+bib.title+all+%22La+Mer+des+Monstres%22&maximumRecords=20&recordSchema=unimarcXchange`
- `lunes-17-title-and-author.xml` — `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=bib.doctype+any+%22a%22+and+bib.title+all+%2217+lunes%22+and+bib.author+all+%22Kami+Garcia%22&maximumRecords=20&recordSchema=unimarcXchange`
- `lunes-18-title-and-author.xml` — `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=bib.doctype+any+%22a%22+and+bib.title+all+%2218+lunes%22+and+bib.author+all+%22Kami+Garcia%22&maximumRecords=20&recordSchema=unimarcXchange`
- `eternels-title-and-author.xml` — `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=bib.doctype+any+%22a%22+and+bib.title+all+%22%C3%89ternels%22+and+bib.author+all+%22Alyson+No%C3%ABl%22&maximumRecords=20&recordSchema=unimarcXchange`
- `yacoubian-title-and-author.xml` — `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=bib.doctype+any+%22a%22+and+bib.title+all+%22L%27Immeuble+Yacoubian%22+and+bib.author+all+%22Alaa+El+Aswany%22&maximumRecords=20&recordSchema=unimarcXchange`
- `pavots-title-and-author.xml` — `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=bib.doctype+any+%22a%22+and+bib.title+all+%22Le+Myst%C3%A8re+des+pavots+blancs%22+and+bib.author+all+%22Nancy+Springer%22&maximumRecords=20&recordSchema=unimarcXchange`
- `oeil-du-loup-title-and-author.xml` — `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=bib.doctype+any+%22a%22+and+bib.title+all+%22L%27Oeil+du+loup%22+and+bib.author+all+%22Pennac%22&maximumRecords=20&recordSchema=unimarcXchange`
- `exercices-title-and-author.xml` — `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=bib.doctype+any+%22a%22+and+bib.title+all+%22Exercices+de+style%22+and+bib.author+all+%22Raymond+Queneau%22&maximumRecords=20&recordSchema=unimarcXchange`
- `exercices-faute-title-and-author.xml` — `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=bib.doctype+any+%22a%22+and+bib.title+all+%22Exercices+de+stile%22+and+bib.author+all+%22Raymond+Queneau%22&maximumRecords=20&recordSchema=unimarcXchange`
- `queneau-author-only.xml` — `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=bib.doctype+any+%22a%22+and+bib.author+all+%22Raymond+Queneau%22&maximumRecords=100&recordSchema=dublincore`
- `peste-hugo-title-and-author.xml` — `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=bib.doctype+any+%22a%22+and+bib.title+all+%22La+Peste%22+and+bib.author+all+%22Victor+Hugo%22&maximumRecords=20&recordSchema=unimarcXchange`
- `hugo-author-only.xml` — `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=bib.doctype+any+%22a%22+and+bib.author+all+%22Victor+Hugo%22&maximumRecords=100&recordSchema=dublincore`
- `peste-title-only.xml` — `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=bib.doctype+any+%22a%22+and+bib.title+all+%22La+Peste%22&maximumRecords=20&recordSchema=unimarcXchange`
- `fabricated-title-and-author.xml` — `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=bib.doctype+any+%22a%22+and+bib.title+all+%22Les+Ombres+du+lac+de+verre%22+and+bib.author+all+%22Margaux+Delcourt%22&maximumRecords=20&recordSchema=unimarcXchange`
- `delcourt-author-only.xml` — `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=bib.doctype+any+%22a%22+and+bib.author+all+%22Margaux+Delcourt%22&maximumRecords=100&recordSchema=dublincore`
- `fabricated-title-only.xml` — `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=bib.doctype+any+%22a%22+and+bib.title+all+%22Les+Ombres+du+lac+de+verre%22&maximumRecords=20&recordSchema=unimarcXchange`
- `authority-aswani.xml` — `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=aut.recordid+any+%2214623756%22&maximumRecords=1&recordSchema=unimarcxchange-anl`
- `authority-camus.xml` — `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=aut.recordid+any+%2211894985%22&maximumRecords=1&recordSchema=unimarcxchange-anl`
