# Audit qualité et exhaustivité du pipeline de collecte — Rapport

**Date :** 2026-09-01
**Spec :** docs/superpowers/specs/2026-09-01-pipeline-quality-audit-design.md
**Méthode :** trace de bout en bout avec vérité terrain indépendante (voir spec §2)

## Sommaire exécutif
_(rempli par la tâche de synthèse — ne pas éditer avant)_

## Burkina Faso

**Run snapshot (BF) :** harvest run `785adda4-f28c-4f3c-af0a-74b7e775d0b5` (déclenché 2026-09-01 21:20:45 UTC, échoué 21:24:40 UTC), pas de run de delivery (le harvest a échoué avant que la livraison ne soit déclenchée). Logs de nœuds capturés dans `bf-nodes/` (scratchpad de session). Critères de pertinence utilisés : voir Contraintes globales du plan.

**⚠️ AVERTISSEMENT CRITIQUE pour les tâches 2-6 :** la table `notices` est actuellement **vide (0 lignes, toutes sources, tous pays confondus)**. Ce n'est ni une "vérité terrain fraîche" ni une "vérité terrain ancienne mais valable" — il n'y a **aucune** vérité terrain en base actuellement. Toute requête SQL des tâches 2-6 (leur Step 3) contre `notices`/`company_notice_status` renverra 0 ligne pour n'importe quelle `source_id`, y compris 8-12. Ne pas interpréter un résultat vide comme "le pipeline n'a rien trouvé" — voir Finding #2 ci-dessous pour la cause. Les logs de nœuds de fetch/parse (étages en amont de `persist_notices`, capturés dans `bf-nodes/nodes/`) restent une preuve valable et fraîche du jour même, puisque `persist_notices` est le dernier nœud du graphe harvest et s'exécute après eux.

### Finding #1 — `DatetimeFieldOverflow` bloque la persistance de tout le run BF (sévérité : critique)

**Erreur exacte (reproduite 2 fois pendant cet audit, identique à 2 occurrences de production antérieures — voir Finding #3) :**
```
(psycopg2.errors.DatetimeFieldOverflow) date/time field value out of range: "29-09-2026"
LINE 1: ...P-2026-9205898', 'UNICEF', 'Autre', '01-09-2026', '29-09-202...
HINT:  Perhaps you need a different "datestyle" setting.
```
Notice en cause : UNGM notice `LRFP-2026-9205898` ("UNICEF China Tender LRFP-2026-9205898 LTA Contract for Vision Aids"), champ `deadline_at` = `"29-09-2026"`. `29` ne peut être un mois valide dans aucun ordre — le format `DD-MM-YYYY` est correct sémantiquement, mais la session Postgres (`datestyle`) l'interprète visiblement comme `MM-DD-YYYY` (ou une autre convention), et `29` déborde le champ mois/jour selon l'interprétation active. Root cause précise (quel composant fixe le `datestyle`, pourquoi ce format n'est pas normalisé avant d'atteindre l'INSERT) non investiguée ici — hors périmètre de la Tâche 1, à approfondir par la Tâche 4 (UNGM) ou en phase 2 fix.

**Analyse du code (`src/tenderai/agents/nodes/persist_notices.py`, tenderai-backend) :** une seule session `with get_db_context() as db:` couvre **tous** les items de **toutes** les sources du run — la boucle appelle `db.add(notice)` pour chaque item mais **aucun `db.commit()` n'a lieu à l'intérieur de la boucle** ; un unique `db.commit()` est exécuté une fois la boucle terminée (ligne 98). Il s'agit donc structurellement d'une transaction unique, tout-ou-rien, pour l'ensemble du run — pas de commit par item ni par source.

**Preuve empirique directe (capture du run re-déclenché) :** le SQL qui échoue est un **unique** `INSERT INTO notices (...) VALUES (...), (...), ... RETURNING ...` regroupant 24 lignes en paramètres `__0` à `__23` dans une seule requête (confirmant que SQLAlchemy a bufferisé tous les `db.add()` en un seul flush/INSERT multi-lignes, cohérent avec l'analyse du code). Répartition observée des 24 lignes par `source_id` dans ce batch (via `deduplicate.json` du même run, qui liste les 24 items uniques envoyés à `persist_notices`) : **UNGM (source_id 10) : 14 items**, **UEMOA (source_id 11) : 8 items**, **Joffres.net (source_id 9) : 1 item**, **Enabel (source_id 12) : 1 item**. DGCMEF (source_id 8) a contribué 0 item unique ce run (extraction RAG en cours au moment du crash — voir Tâche 2, hors périmètre ici). Un seul champ malformé venant d'UNGM a donc fait échouer l'INSERT complet et avec lui la persistance de **toutes** les notices UEMOA, Joffres.net et Enabel de ce run — confirmant sans ambiguïté que le rayon d'impact est le run entier, pas la seule source fautive.

**Conséquence directe :** aucune notice BF (toutes sources confondues) n'a été persistée aujourd'hui, ni lors du run planifié 07:00 ni lors des deux tentatives de cet audit. Aucun run de delivery ne s'est déclenché derrière (le CLI `run-once` enchaîne harvest puis delivery ; le harvest ayant `status=failed`, aucune ligne `runs` de type `delivery` n'a été créée pour cette fenêtre).

### Finding #2 — anomalie distincte : les runs "completed" historiques rapportent aussi `unique_items: 0`

En creusant l'historique des runs BF (Finding #3 ci-dessous) pour dater l'apparition du bug, une anomalie séparée est apparue : **tous** les runs harvest BF `completed`/`completed_with_warnings` de l'échantillon (08-08 au 08-27, 10 runs vérifiés) rapportent `"unique_items": 0` et `"relevant_items": 0` dans `counts_json`, malgré `"items_parsed"` entre 26 et 29 à chaque fois. Or le run re-déclenché aujourd'hui (qui, lui, a crashé) a produit un `deduplicate.json` tout à fait normal : 24 items, tous `is_duplicate: false` — le code de `deduplicate_node` (lu en intégralité) ne peut structurellement pas renvoyer 0 item unique si `items_parsed` > 0 (le premier item d'une boucle ne peut jamais être marqué doublon, la liste `unique_items` étant vide au départ). Cette contradiction n'a **pas** été résolue dans le cadre de cette tâche — cause possible à explorer : une divergence entre le compteur de stats `items_parsed` (dans `counts_json`) et l'attribut réel `state.items_parsed` consommé par `deduplicate_node` (le nœud sort tôt avec `unique_items=[]` si `state.items_parsed` est falsy, ligne 127-129 de `deduplicate.py`), ce qui pointerait vers un bug amont (parse_extract) plutôt que dans `deduplicate.py` lui-même. **Signalé pour la synthèse / les tâches 2-6, non résolu ici** — il explique en partie pourquoi la table `notices` est vide même sur des jours sans crash de persist.

### Finding #3 — récurrence historique (table `runs`, 20 dernières lignes BF)

| Run (started_at) | run_type | status | Erreur |
|---|---|---|---|
| 2026-09-01 21:20:45 (ce re-run) | harvest | failed | `DatetimeFieldOverflow: "29-09-2026"` (UNICEF LRFP-2026-9205898) |
| 2026-09-01 21:12:08 (1er essai audit, avant fix du dossier de logs) | harvest | failed | `DatetimeFieldOverflow: "29-09-2026"` (même notice UNICEF) |
| 2026-09-01 07:00:03 (run planifié quotidien) | harvest | failed | `DatetimeFieldOverflow: "29-09-2026"` (même notice UNICEF) |
| 2026-08-29 07:00:02 | harvest | failed | `DatetimeFieldOverflow: "28-08-2026"` (ILO rfx_10044_HQ, notice différente) |
| 2026-08-27, 08-26, 08-25 | harvest | completed | — (mais `unique_items: 0`, voir Finding #2) |
| 2026-08-22 | harvest | completed_with_warnings | SMTP delivery failure (indépendant) |
| 2026-08-21, 08-19, 08-18 | harvest | completed | — (`unique_items: 0`) |
| 2026-08-20 | harvest | failed | `'content'` (KeyError probable, bug distinct, non investigué) |
| 2026-08-15, 08-13, 08-12 | harvest | completed_with_warnings | Joffres.net 502 / timeout (indépendant) |
| 2026-08-14 | harvest | completed | — (`unique_items: 0`) |
| 2026-08-11 | harvest | failed | `'content'` (même bug distinct que 08-20) |
| 2026-08-08 | harvest | completed | — (`unique_items: 0`) |

**Requête SQL utilisée (ré-exécutée le 2026-09-01 pour cette correction, contre `staging_postgres`) :**
```bash
ssh -i ~/.ssh/id_ed25519 tender-ai@195.35.48.198 \
  "docker exec staging_postgres psql -U tenderai -d tenderai_bf -c \
  \"SELECT id, run_type, status, started_at, left(error_message, 180) AS error_excerpt \
     FROM runs WHERE country_id=(SELECT id FROM countries WHERE code='BF') \
     ORDER BY started_at DESC LIMIT 20;\""
```
(Pas de filtre sur `run_type` : les 2 lignes `delivery` `completed` du 09-01 07:00:06 et du 08-29 07:00:04 occupent 2 des 20 lignes retournées, ce qui explique que la fenêtre des 18 runs `harvest` couverts par la table ci-dessus s'arrête pile au 2026-08-08.)

**Sortie brute (extraits, par classe d'erreur — colonnes `id | run_type | status | started_at | error_excerpt`) :**
```
785adda4-f28c-4f3c-af0a-74b7e775d0b5 | harvest | failed | 2026-09-01 21:20:45.340424 |
  (psycopg2.errors.DatetimeFieldOverflow) date/time field value out of range: "29-09-2026"
  LINE 1: ...P-2026-9205898', 'UNICEF', 'Autre', '01-09-2026', '29-09-202...

976dea9a-3da9-442a-a493-d40d43d78a07 | harvest | failed | 2026-09-01 21:12:08.366465 |
  (psycopg2.errors.DatetimeFieldOverflow) date/time field value out of range: "29-09-2026"
  LINE 1: ...P-2026-9205898', 'UNICEF', 'Autre', '01-09-2026', '29-09-202...

bff78c36-0135-451f-af4c-8cf296d053e1 | harvest | failed | 2026-09-01 07:00:03.290028 |
  (psycopg2.errors.DatetimeFieldOverflow) date/time field value out of range: "29-09-2026"
  LINE 1: ...P-2026-9205898', 'UNICEF', 'Autre', '01-09-2026', '29-09-202...

277b697c-3297-419d-a1b2-294e8bccdde1 | harvest | failed | 2026-08-29 07:00:02.744472 |
  (psycopg2.errors.DatetimeFieldOverflow) date/time field value out of range: "28-08-2026"
  LINE 1: ...Branch (SECTOR)', 'rfx_10044_HQ', 'ILO', 'Autre', '28-08-202...

b879a23c-f3e2-4a6f-8d3b-4832ab3c61ae | harvest | completed_with_warnings | 2026-08-22 07:00:00.440185 |
  Email delivery failed but report is available on MinIO: send_report_email returned False (SMTP rejected delivery)

88f18ab1-21bf-4b1a-8014-7792382118e4 | harvest | failed | 2026-08-20 07:00:00.469763 | 'content'
e6f3d8cb-8550-4901-86b9-445fbc3dcde6 | harvest | failed | 2026-08-11 07:00:00.655798 | 'content'

656a10ea-96bd-4b1c-98ea-6a80d0f39632 | harvest | completed_with_warnings | 2026-08-15 07:00:00.392437 |
  Failed to fetch Joffres.net - Page de Recherche: HTTP 502: Bad Gateway
102bc3dc-ec22-4502-8405-072be46e6bd1 | harvest | completed_with_warnings | 2026-08-13 07:00:00.303762 |
  Failed to fetch Joffres.net - Page de Recherche: Request timeout
bf38ab5d-1b61-45d4-820e-dc77baae1375 | harvest | completed_with_warnings | 2026-08-12 07:00:00.829867 |
  Failed to fetch Joffres.net - Page de Recherche: Request timeout
```
Les runs `completed` restants de la fenêtre (08-27, 08-26, 08-25, 08-21, 08-19, 08-18, 08-14, 08-08) retournent `error_excerpt` NULL/vide — cohérent avec un `status=completed` sans erreur enregistrée ; leur anomalie `unique_items: 0` (Finding #2) n'apparaît pas dans cette colonne et provient de `counts_json`, vérifié séparément par run via `SELECT counts_json FROM runs WHERE id='<run_id>';` pour chacun des 10 runs `completed`/`completed_with_warnings` cités.

**Conclusion sur la récurrence :** le `DatetimeFieldOverflow` n'est pas un incident isolé provoqué par l'audit — il a fait échouer le run planifié quotidien de production **ce matin même** (07:00, avant toute action de cet audit), et avait déjà fait échouer le run du 2026-08-29 avec une notice/date différente (donc pas spécifique à une seule notice UNGM buggée — c'est une classe de bug qui se reproduira à chaque nouvelle notice UNGM dont la date déborde). Combiné au Finding #2, la persistance BF est effectivement cassée en production depuis au moins le 2026-08-08 (début de la fenêtre observée) : soit par crash direct (4 runs sur 20), soit par `unique_items: 0` sur les runs "réussis" (cause distincte, non résolue). Le mail de livraison quotidien continue d'être envoyé (`emails_sent: 1` ou plus sur les runs completed) mais avec un rapport vide de nouvelles notices, sans qu'aucune alerte ne signale que la collecte réelle est à l'arrêt.

### Fix appliqué avant re-déclenchement (action infra, hors périmètre "no fixes")

```
docker exec -u root staging_api mkdir -p /app/logs/nodes
docker exec -u root staging_api chown -R tenderai:tenderai /app/logs/nodes
```
`/app/logs/nodes` n'existait pas dans le conteneur `staging_api` (appartenait à `root:root`, le conteneur tourne en `uid 999`/`tenderai`), ce qui faisait échouer silencieusement tous les appels `log_node_output()`. Corrigé — confirmé fonctionnel : le re-run a produit tous les fichiers JSON de nœuds attendus dans `bf-nodes/nodes/` (`load_sources.json`, `fetch_listings.json`, `extract_item_links.json`, `fetch_items.json`, `parse_extract.json`, `deduplicate.json`, `persist_notices.json`).

Le `DatetimeFieldOverflow` lui-même n'a **pas** été corrigé, contourné, ni la notice UNGM en cause écartée — conformément à la consigne, il a été laissé se reproduire pour capturer cette preuve.

### DGCMEF (source id 8, parser_type pdf_rag)

**Particularité structurelle de cette source :** `https://www.dgcmef.gov.bf/fr/appels-d-offre` ne liste pas des avis individuels — c'est une liste de bulletins PDF quotidiens (« Quotidien »), chacun regroupant plusieurs dizaines d'avis (nouveaux appels d'offres + résultats provisoires). Le `parser_type` `pdf_rag` est conçu pour cela : télécharger le PDF du jour puis en extraire les avis individuels par LLM. La « vérité terrain » pertinente n'est donc pas la page de listing elle-même mais le contenu du PDF du jour.

**Vérité terrain (navigateur Chrome, 2026-09-01 ~21:40 UTC) :**

Page `/fr/appels-d-offre` — 10 bulletins listés, le plus récent étant celui du jour même :
| Titre | Fichier | Taille |
|---|---|---|
| Quotidien n°4478 - Mardi 01 septembre 2026 | Quotidien N°4478.pdf | 1.68 Mo |
| Quotidien n°4477 - Lundi 31 août 2026 | Quotidien N°4477.pdf | 2.2 Mo |
| Quotidien n°4476 - Vendredi 28 août 2026 | Quotidien N°4476.pdf | 4.05 Mo |
| Quotidien n°4475 - Jeudi 27 août 2026 | Quotidien N°4475.pdf | 2.16 Mo |
| Quotidien n°4473-4474 - Mar 25 & Mer 26 août 2026 | Quotidien n°4473-4474.pdf | 3.56 Mo |
| … (5 autres, jusqu'au 18 août 2026) | | |

Téléchargement indépendant du PDF du jour (`Quotidien N°4478.pdf`, hors pipeline, via `curl`) pour établir la vérité terrain de fond : **1 758 977 octets, 49 pages** — taille identique à l'octet près à ce que le pipeline a effectivement récupéré (voir Step 2 ci-dessous), confirmant qu'il s'agit bien du même fichier. Extraction de son texte (`pdftotext -layout`, hors pipeline) et repérage de la section « Fournitures et Services courants » (les nouveaux avis, par opposition à « RESULTATS PROVISOIRES » qui sont d'anciens résultats à ignorer) : **27 avis individuels distincts** identifiés par leur en-tête standalone « Avis de demande de prix » / « Avis d'Appel d'Offres » (recompté indépendamment ligne par ligne sur le texte extrait, entre les lignes ~1580 et ~3450 du texte `pdftotext`, pages 19 à 45 — puis recoupé avec 27 numéros de référence `N°2026-.../PRCP`-style tous distincts ; la section « Prestations intellectuelles »/« Avis de Manifestation d'Intérêt » qui suit, p.46, en est bien exclue, c'est un type d'avis différent) :

1. ISLO (Institut Supérieur de Logistique de Ouagadougou) — *Acquisition de consommables informatiques et péri informatiques* (N°2026-096/MGDP/SG/ISLO/DG/PRCP, dépôt avant le 10/09/2026) — **manifestement pertinent** pour une entreprise IT (consommables informatiques).
2. École Polytechnique de Ouagadougou (EPO) — Acquisition et installation des lampadaires solaires (N°2026-009/MESRI/EPO/DG/PRCP).
3. INFPE — Acquisition de 200 matelas et 300 housses de matelas (N°2026-25/INFPE/DG/PRCP).
4. Commune de Foutouri — Acquisition de fournitures scolaires au profit des écoles de la CEB (N°2026-01/REST/PKMD/CFTR/M/SG/PRCP).
5. Région de Bankui — Travaux de clôture partielle du mur du CSPS urbain, lot 3 (N°2026-08/RBNK/PBL/CBRM/CCAM).
6. Région de Bankui — Travaux de réhabilitation d'infrastructures (N°2026-07/RBNK/PBL/CBRM/CCAM).
7. Région de Bankui / Commune de Douroula — Travaux de construction de salles de classe, salle de professeur et latrine (N°2026-002/RBNK/PMHN/CDRL/M/PRCP).
8. Région de Bankui / Commune de Douroula — Travaux de construction de huit (08) boutiques de rue (N°2026-003/RBNK/PMHN/CDRL/M/PRCP) — objet distinct du précédent malgré la même commune.
9. Région du Guiriko / Commune de Karangasso-Sambla — Travaux de construction de trois (03) boutiques au marché du village (N°2026-001/RGRK/PHUE/CKS/M/PRCP).
10. Région du Kadiogo — Réhabilitation de salles de classe (N°2026-03/RKDG/PKAD/CRKI/M/PRCP).
11. ADEU (Agence du Développement Economique Urbain) — Travaux d'aménagement de vingt (20) étals au marché de Paspanga (N°2026-08/CO/ADEU/DG/SCP).
12. Commune de Ouagadougou (ADEU) — Travaux de construction de boutiques à Nabi Yaar, Avis d'Appel d'Offres Ouvert Accéléré/AAOA (N°2026-02/CO/ADEU/DG/SCP).
13. Centre Hospitalier Régional de Kaya — Travaux de curage des toitures, correction d'étanchéité, pavage, cloisonnement, hangar, réfection de la rampe principale (N°2026-032/MS/SG/CHR-KAYA/DG/PRCP).
14. Région du Liptako / Gorgadji — Travaux de construction d'un hall d'attente au profit du CSPS de Gorgadji (N°2026-002/RLTK/P.SNO/C-GGDJ/PRCP).
15. Région du Liptako / Gorgadji — Travaux de construction de trois (03) salles de classe + magasin + bureau au profit de la CEB (N°2026-001/RLTK/P.SNO/C-GGDJ/PRCP) — objet distinct du précédent malgré la même localité.
16. Commune de Poa — Travaux de transformation d'un forage à haut débit en PEA (N°2026-002/C.POA/M/PRCP).
17. Région du Nazinon / Kombissiri — Travaux de réhabilitation des dispensaires de Tuili, Tampinko et Monomtenga (N°2026-07/RNZN/PBZG/CKBS/CCAM).
18. Région du Nazinon / Kombissiri — Travaux de réhabilitation des écoles du secteur 1 et de l'école de Goudrin (N°2026-08/RNZN/PBZG/CKBS/CCAM) — objet distinct du précédent malgré la même commune.
19. Région de Oubri / Sourgoubila — Travaux de réhabilitation de l'auberge communale (lot1) et de la Maison des jeunes (lot2) (N°2026-006/ROBR/PKWG/CSGBL/CCAM/PRCP).
20. Région de Oubri / Sourgoubila — Travaux de réalisation de forages positifs à Koukin et à Yorghin (N°2026-005/ROBR/PKWG/CSGBL/CCAM/PRCP) — objet distinct du précédent malgré la même commune.
21. Région de Oubri / Laye — Réalisation de travaux divers (N°:2026-001/ROBR/PKWG/CLYE, du 10/07/2026).
22. Région de Oubri / Laye — Réalisation de travaux divers (N°:2026-002/ROBR/PKWG/CLYE, du 15/07/2026) — second avis distinct, même commune que le précédent.
23. Région du Sourou / Commune de Yaba — Travaux de construction d'infrastructures économiques (N°2026-01/RSRU/PNYL/CYAB).
24. Région du Sourou / Commune de Toma — Travaux de construction d'un laboratoire au Centre Médical Urbain (N°2026-01/C.TOM/M/SG/PRCP).
25. Région des Tannounyan / Commune de Niangoloko — Aménagement d'une aire de stationnement (voirie + pavés), Avis d'Appel d'Offres Ouvert/AAOO (N°2026-001/RTNY/CNGLK/M/SG/PRMP).
26. Région des Tannounyan / Commune de Ouo — Construction de deux (02) salles de classe à Gouèlè (N°2026-001/RTNY/PCMO/COUO/M/SG/PRCP).
27. Région des Tannounyan — Travaux de construction d'infrastructures scolaires et sanitaires (N°2026-06/RTNY/PCMO/CBFRT/PRCP).

Ces 27 avis sont réels, datés d'aujourd'hui, avec des dates limites de dépôt à venir (10/09 au 15/09/2026) — ce n'est en aucun cas un bulletin vide.

**Résultat du pipeline (run `785adda4-f28c-4f3c-af0a-74b7e775d0b5`) :**

- `fetch_listings.json` : **succès**. Le nœud a téléchargé exactement `http://www.dgcmef.gov.bf/sites/default/files/2026-09/Quotidien%20N%C2%B04478.pdf`, `status: "success"`, `size: 1758977`, `content_type: application/pdf` — taille identique à l'octet près au fichier vérifié indépendamment ci-dessus. Le nœud a correctement identifié et récupéré le bulletin du jour (pas un bulletin périmé). **Le fetch n'est pas en cause.**
- `extract_item_links.json` / `fetch_items.json` : le PDF passe intact d'étape en étape comme un item unique (`type: pdf_rag`), toujours `status: success`, contenu de même taille.
- `parse_extract.json` (27 items au total, toutes sources BF confondues) : **0 item avec `source: "dgcmef"`** ou provenant de la branche `pdf_rag`. Répartition constatée : `ungm: 15, "UEMOA - Appels d'offres": 10, "Enabel - Marchés publics Burkina Faso": 1, joffres.net: 1` — DGCMEF est absent à 100%.
- `notices` (DB, `source_id=8`) : 0 ligne — **résultat attendu et non significatif ici**, puisque la table entière est vide pour BF suite au crash de `persist_notices` documenté au Finding #1 (voir l'avertissement en tête de section BF). Cela dit, même si le run n'avait pas crashé, 0 aurait été le résultat : le PDF n'a produit aucun item dès `parse_extract`, donc rien ne serait arrivé jusqu'à `persist_notices` de toute façon.

**Analyse du code (cause racine) :** `parse_extract.py` route les items `parser_type == "pdf_rag"` (lignes 588-616) vers `parse_pdf_rag.py::parse_pdf_with_rag`, appelé avec `use_direct_extraction` à sa valeur par défaut `True` — c'est-à-dire que malgré le nom de la source (« … avec RAG ») et la config `settings.yaml` (`rag: {enabled: true, chunk_size: 4096, ...}`), le code **n'utilise pas ChromaDB/la recherche vectorielle** : il extrait le texte intégral du PDF (Docling, OCR désactivé, fallback pdfminer — lignes 20-89 de `parse_pdf_rag.py`), le découpe en chunks de 4096 caractères (`chunk_size` lu depuis `state.country_config["rag"]`, confirmé en base : ~70 chunks pour un texte de ~297 Ko), puis appelle `extract_tenders_structured()` (`extraction.py`) **une fois par chunk, séquentiellement**, en LLM. Sur staging, `LLM_PROVIDER=groq` — `extraction.py` lignes 51-59 route Groq systématiquement vers `_extract_tenders_json_fallback` (contournement documenté dans le code : *"Groq wraps parameters in nested objects causing validation failures"*). Chaque échec de chunk (exception réseau, JSON invalide, validation Pydantic) est capturé et **silencieusement ignoré** (`parse_pdf_rag.py` lignes 412-418 : `except Exception: logger.error(...); continue` — pas de fallback réel malgré le message de log ; même chose au niveau du nœud, `parse_extract.py` lignes 609-616, dont le message *"falling back to standard parsing"* est trompeur : aucun fallback n'est implémenté pour `pdf_rag`, contrairement à d'autres branches du même fichier qui en ont un explicite, p.ex. `pdf_quotidien`/`parse_pdf_structured` lignes 824-853).

Vérifications indépendantes effectuées pour circonscrire la cause exacte :
- **Texte du PDF exploitable** : confirmé — `pdftotext -layout` (hors pipeline) extrait un texte français propre et complet, sans artefact d'OCR raté ; les 27 avis y sont clairement délimités. Ce n'est donc pas un problème de mise en page PDF illisible pour l'extraction de texte.
- **Clé API Groq valide** : confirmée — `curl https://api.groq.com/openai/v1/models` avec la clé configurée sur staging renvoie `200`. Ce n'est donc pas une panne d'authentification/réseau globale vers le fournisseur LLM.
- **Point de défaillance exact dans la boucle de ~70 appels LLM séquentiels** : **non déterminé** — les logs stdout du process qui a exécuté ce run n'ont pas été conservés (`docker logs staging_api`/`staging_worker` sur la fenêtre du run ne montrent que le trafic des health-checks MinIO ; le run a été déclenché par un `docker exec` dont la sortie n'a pas été journalisée ailleurs, et les JSON de nœuds capturés par Task 1 ne contiennent que le résultat final agrégé de `parse_extract`, pas de détail par chunk). **Ambiguïté signalée explicitement** : il est possible que ce soit (a) une erreur systématique et reproductible sur chaque appel (config/prompt/schema), (b) une dégradation liée au volume d'appels séquentiels sur un même run (rate-limit Groq atteint après N chunks), ou (c) une combinaison — impossible de trancher sans rejouer l'extraction avec logging détaillé conservé, ce qui sortirait du périmètre « diagnostic seul, aucune correction » de ce chantier.
- **Corroboration historique** : le Finding #2 (déjà documenté plus haut dans cette section BF, trouvé par Task 1) note que **tous** les runs BF `completed` de l'échantillon 08-08 à 08-27 rapportent `unique_items: 0` malgré `items_parsed` non nul, avec une piste explicite pointant vers `parse_extract` en amont de `deduplicate`. Le constat de cette tâche (0 item DGCMEF y compris un jour sans crash de persistance) est cohérent avec cette anomalie plus large : DGCMEF ne contribue vraisemblablement aucun item à la base depuis plusieurs semaines, indépendamment du bug `DatetimeFieldOverflow` du jour.

**Gaps constatés :**

| Titre | Vu par le pipeline ? | Étage où perdu/faux positif | Cause racine | Étiquette (bug/archi/techno) | Sévérité | Preuve |
|---|---|---|---|---|---|---|
| ISLO — Acquisition de consommables informatiques et péri informatiques (N°2026-096/MGDP/SG/ISLO/DG/PRCP) — manifestement pertinent pour une entreprise IT | Non | Parse (`parse_extract`, branche `pdf_rag`) | Échec silencieux de l'extraction LLM-par-chunk dans `parse_pdf_rag.py::parse_pdf_with_rag` (mode `use_direct_extraction=True`, exceptions par chunk capturées et ignorées sans fallback réel — lignes 412-418) | bug logique | Critique | `fetch_listings.json` (PDF téléchargé intact, `status: success`, 1 758 977 octets, identique au fichier vérifié indépendamment) + `parse_extract.json` (27 items au total toutes sources BF confondues, 0 avec `source: "dgcmef"`) |
| Les 26 autres avis du Quotidien n°4478 (liste complète des 27 avis ci-dessus : travaux communaux/régionaux, fournitures diverses) — et 26 autres, même cause | Non | Parse (`parse_extract`, branche `pdf_rag`) | Même cause racine — perte à 100%, pas un cas isolé au tender IT | bug logique | Critique | Idem — même PDF, même fetch réussi, 0/27 avis en sortie de `parse_extract` |

Aucun cas de faux positif de classification à documenter pour cette source : puisque 0 item DGCMEF atteint même `parse_extract`, rien n'atteint `classify`/`company_notice_status` — il n'y a rien à vérifier côté sur-classification pour cette source sur ce run.

**Verdict :** DGCMEF est une perte totale et systématique dès l'étage `parse` — pas un problème de couverture partielle. Le fetch fonctionne parfaitement (bon fichier, bonne taille, à jour) et le contenu est un texte PDF propre et richement exploitable (27 avis réels et actuels vérifiés indépendamment, dont au moins un manifestement pertinent pour une entreprise IT), mais la chaîne d'extraction LLM-par-chunk de la branche `pdf_rag` (qui, malgré son nom, n'utilise pas de RAG vectoriel — c'est une extraction directe séquentielle par LLM) ne produit aucun item en sortie, sans qu'aucune alerte ne remonte au niveau du run (`counts_json`/`errors`) pour signaler cette perte silencieuse ; cela concorde avec l'anomalie `unique_items: 0` déjà repérée sur plusieurs semaines de runs historiques (Finding #2), suggérant un problème persistant et non un accident isolé au run d'aujourd'hui. Étiquette : **bug logique** (le contenu est extractible, la clé LLM est valide — rien n'indique une limite structurelle de l'approche PDF+LLM elle-même, ni une limite architecturale) plutôt qu'une limite technologique ; sévérité **critique** compte tenu de la perte à 100% et de l'absence totale de signal d'alerte. Cause exacte (config/prompt/schema vs rate-limit Groq vs autre) à confirmer par rejeu instrumenté lors de la phase de correction — hors périmètre de ce chantier de diagnostic.

### Joffres.net (source id 9, parser_type html-listing)

**Particularité structurelle de cette source :** `fetch_listings.py` contient une branche spéciale (`if parser_type == "html-listing" and "joffres" in source_name.lower()`) qui, après avoir récupéré la page de listing HTML, appelle immédiatement `extract_joffres_listings()` (`fetch_joffres.py`) pour en extraire les liens des avis (sélecteur CSS `a.job-title`) — contrairement aux autres sources `html-listing` génériques, l'extraction des liens se fait donc dès l'étage `fetch_listings`, pas à l'étage `extract_item_links`. Le code (`fetch_all_listings`) porte aussi un commentaire explicite notant que joffres.net « drops connections on non-browser User-Agents », d'où un `User-Agent` de navigateur réel forcé pour tout le client HTTP du run — vérifié ci-dessous pour signe de blocage/troncature.

**Vérité terrain, collectée le 2026-09-01 (deux méthodes indépendantes, à quelques minutes d'intervalle, résultat identique) :**
- **Requête `curl`** (User-Agent navigateur, identique à celui utilisé par le pipeline) contre l'URL exacte configurée (`list_url` en DB, `source_id=9`, copiée verbatim) — `https://joffres.net/recherche?domaine=Informatique+%26+D%C3%A9veloppement&localisation=&societe=&secteur=&prevision=0%2F1000000000&date_publication=&date_expiration=&statut=` — à **2026-09-01 22:03:33 UTC** (horodatage du header `Date` de la réponse) : `HTTP 200`, 133 498 octets.
- **Navigateur Chrome** (session interactive), même URL, quelques minutes plus tard : `HTTP 200`, page identique.

Comptage indépendant, deux méthodes sur le HTML téléchargé par `curl` (fichier sauvegardé localement, recompté directement dessus, pas à l'estimation) : `grep -c 'job-title'` (le sélecteur CSS utilisé par le pipeline) → **1** ; `grep -c 'offre-localisation'` (marqueur d'un bloc résultat distinct) → **1** ; aucun lien `href="...appeloffre..."` distinct autre que celui-ci ; aucune marque de pagination (`page=`, « Suivant ») dans le HTML. Confirmé aussi par lecture du texte rendu de la page (« Resultat pour : Domaine: Informatique & Développement | » suivi d'un seul bloc résultat). Commandes et sortie brute (fichier `joffres_ground_truth.html` toujours présent dans le scratchpad, re-exécuté verbatim pour cette révision) :

```
$ grep -c 'job-title' joffres_ground_truth.html
1

$ grep -c 'offre-localisation' joffres_ground_truth.html
1

$ grep -o 'href="[^"]*appeloffre[^"]*"' joffres_ground_truth.html | sort -u
href="https://joffres.net/appeloffre/appel-d-offres-pour-l-aquisition-et-installations-d-equipements-informatiques"

$ grep -io 'page=[0-9]*\|suivant' joffres_ground_truth.html | sort -u
(aucune sortie — aucune marque de pagination)
```

**La vérité terrain pour ce `list_url` exact est donc 1 avis, pas plus** :

1. « APPEL D'OFFRES POUR L'AQUISITION ET INSTALLATIONS D'EQUIPEMENTS INFORMATIQUES » — PNUD/UNDP-BFA (Burkina Faso), Procurement Process: RFQ, Reference Number `UNDP-BFA-00734`, publié le 20-Aug-26, deadline 02-Sep-26 @ 13h30 (New York time) / « Expire le 02-09-2026 », localisation Ouagadougou, domaine « Informatique & Développement » — **manifestement pertinent** pour une entreprise IT (acquisition et installation d'équipements informatiques).

Remarque : joffres.net agrège ici une annonce dont l'entité est le PNUD (UNDP-BFA) — cette même annonce est donc potentiellement aussi visible côté source UNGM (source id 10, hors périmètre de cette tâche ; non vérifié ici, signalé pour la tâche 4 / la synthèse, pertinent pour une éventuelle règle de dédoublonnage inter-source).

**Résultat du pipeline (run `785adda4-f28c-4f3c-af0a-74b7e775d0b5`, fetch à 2026-09-01 21:20:46 UTC) :**

- `fetch_listings.json` : **succès**, `status: "success"`, taille de la page HTML brute récupérée : 132 846 octets (vs 133 498 octets pour la copie `curl` de vérité terrain, ~40 minutes plus tard — écart mineur cohérent avec un contenu généré dynamiquement par session/CSRF token, pas une troncature). La branche spéciale joffres a bien tourné (`parser_type: "html-listing"`, `listings` peuplé) et a extrait **exactement 1 listing**, avec le même `url`/`title` que la vérité terrain. **Aucun signe de blocage anti-bot ou de troncature aujourd'hui** — la taille récupérée est cohérente avec le HTML complet de la page (dropdowns de filtres inclus, ~130 Ko), pas une page d'erreur ou un fragment tronqué. Historique notable cependant (table `runs`, voir Finding #3 plus haut) : cette source a échoué 3 fois sur la fenêtre observée (08-15, 08-13, 08-12, `completed_with_warnings`) avec `HTTP 502: Bad Gateway` / `Request timeout` — cohérent avec le commentaire de code sur l'anti-bot/fragilité de ce site ; le run d'aujourd'hui n'a simplement pas été affecté.
- `extract_item_links.json` : le même item unique (même `url`/`title`/`slug`) passe intact — 1/1.
- `fetch_items.json` : page de détail récupérée avec succès (`status: "success"`, 39 292 octets) et parsée par `extract_joffres_detail()` : `entity: "PNUD BURKINA"`, `category: "Biens et service"`, `deadline: "02-09-2026"` — tous cohérents avec la vérité terrain. **`ref_no` et `reference` vides** : les regex de `extract_joffres_detail()` (motifs `N°...`, `DAO ...`, `Demande de prix N°...`) ne matchent pas le format de référence utilisé par cette annonce d'origine PNUD (« Reference Number : UNDP-BFA-00734 », sans « N° ») — perte de complétude sur un champ, pas perte de l'avis lui-même.
- `parse_extract.json` (27 items au total, toutes sources BF confondues) : l'item joffres.net est présent, 1/1, avec `ref_no: ""` (même lacune reportée depuis `fetch_items`), les autres champs intacts.
- `deduplicate.json` (24 items uniques au total) : l'item est présent, `is_duplicate: false` — 1/1, non fusionné à tort avec un autre avis.
- `notices` (DB, `source_id=9`) : **0 ligne** (requête Step 3 exécutée le 2026-09-01, `SELECT ... FROM notices n LEFT JOIN company_notice_status cns ... WHERE n.source_id=9` → 0 rows). **Résultat attendu et non spécifique à Joffres.net** : comme documenté au Finding #1 en tête de section BF, ce run a crashé à `persist_notices` sur un `DatetimeFieldOverflow` provenant d'une notice **UNGM** (`LRFP-2026-9205898`), dans une transaction unique tout-ou-rien qui a englouti avec elle les 8 items UEMOA et le seul item Joffres.net du batch de 24. L'item Joffres.net lui-même n'est pas en cause : son `deadline_at` (`02-09-2026`, jour=02) ne peut pas produire un dépassement de champ mois/jour comme celui qui a fait échouer l'INSERT.

  Requête et sortie brute (ré-exécutée verbatim sur staging pour cette révision) :

  ```
  $ ssh -i ~/.ssh/id_ed25519 tender-ai@195.35.48.198 \
    "docker exec staging_postgres psql -U tenderai -d tenderai_bf -c \
    \"SELECT n.id, n.title, n.ref_no, n.deadline_at, n.is_duplicate, n.duplicate_of_id, cns.is_relevant, cns.relevance_score, cns.classification_method FROM notices n LEFT JOIN company_notice_status cns ON cns.notice_id=n.id AND cns.company_id=1 WHERE n.source_id=9 ORDER BY n.created_at DESC LIMIT 50;\""

   id | title | ref_no | deadline_at | is_duplicate | duplicate_of_id | is_relevant | relevance_score | classification_method
  ----+-------+--------+-------------+--------------+-----------------+-------------+-----------------+------------------------
  (0 rows)
  ```

**Gaps constatés :**

| Titre | Vu par le pipeline ? | Étage où perdu/faux positif | Cause racine | Étiquette (bug/archi/techno) | Sévérité | Preuve |
|---|---|---|---|---|---|---|
| APPEL D'OFFRES POUR L'AQUISITION ET INSTALLATIONS D'EQUIPEMENTS INFORMATIQUES (PNUD/UNDP-BFA-00734) — manifestement pertinent pour une entreprise IT | Oui, jusqu'à `deduplicate` inclus (item unique, non dupliqué) | Persist (`persist_notices`) | Non spécifique à Joffres.net : transaction unique tout-ou-rien du run BF entier, qui échoue sur un `DatetimeFieldOverflow` provenant d'une notice **UNGM** distincte (`LRFP-2026-9205898`, deadline `29-09-2026`) — voir Finding #1. L'avis Joffres.net lui-même est structurellement correct (fetch, parse, dedup tous réussis) et n'a aucune part dans la cause du crash. | bug logique | Critique | `fetch_listings.json`/`extract_item_links.json`/`fetch_items.json`/`parse_extract.json`/`deduplicate.json` (item présent et intact à chaque étage, `is_duplicate: false`) ; requête SQL Step 3 (`source_id=9`) → 0 lignes ; Finding #1 (analyse de code `persist_notices.py` + preuve empirique du batch INSERT de 24 lignes) |

Aucun autre gap à documenter pour cette source sur ce run : la vérité terrain ne compte qu'un seul avis pour ce `list_url` exact, et le pipeline l'a intégralement vu, correctement extrait (à l'exception mineure du champ `ref_no`, non extrait faute de motif regex adapté au format PNUD, mais sans conséquence sur l'identification de l'avis) et correctement dédoublonné. Aucun cas de faux positif de classification à documenter : la livraison ne s'étant pas déclenchée (harvest en échec), aucune ligne `company_notice_status` n'existe pour vérifier une éventuelle sur-classification.

**Verdict :** Joffres.net n'a, à ce jour et pour cette configuration de filtre (`domaine=Informatique & Développement`), qu'un seul avis actif — et le pipeline l'a intégralement et correctement traité de bout en bout jusqu'à `deduplicate` : la branche de code spéciale `html-listing`/joffres (sélecteur CSS `a.job-title`) fonctionne, aucun signe de blocage anti-bot ou de troncature n'a été observé sur ce run malgré la fragilité connue et documentée de ce site (3 échecs `502`/timeout sur la fenêtre historique de 20 jours couverte au Finding #3). Le seul écart entre vérité terrain (1) et base de données (0) n'est pas imputable au code spécifique à Joffres.net : c'est une conséquence collatérale du bug transversal déjà identifié au Finding #1 (transaction `persist_notices` unique et tout-ou-rien pour tout le run BF, cassée par une notice UNGM). Étiquette retenue **bug logique** (absence d'isolation par item/source dans `persist_notices` : un `db.commit()` unique après toute la boucle, sans try/except ni savepoint par item — corrigible par un changement de code localisé à `persist_notices.py`, sans refonte architecturale, donc « corrigible indépendamment de la techno » au sens de la taxonomie de l'audit) plutôt que limite architecturale ou limite technologique. Point mineur relevé en passant, sans impact sur la détection de l'avis : le champ `ref_no` reste vide pour les annonces d'origine PNUD/UNDP hébergées sur joffres.net, faute de motif regex couvrant leur format de référence (« Reference Number : XXX » sans « N° ») dans `extract_joffres_detail()`.

### UNGM (source id 10, parser_type ungm)
_(rempli par sa propre tâche — Task 4)_

### UEMOA (source id 11, parser_type html-tender)
_(rempli par sa propre tâche — Task 5)_

### Enabel (source id 12, parser_type html-tender)
_(rempli par sa propre tâche — Task 6)_

## Canada

### Achats Canada (source id 13, parser_type playwright)
_(rempli par sa propre tâche)_

### Ville de Montréal (source id 14, parser_type playwright)
_(rempli par sa propre tâche)_

### Le Devoir (source id 15, parser_type ledevoir)
_(rempli par sa propre tâche)_

### Nova Scotia (source id 16, parser_type playwright)
_(rempli par sa propre tâche)_

### UNDP (source id 17, parser_type tavily_extract)
_(rempli par sa propre tâche)_

### The Commonwealth (source id 20, parser_type tavily_extract)
_(rempli par sa propre tâche)_

### Palladium Group (source id 25, parser_type tavily_extract)
_(rempli par sa propre tâche)_

### Sources désactivées (9 sources)
_(rempli par sa propre tâche)_
