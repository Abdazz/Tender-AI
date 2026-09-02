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

**Particularité structurelle de cette source :** UNGM agrège des avis de 40+ agences ONU (UNDP, UNICEF, WHO, WFP, etc.). `fetch_ungm.py` n'utilise ni Playwright ni scraping de la page publique interactive : il POST directement au endpoint legacy `https://www.ungm.org/Public/Notice/Search` (celui qu'utilise en interne le widget "picker" du site) avec un payload JSON filtrant sur `Countries: [2324]` (Burkina Faso, valeur par défaut codée en dur — `COUNTRY_BURKINA_FASO = 2324`) et parse le fragment HTML retourné (lignes `div.tableRow.dataRow`). Ce endpoint est différent de celui qu'utilise la page moderne `/Public/Notice` (SPA) : il ne renvoie ni total ni indicateur de dernière page, et — comme démontré empiriquement ci-dessous — **plafonne à 15 lignes par page quel que soit le `PageSize` demandé**, nécessitant une boucle sur `PageIndex` pour tout récupérer. Cette boucle est absente du code actuel : `PageIndex` est câblé en dur à `0` dans `fetch_ungm_listings()` (`fetch_ungm.py` ligne 28).

**Vérité terrain — méthode et filtre appliqué :** UNGM étant un site global, le filtre géographique appliqué est celui du champ "Beneficiary country or territory" de la page officielle `https://www.ungm.org/Public/Notice`, réglé sur "Burkina Faso" (sélectionné via l'autocomplete du site — seul filtre pays disponible), avec "Only currently active" coché (comportement par défaut) — reproduisant l'intention du filtre `Countries: [2324]` codé en dur côté pipeline. Capturé le 2026-09-01, résultat affiché par le site lui-même (stable entre deux captures, à 15 puis 45 résultats chargés par défilement) :
```
Displaying results 1 to 15 of 54
...
Displaying results 1 to 45 of 54
```

**Reproduction indépendante de la requête exacte du pipeline (`curl`, même endpoint, même payload JSON, même User-Agent) :**
```
$ curl -s -o ungm_resp.html -w "HTTP_STATUS:%{http_code} SIZE:%{size_download}\n" \
  -X POST "https://www.ungm.org/Public/Notice/Search" \
  -H "Accept: text/html, */*; q=0.01" -H "Content-Type: application/json" \
  -H "User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" \
  -H "X-Requested-With: XMLHttpRequest" -H "Referer: https://www.ungm.org/Public/Notice" \
  --data '{"PageIndex":0,"PageSize":50,"Title":"","Description":"","Reference":"","PublishedFrom":"","PublishedTo":"","DeadlineFrom":"","DeadlineTo":"","Countries":[2324],"Agencies":[],"UNSPSCs":[],"NoticeTypes":[],"SortField":"DatePublished","SortAscending":false,"isPicker":false,"NoticeTypeIds":[],"NoticeStatuses":[]}'
HTTP_STATUS:200 SIZE:95088

$ grep -c 'tableRow dataRow' ungm_resp.html
15
$ grep -o 'data-noticeid="[0-9]*"' ungm_resp.html | sort -u | wc -l
15
$ grep -io "captcha\|access denied\|blocked\|cloudflare\|are you human\|rate limit" ungm_resp.html | sort -u
(aucune sortie — aucun signe de blocage/CAPTCHA)
```
→ **15 lignes, les mêmes 15 `notice_id` que ceux effectivement récupérés par le pipeline** (`fetch_listings.json`), malgré `PageSize: 50` explicitement demandé. **Aucun signe de blocage anti-bot** dans la réponse brute — HTTP 200 propre, contenu HTML complet et exploitable. Ceci contredit, pour cette source telle qu'implémentée, la mise en garde de `docs/PROJECT_STATUS.md` (spike Scrapling) qui cite UNGM comme cible anti-bot typique : cette mise en garde vise explicitement les fetchs **Playwright nus, sans stealth**, contre des portails « type UNGM/gouv derrière Cloudflare » — or `fetch_ungm.py` n'utilise pas Playwright pour cette source, seulement `httpx` en appel direct à un endpoint API-like, ce qui explique l'absence de blocage observée aujourd'hui. La mise en garde reste valable pour d'autres sources du pipeline utilisant `fetcher_type: playwright` (hors périmètre BF de cette tâche), pas pour UNGM tel qu'implémenté actuellement — donc **pas de limite technologique à documenter ici**, conformément à la consigne du brief.

**Correctif méthodologique (suite à relecture) — la comparaison « 54 vs 15 » plus bas dans une version antérieure de cette section comparait des univers différents :** le payload du pipeline interroge `"NoticeStatuses": []` (aucun filtre de statut), tandis que la vérité terrain UI (54) est explicitement filtrée sur "Only currently active". Les 15 lignes renvoyées par `PageIndex:0` peuvent donc contenir des avis déjà expirés qui ne font même pas partie de l'univers des 54 — ce qui était bien le cas. Reprise des 15 `notice_id` de `ungm_resp.html` avec leur date limite, pour déterminer combien sont réellement encore actifs au 2026-09-01 (date de l'audit) :
```
$ python3 -c "
import re
html = open('ungm_resp.html', encoding='utf-8').read()
for block in html.split('tableRow dataRow')[1:]:
    nid = re.search(r'data-noticeid=\"(\d+)\"', block).group(1)
    dl = re.search(r'data-description=\"Deadline\">\s*<span>\s*([\d\-A-Za-z: ]+?)\s*</span>', block).group(1)
    print(nid, dl)
"
308555  18-Sep-2026 16:00
310797  11-Sep-2026 23:59
311319  30-Sep-2026 23:59
312344  09-Sep-2026 17:00
312532  28-Aug-2026 14:00   <- EXPIRÉ (deadline antérieure au 2026-09-01)
312568  24-Sep-2026 12:00
312590  09-Sep-2026 17:30
312687  06-Sep-2026 00:00
312807  29-Sep-2026 11:00
312870  18-Sep-2026 15:00
312895  30-Sep-2026 23:45
312944  29-Sep-2026 11:00
312946  08-Sep-2026 07:00
313005  12-Oct-2026 15:00
313214  30-Sep-2026 23:59
```
→ **14 des 15 avis récupérés par `PageIndex=0` sont effectivement encore actifs au 2026-09-01** ; un seul, `312532` (deadline `28-Aug-2026`), était déjà expiré à cette date — présent dans les 15 uniquement parce que la requête ne filtre pas `NoticeStatuses`, mais absent en réalité de l'univers des 54 avis actifs de la vérité terrain. **Comparaison corrigée, actifs contre actifs : 54 (vérité terrain, filtrée "Only currently active") vs. 14 (avis effectivement encore actifs parmi les 15 récupérés par `PageIndex=0`) → 40 avis actifs jamais vus par le pipeline, soit ~74 % de perte** (et non 15 vs 54 / 72 % comme une comparaison non filtrée par statut le suggérait à tort). Toutes les occurrences de ce chiffre plus bas dans cette section (tableau des écarts, verdict) utilisent désormais cette base corrigée.

**Preuve que la pagination existe côté serveur mais n'est jamais exploitée par le pipeline :**
```
$ curl ... --data '{"PageIndex":1,"PageSize":50, ... ,"Countries":[2324], ...}' -o ungm_resp_p1.html
HTTP_STATUS:200 SIZE:95108
$ grep -c 'tableRow dataRow' ungm_resp_p1.html
15
$ comm -12 <(grep -o 'data-noticeid="[0-9]*"' ungm_resp.html | sort -u) <(grep -o 'data-noticeid="[0-9]*"' ungm_resp_p1.html | sort -u)
(aucune sortie — zéro chevauchement)
```
`PageIndex=1` renvoie 15 avis **entièrement distincts** des 15 de `PageIndex=0` (zéro `notice_id` commun) — la pagination fonctionne bel et bien côté UNGM ; c'est le code du pipeline qui ne la sollicite jamais au-delà de la page 0. Même contrôle actif/expiré (au 2026-09-01) appliqué aux 15 lignes de `PageIndex=1` : 12 des 15 sont effectivement encore actives, 3 déjà expirées (`312529` 31-Aug-2026, `311928` 31-Aug-2026 — la notice « Next Generation Firewall » citée en exemple ci-dessous, elle-même déjà expirée à la date de l'audit —, `311764` 31-Aug-2026). Au minimum **12 avis actifs distincts supplémentaires** sont ainsi démontrés exister au-delà de la page 0 — directement prouvé par une seconde requête réelle à `notice_id` totalement disjoints des 15 de la page 0 — un ordre de grandeur cohérent avec l'écart de 40 avis actifs impliqué par le total de 54 rapporté par l'UI officielle (retenu comme vérité terrain ; le comptage exact au-delà de la page 1 sur cet endpoint legacy s'est révélé instable d'un appel à l'autre — plusieurs `notice_id` de la page 0 réapparaissent sur des pages ultérieures lors d'appels successifs, signe probable d'un tri par égalité `DatePublished` non stable côté serveur sur ce endpoint — non creusé davantage, hors périmètre).

**Exemple concret d'avis manqué, manifestement pertinent pour une entreprise IT :** notice UNGM 311928, trouvée en page 1 (jamais atteinte par le pipeline), vérifiée en direct sur le site :
```
Next Generation Firewall And Secure Web Gateway
UN Secretariat … Reference: EOIUNPD24643 … Published on: 21-Aug-2026 … Deadline on: 31-Aug-2026 23:59 (GMT -4.00)
"...Expression of Interest (EOI) ... Next-Generation Firewall (NGFW) and Secure Web Gateway (SWG) solution
that protect the Organization's global network..."
```
Un avis sur la cybersécurité/l'infrastructure réseau — exactement le type d'opportunité IT qu'une entreprise cliente de TenderAI voudrait voir — jamais visible par le pipeline le jour où il était encore actif (deadline 31-Aug, un jour avant le run audité), uniquement parce qu'il se trouvait au-delà de la page 0.

**Confirmation du doublon inter-sources signalé par la Tâche 3 (Joffres.net) :** la vérité terrain UNGM (liste des 54, filtre Burkina Faso, page consultée le 2026-09-01) contient bien :
```
Aquisition et installations d équipements informatiques
02-Sep-2026 13:30 (GMT -4.00) Expires within 24 hours 20-Aug-2026 UNDP Request for quotation UNDP-BFA-00734 Burkina Faso
```
— même titre, même référence exacte `UNDP-BFA-00734`, même deadline (`02-09-2026`) que l'avis PNUD/UNDP-BFA repéré côté Joffres.net à la Tâche 3. **Confirmé : c'est bien le même avis, publié à la fois sur Joffres.net et sur UNGM** — la Tâche 3 avait raison de signaler un doublon potentiel inter-source. Cette notice UNGM elle-même est absente des 15 notice_id récupérés par le pipeline aujourd'hui (encore un effet de la limite de pagination ci-dessus). Ni l'une ni l'autre instance (Joffres.net ni UNGM) n'a atteint `persist_notices` sur ce run (Joffres.net : perdu au crash du Finding #1 ; UNGM : jamais fetché, au-delà de la page 0), donc la logique de dédoublonnage inter-source n'a pas pu être testée en conditions réelles — signalé pour la synthèse, non résolu ici comme demandé par le brief.

**Résultat du pipeline (run `785adda4-f28c-4f3c-af0a-74b7e775d0b5`) :**

- `fetch_listings.json` : succès, `status: "success"`, 15 listings (`grep -i "ungm" -A5 fetch_listings.json`, extrait — `"source": "ungm"` répété 15 fois, ex. `"UNICEF China Tender LRFP-2026-9205898 LTA Contract for Vision Aids"`, `"reference": "LRFP-2026-9205898"`, `"deadline": "29-09-2026"`). Tous les 15 `notice_id` identiques à la reproduction curl indépendante ci-dessus. Le champ `"patterns": {}` de la source en DB confirme qu'aucun `ungm_settings` (`country_ids`/`page_size`) personnalisé n'est configuré pour cette source — le code tourne avec ses valeurs par défaut.
- `parse_extract.json` (27 items au total toutes sources BF confondues) : **15/15** items UNGM survivent intacts, aucune perte à ce stade :
```
$ python3 -c "
import json; from collections import Counter
d = json.load(open('parse_extract.json'))[0]['data']
print(Counter(i.get('source') for i in d))"
Counter({'ungm': 15, "UEMOA - Appels d'offres": 10, 'Enabel - Marchés publics Burkina Faso': 1, 'joffres.net': 1})
```
- `deduplicate.json` (24 items uniques au total) : **14/15** UNGM survivent — un item disparaît du tableau `unique_items` sans trace de `duplicate_of_id` :
```
$ python3 -c "
import json; from collections import Counter
d = json.load(open('deduplicate.json'))[0]['data']
print(Counter(i.get('source') for i in d))"
Counter({'ungm': 14, "UEMOA - Appels d'offres": 8, 'Enabel - Marchés publics Burkina Faso': 1, 'joffres.net': 1})
```
L'item manquant est `LRFP-2026-9205896` ("UNICEF China Tender LRFP-2026-9205896 LTA Contract for Hearing Aids and Diagnosis Equipment") — absent de la liste des 14 survivants, et absent aussi des `duplicate_of_id` des 14 autres : `log_node_output("deduplicate", unique_items, ...)` (`deduplicate.py` ligne 310) ne logue que les survivants, jamais les items écartés (`similar_items`), donc aucune trace du motif exact n'est conservée dans ce fichier — reconstitué par calcul indépendant :
```
$ python3 -c "
from rapidfuzz import fuzz
t1 = 'UNICEF China Tender LRFP-2026-9205898 LTA Contract for Vision Aids'
t2 = 'UNICEF China Tender LRFP-2026-9205896 LTA Contract for Hearing Aids and Diagnosis Equipment'
print(fuzz.ratio(t1, t2))"
77.70700636942675
```
Config staging (`tenderai-infra/settings.yaml` lignes 559-560) : `deduplication_threshold: 0.75`, `deduplication_method: "hash_similarity"`. Les deux titres suivent un gabarit quasi identique ("UNICEF China Tender LRFP-2026-920589X LTA Contract for ___") mais désignent deux appels d'offres **distincts** (référence différente — `9205896` vs `9205898` — produit différent : aides auditives/diagnostic vs aides visuelles). `deduplicate.py` (méthode `hash_similarity`, lignes 176-190) ne compare les références exactes que pour un court-circuit "match exact" (`item_ref == unique_ref`) ; comme elles diffèrent, le code retombe sur `fuzz.ratio()` du seul texte du titre (ligne 195), qui atteint 77,7 % — au-dessus du seuil de 75 % — l'item est marqué `is_duplicate=True`, `duplicate_reason: "similarity_77%"`, et **définitivement exclu** de `unique_items` avant même d'atteindre `persist_notices`. Faux négatif de dédoublonnage : deux avis réels et distincts fusionnés à tort en un seul.
- `persist_notices.json` : `{}` (vide) — run entier en échec avant tout commit (Finding #1, avertissement en tête de section BF). Répartition du batch de 24 items envoyés à `persist_notices` (Finding #1) : **UNGM a contribué 14 des 24 items** — la majorité du batch.
- `notices` (DB, `source_id=10`) : **0 ligne.** Requête et sortie brute (exécutée le 2026-09-01) :
```
$ ssh -i ~/.ssh/id_ed25519 tender-ai@195.35.48.198 \
  "docker exec staging_postgres psql -U tenderai -d tenderai_bf -c \
  \"SELECT n.id, n.title, n.ref_no, n.deadline_at, n.is_duplicate, n.duplicate_of_id, cns.is_relevant, cns.relevance_score, cns.classification_method FROM notices n LEFT JOIN company_notice_status cns ON cns.notice_id=n.id AND cns.company_id=1 WHERE n.source_id=10 ORDER BY n.created_at DESC LIMIT 50;\""

 id | title | ref_no | deadline_at | is_duplicate | duplicate_of_id | is_relevant | relevance_score | classification_method
----+-------+--------+-------------+--------------+-----------------+-------------+-----------------+------------------------
(0 rows)
```
Résultat attendu et non spécifique à UNGM (Finding #1, avertissement en tête de section BF) — mais UNGM est ici la source dont la propre donnée a **causé** le crash transversal (voir investigation ciblée ci-dessous), contrairement à Joffres.net/UEMOA/Enabel qui n'ont subi que le rayon d'impact collatéral. Aucune ligne `company_notice_status` n'existe (livraison jamais déclenchée) : aucun faux positif de classification ne peut être vérifié pour cette source sur ce run.

**Investigation ciblée — la notice qui a fait planter le run (`LRFP-2026-9205898`) :** vérifiée en direct sur le site le 2026-09-01 (`https://www.ungm.org/Public/Notice/312944`) :
```
UNICEF China Tender LRFP-2026-9205898 LTA Contract for Vision Aids
UNICEF … Reference: LRFP-2026-9205898
Published on: 01-Sep-2026
Deadline on: 29-Sep-2026 11:00 (GMT 8.00)
… "it will be appreciated if you could provide your quotation ... no later than 11:00 AM on 29 September 2026 (GMT+8)"
… "投标截止日期2026年9月29日上午十一点整（北京时间）"（29 septembre 2026）…
```
**L'avis est réel** (visible en direct sur `ungm.org` aujourd'hui, avec documents PDF/annexes attachés, adresse de contact nominative) et **sa date limite n'est ni ambiguë ni malformée sur le site source** : UNGM affiche le format `DD-Mon-YYYY` (`29-Sep-2026`), non ambigu puisque le mois est écrit en toutes lettres, et le corps du texte confirme deux fois indépendamment "29 September 2026" et "2026年9月29日" (29 septembre). **Ce n'est donc pas une donnée UNGM malformée à la source** — la malformation est introduite en aval, par le pipeline lui-même, en deux étapes cumulatives :

1. `fetch_ungm.py::_normalize_ungm_date()` (lignes 144-167) reformate volontairement `"29-Sep-2026"` (non ambigu) en `"29-09-2026"` (ambigu, tout-numérique, ordre jour-mois) — jetant l'information désambiguïsante (le nom du mois) sans nécessité.
2. `persist_notices.py` (ligne 85 : `deadline_at=item.get("deadline_at") or item.get("deadline")`) assigne cette chaîne brute directement à `Notice.deadline_at`, une colonne `DateTime` (`models.py` ligne 138) — **sans jamais la parser en objet `date`/`datetime` Python**. SQLAlchemy transmet donc la chaîne telle quelle à psycopg2, qui la fait interpréter par PostgreSQL selon le paramètre de session `datestyle`, confirmé sur staging :
```
$ ssh -i ~/.ssh/id_ed25519 tender-ai@195.35.48.198 \
  "docker exec staging_postgres psql -U tenderai -d tenderai_bf -c \"SHOW datestyle;\""
 DateStyle
-----------
 ISO, MDY
(1 row)
```
En `MDY`, `"29-09-2026"` est lu comme mois=29 → `DatetimeFieldOverflow` (le crash documenté au Finding #1).

**Ce défaut est-il spécifique à UNGM ?** Deux couches distinctes, à ne pas confondre :
- Le défaut **profond** — assigner une chaîne de date brute non parsée à une colonne `DateTime`, sans jamais fixer/normaliser le `datestyle` de session ni convertir en objet `date` avant l'INSERT — est **transversal**, pas propre à UNGM : `parse_extract.py` (branches DGCMEF/UEMOA génériques) extrait lui aussi des dates via regex sous forme de chaînes brutes (`r"(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})"`, jamais converties en objet `date`), assignées à `deadline_at` de la même façon non parsée. C'est très exactement le défaut déjà documenté par le Finding #1 (Tâche 1) au niveau architecture de `persist_notices.py` — pas de redite nécessaire ici.
- Ce qui **est** spécifique à UNGM : `_normalize_ungm_date()` est la seule étape de tout le pipeline qui prend une date **déjà non ambiguë** à la source (mois en toutes lettres) et la reformate activement vers un format **ambigu**. Les autres sources BF (DGCMEF, UEMOA, Joffres.net) écrivent nativement leurs dates en `DD/MM/YYYY` ou `DD-MM-YYYY` — déjà ambiguës dès la source, le problème leur préexistait donc de toute façon. UNGM, à l'inverse, *introduit* l'ambiguïté par un choix de code local et évitable : conserver le format ISO `YYYY-MM-DD` (ou un objet `date`) dans `_normalize_ungm_date()` aurait suffi à empêcher ce cas précis de faire planter le run, indépendamment du fix architectural plus large de `persist_notices.py`.
- Corollaire plus sournois, signalé ici : ce mécanisme ne plante bruyamment que lorsque `jour > 12` (comme aujourd'hui, 29). Pour toute notice UNGM future dont le jour de deadline est ≤ 12, la même chaîne ambiguë serait **silencieusement mal interprétée par PostgreSQL** (jour et mois inversés) **sans jamais lever d'erreur ni d'alerte**, corrompant silencieusement `deadline_at` en base — un problème plus insidieux que le crash observé aujourd'hui, resté non détecté jusqu'ici précisément parce qu'il ne casse rien.

**Gaps constatés :**

| Titre | Vu par le pipeline ? | Étage où perdu/faux positif | Cause racine | Étiquette (bug/archi/techno) | Sévérité | Preuve |
|---|---|---|---|---|---|---|
| Next Generation Firewall and Secure Web Gateway (UN Secretariat, réf. EOIUNPD24643, notice 311928) — manifestement pertinent pour une entreprise IT (cybersécurité réseau) | Non | Fetch (`fetch_listings`, branche `ungm`) | `fetch_ungm.py::fetch_ungm_listings()` envoie `"PageIndex": 0` codé en dur (ligne 28), sans boucle de pagination, alors que le endpoint legacy plafonne à 15 lignes/page quel que soit `PageSize` demandé | bug logique | Critique | Reproduction `curl` PageIndex=0 vs PageIndex=1 : 15 `notice_id` disjoints (`comm -12` → 0 chevauchement) ; notice 311928 confirmée en direct sur `ungm.org` (deadline 31-Aug-2026, publiée 21-Aug-2026) |
| Les ~40 autres avis actifs Burkina Faso jamais vus par le pipeline (dont l'avis PNUD/UNDP-BFA-00734 « Aquisition et installations d'équipements informatiques », toujours actif au 2026-09-01, également vu côté Joffres.net — cf. Tâche 3) — vérité terrain UI officielle : 54 avis actifs au total pour ce filtre pays, contre 14 avis réellement encore actifs parmi les 15 récupérés par `PageIndex=0` (comparaison actifs contre actifs — voir correctif méthodologique plus haut) | Non | Fetch (`fetch_listings`, branche `ungm`) | Même cause que ci-dessus — perte structurelle, pas un cas isolé | bug logique | Critique | UI officielle : « Displaying results 1 to 45 of 54 » ; 14 des 15 `notice_id` de `fetch_listings.json` confirmés actifs au 2026-09-01 (1 expiré : `312532`, deadline 28-Aug-2026) ; recoupement de référence `UNDP-BFA-00734` avec la Tâche 3 |
| UNICEF China Tender LRFP-2026-9205896 LTA Contract for Hearing Aids and Diagnosis Equipment | Oui, jusqu'à `parse_extract` inclus (15/15) ; perdu à `deduplicate` | Dédoublonnage (`deduplicate`, méthode `hash_similarity`) | Faux positif de similarité fuzzy sur titre gabarit (`fuzz.ratio` = 77,7 % > seuil 75 %) entre deux avis UNICEF China distincts (références et produits différents) — comparaison de référence exacte court-circuitée uniquement en cas de match, pas de mismatch explicite | bug logique | Modérée (perte réelle et vérifiée, mais pertinence IT non évidente — équipement médical) | `parse_extract.json` : 15/15 UNGM présents ; `deduplicate.json` : 14/15, item absent sans `duplicate_of_id` ; calcul indépendant `rapidfuzz.fuzz.ratio()` = 77,70706... ; `tenderai-infra/settings.yaml` lignes 559-560 (seuil 0.75, méthode hash_similarity) |
| UNICEF China Tender LRFP-2026-9205898 LTA Contract for Vision Aids (notice à l'origine du crash du run BF entier) | Oui, jusqu'à `deduplicate` inclus (`is_duplicate: false`, 1/1 survivant) | Persist (`persist_notices`) | Date UNGM native non ambiguë (`29-Sep-2026`) reformatée en chaîne ambiguë (`29-09-2026`) par `_normalize_ungm_date()` (`fetch_ungm.py`), puis assignée sans parsing à une colonne `DateTime` (`persist_notices.py` ligne 85) ; interprétée `MDY` par la session Postgres (`datestyle` confirmé `ISO, MDY`) → `DatetimeFieldOverflow`. Contribution spécifique à UNGM : la perte de l'information désambiguïsante (nom du mois) lors de la normalisation — le défaut plus profond (pas de parsing de date avant persist) est transversal, déjà documenté Finding #1 | bug logique | Critique (a fait échouer tout le run BF, toutes sources confondues, 3 fois en 24h — voir Finding #3) | Vérifié en direct sur `ungm.org/Public/Notice/312944` (« Deadline on: 29-Sep-2026 11:00 ») ; `fetch_ungm.py` lignes 28, 144-167 ; `persist_notices.py` ligne 85 ; `models.py` ligne 138 (`Column(DateTime, ...)`) ; `SHOW datestyle` → `ISO, MDY` ; message d'erreur exact au Finding #1 |
| Les 13 autres avis UNGM ayant survécu jusqu'à `deduplicate` (14 items au total dans `deduplicate.json`, moins la notice ci-dessus) | Oui, jusqu'à `deduplicate` inclus | Persist (`persist_notices`) | Non spécifique à UNGM : transaction unique tout-ou-rien du run BF entier (`persist_notices.py`, un seul `db.commit()` après la boucle, aucun commit/savepoint par item) qui échoue à cause de la notice ci-dessus — voir Finding #1 | bug logique | Critique | `deduplicate.json` : 14 items `source: "ungm"`, tous `is_duplicate: false` ; Finding #1 (analyse de code + preuve empirique du batch INSERT de 24 lignes, dont 14 UNGM) |

**Verdict :** UNGM cumule trois défauts indépendants, à trois étages différents, tous corrigibles par un changement de code localisé (aucun n'est une limite architecturale ni technologique) :

1. **Fetch — perte majoritaire par pagination absente** (le plus sévère en volume) : le endpoint utilisé plafonne à 15 résultats/page et le code ne boucle jamais au-delà de `PageIndex=0`, alors que la pagination fonctionne bel et bien côté serveur (vérifié : page 1 renvoie 15 avis entièrement distincts) et que la vérité terrain officielle du site rapporte 54 avis actifs pour ce filtre pays, contre 14 avis réellement encore actifs parmi les 15 vus par le pipeline (comparaison actifs contre actifs — un des 15 était déjà expiré, voir correctif méthodologique plus haut) — une perte d'environ 40 avis actifs/jour (~74 %), dont un exemple documenté ci-dessus (pare-feu nouvelle génération, notice 311928 — illustratif du mécanisme de perte, bien que lui-même déjà expiré à la date de l'audit) et un confirmé en doublon avec un avis toujours actif côté Joffres.net (Tâche 3, UNDP-BFA-00734). **Aucun signe de blocage anti-bot** n'a été observé (HTTP 200 propre, contenu complet, aucune trace CAPTCHA/Cloudflare) — la mise en garde anti-bot de `docs/PROJECT_STATUS.md` concernant UNGM vise les fetchs Playwright nus, pas le mécanisme `httpx`+POST-JSON utilisé ici ; **pas de limite technologique à documenter**, uniquement une boucle de pagination manquante.
2. **Dédoublonnage — un faux positif de similarité vérifié** : deux avis UNICEF China distincts (aides auditives vs aides visuelles, références différentes) fusionnés à tort car leur titre suit un gabarit à 77,7 % de similarité textuelle, au-dessus du seuil de 75 % configuré — un avis réel perdu silencieusement sans trace de la raison dans les logs de nœud (qui ne loguent que les survivants).
3. **Persist — contribution spécifique au crash transversal du Finding #1** : la donnée UNGM à l'origine du `DatetimeFieldOverflow` qui a fait échouer tout le run BF aujourd'hui était, sur le site source, une date parfaitement valide et non ambiguë (`29-Sep-2026`) — ce n'est donc *pas* un cas de « donnée UNGM malformée » comme le laissait supposer le message d'erreur brut, mais un artefact introduit par la normalisation `_normalize_ungm_date()` du pipeline lui-même (perte volontaire du nom du mois, désambiguïsant), combiné au défaut architectural transversal déjà identifié (absence de parsing de date avant `persist_notices`, Finding #1). Un correctif localisé à `_normalize_ungm_date()` (conserver l'ISO `YYYY-MM-DD`) aurait suffi à éviter que *cette* notice précise ne déclenche le crash — sans se substituer au correctif architectural plus large nécessaire pour les autres sources.

Sévérité globale de la source : **critique** — entre la perte majoritaire par pagination (~74 % des avis actifs jamais vus, chiffre recalculé actifs contre actifs — voir correctif méthodologique plus haut) et la contribution directe au crash qui a fait perdre l'intégralité de la collecte BF du jour, UNGM est la source dont les défauts ont le plus large rayon d'impact sur ce run, alors même qu'aucun de ses trois défauts n'exige de refonte architecturale ou technologique pour être corrigé.

### UEMOA (source id 11, parser_type html-tender)

**Particularité structurelle de cette source :** `parser_type: html-tender` est un fetcher générique piloté entièrement par la colonne `patterns` en DB (`src/tenderai/agents/nodes/fetch_html_tender.py`) — aucun code spécifique à UEMOA. Le fetcher lit `card_selector`/`title_selector`/`pdf_selector`/`deadline_selector` pour parser une page HTML, plus trois paramètres pertinents pour cette tâche : `ssl_verify` (passé tel quel à `httpx.AsyncClient(verify=...)`), `max_pages` et `pagination_url` (lignes 41-48) — **le code implémente déjà une boucle de pagination générique** : `if max_pages > 1 and pagination_url: for page in range(2, max_pages+1): urls.append(pagination_url.format(page=page))`. Cette boucle n'est déclenchée que si les deux valeurs sont configurées.

**Configuration en base pour `source_id=11` (requête exécutée le 2026-09-02) :**
```
$ ssh -i ~/.ssh/id_ed25519 tender-ai@195.35.48.198 \
  "docker exec staging_postgres psql -U tenderai -d tenderai_bf -c \
  \"SELECT id, name, parser_type, list_url, patterns FROM sources WHERE id=11;\""

 id |          name           | parser_type |              list_url               |                                                                                                                                         patterns
----+-------------------------+-------------+-------------------------------------+------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 11 | UEMOA - Appels d'offres | html-tender | https://www.uemoa.int/appel-d-offre | {"entity": "UEMOA", "location": "Zone UEMOA", "max_pages": 1, "ssl_verify": false, "pdf_selector": "a[href*='opportunite_affaire']", "card_selector": "div.swiper-slide div.news-box", "title_selector": "div.new-txt p", "deadline_selector": "time", "deadline_attribute": "datetime"}
(1 row)
```
`max_pages: 1` et **aucune clé `pagination_url`** — la boucle de pagination du code (lignes 46-48 ci-dessus) ne peut donc jamais se déclencher pour cette source, quelle que soit la valeur de `max_pages`. **Comparaison directe avec Enabel** (même `parser_type: html-tender`, section suivante du rapport, Task 6) : ses `patterns` (extraits de `fetch_listings.json`) portent `"max_pages": 3, "pagination_url": "https://www.enabel.be/fr/marches-publics/page/{page}/?in_country=1726&is_status=0"` — la même mécanique de pagination générique **est activement utilisée avec succès pour une autre source BF**, ce qui confirme sans ambiguïté qu'il s'agit ici d'un défaut de configuration ponctuel pour UEMOA, pas d'une limite du code ni de l'architecture.

**Vérification `ssl_verify: false` — corrélation avec un problème de certificat réel (recherché conformément à la consigne du brief) :**
```
$ curl -s -o /dev/null -w "HTTP_STATUS:%{http_code} SIZE:%{size_download}\n" \
  "https://www.uemoa.int/appel-d-offre" -A "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
HTTP_STATUS:000 SIZE:0
$ echo $?
60

$ echo | openssl s_client -connect www.uemoa.int:443 -servername www.uemoa.int 2>&1 | grep -iE "verify|subject|issuer|error"
verify error:num=20:unable to get local issuer certificate
verify return:1
verify error:num=21:unable to verify the first certificate
verify return:1
verify return:1
subject=CN = *.uemoa.int
issuer=C = GB, O = Sectigo Limited, CN = Sectigo Public Server Authentication CA DV R36
Verification error: unable to verify the first certificate
Verify return code: 21 (unable to verify the first certificate)
```
Confirmé : `www.uemoa.int` ne sert pas le certificat intermédiaire Sectigo dans sa chaîne TLS — un défaut de configuration serveur réel et reproduisible côté UEMOA (`curl` échoue avec le code 60 « SSL certificate problem » sans `-k`/`verify=false`, indépendamment de tout client HTTP du pipeline). `ssl_verify: false` est donc un contournement légitime et nécessaire pour cette source précise, pas une cause de perte : `fetch_listings.json` confirme `status: "success"`, `error: null` pour UEMOA, sans aucune trace d'erreur TLS dans le run audité — **`ssl_verify: false` n'est pas un gap, aucune corrélation avec une perte d'avis.**

**Vérité terrain — `max_pages: 1` face à la pagination réelle du site (collecte le 2026-09-02, ~16h45 UTC, un jour après le run audité ; la structure et le volume du listing ne dépendent pas de la date d'audit) :**
```
$ for p in 0 1 2 19; do
  curl -s -k -o /tmp/uemoa_live_p$p.html -w "page=$p HTTP_STATUS:%{http_code} SIZE:%{size_download}\n" \
    "https://www.uemoa.int/appel-d-offre?page=$p" -A "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
done
page=0 HTTP_STATUS:200 SIZE:92590
page=1 HTTP_STATUS:200 SIZE:93258
page=2 HTTP_STATUS:200 SIZE:93472
page=19 HTTP_STATUS:200 SIZE:86651
```
Lien de pagination « Dernière page » extrait du HTML brut de `page=0` :
```
<li class="page-item pager__item--last">
  <a href="?page=19" title="Aller à la dernière page" class="page-link">
    <span class="visually-hidden">Dernière page</span>
    <span aria-hidden="true">Last »</span>
  </a>
</li>
```
→ **20 pages au total (`page=0` à `page=19`)**, mécanisme de pagination server-side classique (paramètre `?page=N` en GET, pas d'AJAX/JS requis — donc trivialement rejouable par `httpx`, aucun rendu JS nécessaire). Décompte indépendant des items (sélecteur `div.swiper-slide` + `div.new-txt p`, identique au `card_selector`/`title_selector` du pipeline) par page, et vérification qu'il s'agit bien d'avis distincts et non de doublons de carrousel :
```
$ python3 -c "
import re
for p in [0,1,2,19]:
    html = open(f'/tmp/uemoa_live_p{p}.html', encoding='utf-8').read()
    titles = re.findall(r'<p class=\"pb-2\"style=\"font-size:12px;\">\s*(.*?)</p>', html, re.S)
    print(f'page={p}: {len(titles)} titres')
"
page=0: 10 titres
page=1: 10 titres
page=2: 10 titres
page=19: 4 titres

$ python3 -c "
p0 = set(open('/tmp/uemoa_slide_hrefs_p0.txt').read().split())
p1 = set(open('/tmp/uemoa_slide_hrefs_p1.txt').read().split())
p2 = set(open('/tmp/uemoa_slide_hrefs_p2.txt').read().split())
print('p0 & p1 overlap:', p0 & p1)
print('p0 & p2 overlap:', p0 & p2)
print('p1 & p2 overlap:', p1 & p2)
"
p0 & p1 overlap: set()
p0 & p2 overlap: set()
p1 & p2 overlap: set()
```
(fichiers `uemoa_slide_hrefs_pN.txt` = liens PDF `href` extraits de chaque bloc `swiper-slide`, un fichier par page, comparés par intersection d'ensembles Python) — **zéro chevauchement entre les 3 premières pages : 30 avis strictement distincts**, confirmant qu'il ne s'agit pas d'un artefact de carrousel dupliqué mais d'une vraie pagination de contenu. **Total du listing : 19×10 + 4 = 194 avis distincts** (pages 0 à 18 pleines à 10, page 19 partielle à 4) contre **10 récupérés par le pipeline** (`max_pages: 1` = uniquement `list_url`, équivalent à `page=0`) — **184 avis, soit ~94,8 % du listing, jamais fetchés**, uniquement à cause de la valeur de configuration `max_pages: 1`.

Deux exemples concrets, manifestement pertinents pour une entreprise IT, trouvés en page 2 (jamais atteinte par le pipeline) :
```
$ python3 -c "
import re
html = open('/tmp/uemoa_live_p2.html', encoding='utf-8').read()
titles = re.findall(r'<p class=\"pb-2\"style=\"font-size:12px;\">\s*(.*?)</p>', html, re.S)
for t in titles: print('-', re.sub(r'\s+',' ', t).strip())
"
- Addendum N° 1 de l'Appel d'Offres relatif aux travaux de réhabilitation de 50 km de pistes rurales au profit de la SIRAT SA
- Addendum N°01 de l'Avis d'Appel d'Offres Ouvert International relatif à la réalisation des travaux de forages d'exploitation ...
- Avis d'appel d'offres international relatif à l'équipement et mise en exploitation du data center et du réseau local CAM
- Avis d'appel d'offre international relatif à l'acquisition d'équipements de contrôle technique mobile mixte VL/PL et fixe VL au profit du CN...
- Avis d'appel d'offre international relatif à la fourniture, au deploiement et pose de lampadaires solaires de type photovoltaïques pour l'éc...
- Avis d'Appel d'Offres Ouvert International relatif à la couverture en assurance santé du personnel de la SBEE
- Appel d'offres ouvert N° 023/2026/AO/COM/UEMOA relatif au renouvellement du contrat de licences Microsoft Enterprise Agreement (EA) de ...
- Avis d'Appel d'Offres Ouvert International relatif à l'acquisition des Equipements de Protection Collective (EPC) au profit de la SBEE.
- Addendum N°1 de l'appel d'offre international relatif à la construction de trente-cinq (35) Guichets Uniques de Protection Sociale (GUPS) et...
- Communiqué No 005/CCM/2026 relatif à la modification des caractéristiques techniques et au report de la date limite de de dépôt des offres d...
```
- **« Avis d'appel d'offres international relatif à l'équipement et mise en exploitation du data center et du réseau local CAM »** — matche littéralement les mots-clés `it_services` « data center » et « réseau local » de la config de classification (Contraintes globales du plan). Il s'agit en outre de l'avis **original** du marché DAOI N°022 : le pipeline n'a vu (via `fetch_listings.json`, page 0) que ses deux addenda (« Addendum n°1 » et « Addendum n°2 DAOI N°022 »), jamais l'avis initial lui-même — l'avis « source » de ce marché IT est donc totalement invisible pour le pipeline.
- **« Appel d'offres ouvert N° 023/2026/AO/COM/UEMOA relatif au renouvellement du contrat de licences Microsoft Enterprise Agreement (EA) »** — même famille que l'item déjà vu en page 0 (« Renouvellement des licences et support Microsoft o365 »), mais un marché distinct (licences Enterprise Agreement vs support O365), jamais atteint.

**Résultat du pipeline (run `785adda4-f28c-4f3c-af0a-74b7e775d0b5`) :**

- `fetch_listings.json` (`grep -i "uemoa" -A5 fetch_listings.json`, extrait des `patterns` confirmé identique à la DB ci-dessus) : `status: "success"`, `error: null`, exactement **10 listings** — un seul appel HTTP à `list_url`, aucune boucle de pagination (cohérent avec `max_pages: 1` et l'absence de `pagination_url`). Les 10 items correspondent exactement à la page 0 de la vérité terrain (mêmes titres, mêmes deadlines ISO). `"content": null` — le fetcher `html-tender` ne conserve jamais le HTML brut dans le log de nœud (ligne 80 du code), seulement les `listings` déjà parsés.
- `extract_item_links.json` : **10/10** survivent intacts (`Counter({'ungm': 15, "UEMOA - Appels d'offres": 10, ...})`).
- `fetch_items.json` : **10/10** avec `status: "success"` pour chacune des 10 URLs PDF UEMOA (vérifié individuellement, aucune erreur SSL/réseau au niveau item malgré `ssl_verify: false`).
- `parse_extract.json` (27 items au total toutes sources BF confondues) : **10/10** UEMOA survivent intacts (`Counter({'ungm': 15, "UEMOA - Appels d'offres": 10, "Enabel - Marchés publics Burkina Faso": 1, 'joffres.net': 1})`, cf. section UNGM).
- `deduplicate.json` (24 items uniques au total) : **8/10** seulement — 2 items UEMOA disparaissent du tableau `unique_items` sans trace de `duplicate_of_id` (même limite de logging déjà documentée section UNGM : `deduplicate.py` ligne 310 ne logue que les survivants). Reconstitution par comparaison titre-à-titre entre les 10 titres de `parse_extract.json` et les 8 de `deduplicate.json` :
```
$ python3 -c "
import json
pe = {i['title'] for i in json.load(open('parse_extract.json'))[0]['data'] if i.get('source')==\"UEMOA - Appels d'offres\"}
dd = {i['title'] for i in json.load(open('deduplicate.json'))[0]['data'] if i.get('source')==\"UEMOA - Appels d'offres\"}
print(pe - dd)"
{"Addendum N°1 au Dao 071 relatif aux travaux de réhabilitation des directions départementales du cadre de vie et des transports (DDCVT), de l'annexe de la DDCVT du mono, et des divisions territoriales de come et d'Allada",
 "Addendum n°1 DAOI N°022 relatif à l'équipement et mise en exploitation du data center et du réseau local CAM"}
```
Vérification indépendante de la cause exacte (`reference`/`ref_no` vides des deux côtés pour toutes les paires UEMOA — le court-circuit `item_ref == unique_ref` de `deduplicate.py` ligne 186 ne peut donc jamais s'appliquer ; retombée systématique sur `fuzz.ratio()` du titre, lignes 191-195, même mécanisme que documenté section UNGM) :
```
$ python3 -c "
from rapidfuzz import fuzz
t1 = 'ADDENDUM N°02 relatif aux travaux de réhabilitation des directions départementales du cadre de vie et des transports (DDCVT), de l\'annexe de la DDCVT du mono, et des divisions territoriales de come et d\'Allada'
t2 = 'Addendum N°1 au Dao 071 relatif aux travaux de réhabilitation des directions départementales du cadre de vie et des transports (DDCVT), de l\'annexe de la DDCVT du mono, et des divisions territoriales de come et d\'Allada'
print('DDCVT pair:', fuzz.ratio(t1, t2))
t3 = 'Addendum n°2 DAOI N°022 relatif à l\'équipement et mise en exploitation du data center et du réseau local CAM'
t4 = 'Addendum n°1 DAOI N°022 relatif à l\'équipement et mise en exploitation du data center et du réseau local CAM'
print('DAOI 022 pair:', fuzz.ratio(t3, t4))
"
DDCVT pair: 93.92523364485982
DAOI 022 pair: 99.07407407407408
```
Les deux paires dépassent très largement le seuil configuré de 75 % (`tenderai-infra/settings.yaml`, `deduplication_threshold: 0.75`, `deduplication_method: "hash_similarity"`) — **« Addendum N°1 » et « Addendum N°02 »/« n°1 »/« n°2 » d'un même marché sont des documents distincts** (chacun modifie ou complète l'appel d'offres à un moment différent, avec potentiellement des changements de délai ou de spécifications), pas des doublons du même avis, mais leur titre quasi identique déclenche systématiquement la similarité fuzzy et **le premier des deux atteint reste seul dans `unique_items`, l'autre est éliminé silencieusement**. Nuance notée : la paire DDCVT (travaux de réhabilitation, sans pertinence IT évidente) a un impact pratique faible ; la paire DAOI N°022 (data center/réseau local, cf. mots-clés IT ci-dessus) est la plus préoccupante — mais son avis original et son propre « Addendum n°1 » étaient de toute façon déjà hors de portée du fetch (page 2, gap ci-dessus), donc l'impact net aujourd'hui de ce bug de dédoublonnage se limite à empêcher que « Addendum n°1 DAOI N°022 » ne soit jamais visible même le jour où la pagination serait corrigée.
- `persist_notices.json` : `{}` (vide) — run entier en échec avant tout commit (Finding #1). Répartition du batch de 24 items (Finding #1) : **UEMOA a contribué 8 des 24 items** envoyés à `persist_notices`, tous les 8 survivants de `deduplicate.json` ci-dessus (dont « Renouvellement des licences et support Microsoft o365 » et « Addendum n°2 DAOI N°022 … data center et … réseau local », les deux items UEMOA manifestement pertinents IT ayant survécu jusque-là).
- `notices` (DB, `source_id=11`) : **0 ligne** (requête Step 3 exécutée le 2026-09-02) :
```
$ ssh -i ~/.ssh/id_ed25519 tender-ai@195.35.48.198 \
  "docker exec staging_postgres psql -U tenderai -d tenderai_bf -c \
  \"SELECT n.id, n.title, n.ref_no, n.deadline_at, n.is_duplicate, n.duplicate_of_id, cns.is_relevant, cns.relevance_score, cns.classification_method FROM notices n LEFT JOIN company_notice_status cns ON cns.notice_id=n.id AND cns.company_id=1 WHERE n.source_id=11 ORDER BY n.created_at DESC LIMIT 50;\""

 id | title | ref_no | deadline_at | is_duplicate | duplicate_of_id | is_relevant | relevance_score | classification_method
----+-------+--------+-------------+--------------+-----------------+-------------+-----------------+------------------------
(0 rows)
```
Résultat attendu et non spécifique à UEMOA (Finding #1, avertissement en tête de section BF) : les 8 items UEMOA survivants ont été engloutis, comme les items Joffres.net et UNGM, par le `DatetimeFieldOverflow` transversal provoqué par une notice UNGM distincte dans la même transaction tout-ou-rien. Aucune ligne `company_notice_status` n'existe (livraison jamais déclenchée) : aucun faux positif de classification ne peut être vérifié pour cette source sur ce run.

**Gaps constatés :**

| Titre | Vu par le pipeline ? | Étage où perdu/faux positif | Cause racine | Étiquette (bug/archi/techno) | Sévérité | Preuve |
|---|---|---|---|---|---|---|
| Avis d'appel d'offres international relatif à l'équipement et mise en exploitation du data center et du réseau local CAM (avis original du marché DAOI N°022, page 2 du listing live) — matche littéralement les mots-clés IT « data center » et « réseau local » | Non | Fetch (`fetch_listings`, branche `html-tender`) | `max_pages: 1` dans `patterns` (DB) sans `pagination_url` configuré — la boucle de pagination générique de `fetch_html_tender.py` (lignes 42-48) ne se déclenche jamais ; le même mécanisme est actif et fonctionnel pour Enabel (`max_pages: 3` + `pagination_url`), confirmant un défaut de configuration ponctuel, pas de code | bug logique | Critique | `patterns` DB (`max_pages:1`, pas de `pagination_url`) vs `patterns` Enabel ; pager live « Dernière page » → `?page=19` ; titre confirmé en page 2 (`uemoa_live_p2.html`, curl) |
| Appel d'offres ouvert N° 023/2026/AO/COM/UEMOA relatif au renouvellement du contrat de licences Microsoft Enterprise Agreement (EA) (page 2 du listing live) — même famille IT que l'item Microsoft o365 vu en page 0 | Non | Fetch (`fetch_listings`, branche `html-tender`) | Même cause que ci-dessus | bug logique | Critique | Idem — titre confirmé en page 2 (curl) |
| Les ~182 autres avis des pages 1 à 19 jamais récupérés (194 avis au total sur le listing complet — pages 0 à 18 pleines à 10, page 19 partielle à 4 — contre 10 vus par le pipeline) | Non | Fetch (`fetch_listings`, branche `html-tender`) | Même cause — perte structurelle sur ~94,8 % du listing, pas un cas isolé | bug logique | Critique | Pager « Dernière page » → `?page=19` ; 0 chevauchement vérifié par intersection d'ensembles Python entre les items des pages 0, 1, 2 (30 avis strictement distincts sur 3 pages) |
| Addendum N°1 au Dao 071 relatif aux travaux de réhabilitation des DDCVT (…) | Oui, jusqu'à `parse_extract` inclus (10/10) ; perdu à `deduplicate` | Dédoublonnage (`deduplicate`, méthode `hash_similarity`) | Faux positif de similarité fuzzy sur titre gabarit (`fuzz.ratio` = 93,9 % > seuil 75 %) entre deux addenda distincts (N°1 et N°02) du même DAO 071 — références vides des deux côtés, court-circuit de comparaison exacte jamais applicable | bug logique | Modérée (perte réelle et vérifiée, mais pertinence IT non évidente — travaux de réhabilitation de bâtiments) | `parse_extract.json` : 10/10 UEMOA présents ; `deduplicate.json` : 8/10, item absent sans `duplicate_of_id` ; calcul indépendant `rapidfuzz.fuzz.ratio()` = 93,92523... ; `tenderai-infra/settings.yaml` (seuil 0.75, méthode hash_similarity) |
| Addendum n°1 DAOI N°022 relatif à l'équipement et mise en exploitation du data center et du réseau local CAM — matche littéralement les mots-clés IT « data center »/« réseau local » | Oui, jusqu'à `parse_extract` inclus (10/10) ; perdu à `deduplicate` | Dédoublonnage (`deduplicate`, méthode `hash_similarity`) | Même mécanisme que ci-dessus, `fuzz.ratio` = 99,1 % > seuil 75 % vs « Addendum n°2 DAOI N°022 » (qui, lui, a survécu) | bug logique | Modérée (bug réel et distinct du gap de pagination ci-dessus, mais impact net aujourd'hui limité car l'avis original et cet addendum sont de toute façon déjà hors de portée du fetch à cause de `max_pages:1`) | `deduplicate.json` : 8/10, item absent ; calcul indépendant `rapidfuzz.fuzz.ratio()` = 99,07407... |
| Les 8 avis UEMOA ayant survécu jusqu'à `deduplicate` (dont « Renouvellement des licences et support Microsoft o365 » et « Addendum n°2 DAOI N°022 … data center et … réseau local », tous deux manifestement pertinents IT) | Oui, jusqu'à `deduplicate` inclus (8/8, tous `is_duplicate: false`) | Persist (`persist_notices`) | Non spécifique à UEMOA : transaction unique tout-ou-rien du run BF entier (`persist_notices.py`, un seul `db.commit()` après la boucle) qui échoue à cause d'une notice **UNGM** distincte (`LRFP-2026-9205898`) — voir Finding #1 | bug logique | Critique | `deduplicate.json` : 8 items `source: "UEMOA - Appels d'offres"`, tous `is_duplicate: false` ; Finding #1 (batch INSERT de 24 lignes dont 8 UEMOA) ; requête SQL Step 3 (`source_id=11`) → 0 lignes |

**Verdict :** UEMOA cumule deux défauts indépendants, tous deux corrigibles par un changement de configuration/code localisé (aucune limite architecturale ni technologique) :

1. **Fetch — perte massive par pagination absente** (le défaut le plus sévère, en volume comme en netteté de la preuve) : le listing live compte 194 avis répartis sur 20 pages server-side (`?page=0` à `?page=19`, pagination GET classique sans JS), le pipeline n'en récupère que 10 (la page 0) à cause de `max_pages: 1` combiné à l'absence de `pagination_url` dans `patterns` — soit **~94,8 % du listing jamais vu**, dont au moins 2 avis manifestement pertinents IT identifiés en page 2 seule (le marché data center/réseau local CAM et son renouvellement de licences Microsoft EA). Il ne s'agit ni d'un blocage anti-bot (aucune erreur, `status: "success"` constant) ni d'une limite du fetcher : le mécanisme de boucle de pagination existe déjà dans `fetch_html_tender.py` et **fonctionne activement pour Enabel**, la source BF voisine utilisant le même `parser_type`. Corriger `max_pages` et ajouter un `pagination_url` dans les `patterns` de la source UEMOA en DB suffirait — c'est un changement de configuration, pas de code, à plus forte raison **bug logique** et non une limite architecturale.
2. **Dédoublonnage — deux faux positifs de similarité vérifiés**, même mécanisme que documenté section UNGM : des addenda successifs d'un même marché (N°1, N°02/n°2) partagent un gabarit de titre à 93,9 % et 99,1 % de similarité, au-dessus du seuil 75 % configuré, et sont fusionnés à tort alors qu'ils sont des documents distincts (chacun peut porter une information nouvelle — report de délai, modification de spécification). Un de ces deux cas concerne directement le marché IT data center/réseau local CAM, mais son impact pratique aujourd'hui reste subordonné au gap de pagination ci-dessus (l'avis original de ce marché n'est de toute façon pas atteint par le fetch).

`ssl_verify: false` a été vérifié corrélé à un problème de certificat serveur réel et reproductible (chaîne TLS incomplète côté `www.uemoa.int`, confirmé indépendamment par `curl`/`openssl s_client`) — **ce n'est pas un gap** : le paramètre fonctionne comme contournement légitime, `fetch_listings.json` ne montre aucune trace d'échec réseau/TLS pour cette source sur le run audité.

Sévérité globale de la source : **critique**, portée principalement par la perte de pagination (~185 avis actifs/jour jamais vus, dont des marchés IT identifiés) ; le crash transversal du Finding #1 a ensuite empêché même les 8 avis survivants (dont 2 manifestement pertinents IT) d'atteindre la base de données ce jour précis — un problème indépendant de UEMOA lui-même, déjà documenté et dont la source n'est pas responsable.

### Enabel (source id 12, parser_type html-tender)

**Particularité structurelle de cette source :** même fetcher générique piloté par `patterns` que UEMOA (`src/tenderai/agents/nodes/fetch_html_tender.py`, aucun code spécifique à Enabel). Configuration en base pour `source_id=12` (requête exécutée le 2026-09-02) :
```
$ ssh -i ~/.ssh/id_ed25519 tender-ai@195.35.48.198 \
  "docker exec staging_postgres psql -U tenderai -d tenderai_bf -c \
  \"SELECT id, name, parser_type, list_url, patterns FROM sources WHERE id=12;\""

 id |                 name                  | parser_type |                               list_url                                |                                                                                                                                                           patterns
----+---------------------------------------+-------------+-----------------------------------------------------------------------+------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 12 | Enabel - Marchés publics Burkina Faso | html-tender | https://www.enabel.be/fr/marches-publics/?in_country=1726&is_status=0 | {"entity": "Enabel", "location": "Burkina Faso", "max_pages": 3, "card_selector": "div.card--news.card--tenders", "pagination_url": "https://www.enabel.be/fr/marches-publics/page/{page}/?in_country=1726&is_status=0", "title_selector": "p.h5 span", "deadline_selector": "p", "deadline_text_prefix": "Date de clôture"}
(1 row)
```
`max_pages: 3` **et** `pagination_url` configurés (contrairement à UEMOA, Tâche 5) — la boucle de pagination générique de `fetch_html_tender.py` (lignes 46-48 : `if max_pages > 1 and pagination_url: for page in range(2, max_pages+1): urls.append(pagination_url.format(page=page))`) se déclenche bel et bien pour Enabel. **Point notable, absent des deux autres sources `html-tender`/pagination-adjacentes déjà auditées (UEMOA, UNGM) :** contrairement à UEMOA (`pdf_selector: "a[href*='opportunite_affaire']"`), les `patterns` d'Enabel **ne définissent aucun `pdf_selector`** — chaque avis Enabel publie pourtant une PDF ("Cahier des charges") distincte par avis dans le HTML lui-même (voir Step 2 ci-dessous), non exploitée par le fetcher faute de sélecteur configuré.

**Vérité terrain — méthode et disclosure de l'écart de date (conforme à la consigne du brief) :** collectée le **2026-09-02, ~16h55 UTC, soit un jour après le run audité (2026-09-01)**. Comme pour UEMOA (Tâche 5), `curl` a été utilisé à la place du navigateur Chrome — justifié de la même façon : `html-tender` est un fetcher server-rendered (pas de JS requis, pagination `?page=N`-style ou `/page/N/`-style classique), donc `curl` est équivalent au rendu réel de la page. Pour compenser l'écart d'un jour, un **cross-check empirique titre-par-titre et deadline-par-deadline** entre le listing live du 2026-09-02 et le `fetch_listings.json` du 2026-09-01 a été effectué (voir "Résultat du pipeline" ci-dessous) — les 3 titres et les 3 deadlines sont identiques à la lettre près, confirmant l'absence de dérive de contenu entre les deux dates.

Page racine (`list_url`, `?in_country=1726&is_status=0`) et pagination jusqu'à la page 5 (au-delà des `max_pages: 3` configurés, pour vérifier explicitement l'absence d'une page 4+ contenant plus d'avis) :
```
$ for p in "" "page/2/" "page/3/" "page/4/" "page/5/"; do
  url="https://www.enabel.be/fr/marches-publics/${p}?in_country=1726&is_status=0"
  curl -s -o <fichier> -w "url=$url HTTP_STATUS:%{http_code} SIZE:%{size_download}\n" \
    "$url" -A "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
done
url=https://www.enabel.be/fr/marches-publics/?in_country=1726&is_status=0 HTTP_STATUS:200 SIZE:124717
url=https://www.enabel.be/fr/marches-publics/page/2/?in_country=1726&is_status=0 HTTP_STATUS:200 SIZE:120162
url=https://www.enabel.be/fr/marches-publics/page/3/?in_country=1726&is_status=0 HTTP_STATUS:200 SIZE:120160
url=https://www.enabel.be/fr/marches-publics/page/4/?in_country=1726&is_status=0 HTTP_STATUS:200 SIZE:120161
url=https://www.enabel.be/fr/marches-publics/page/5/?in_country=1726&is_status=0 HTTP_STATUS:200 SIZE:120159
```
Comptage indépendant des cartes tender (`div.card--news.card--tenders`, sélecteur exact utilisé par le pipeline) sur chaque page téléchargée :
```
$ for f in p0.html page_2_.html page_3_.html page_4_.html page_5_.html; do
  echo -n "$f: "; grep -o 'card--news card--tenders' "$f" | wc -l
done
p0.html: 3
page_2_.html: 0
page_3_.html: 0
page_4_.html: 0
page_5_.html: 0
```
**Aucune trace de pagination active dans le HTML de la page 0** (`grep -o 'page/[0-9]*/' p0.html` ne renvoie aucun lien de pagination), aucun message « aucun résultat »/erreur distinguable sur les pages 2-5 (même gabarit HTML exact que la page 0, seule la classe `paged-N`/`page-paged-N` du `<body>` change, confirmé par `diff` entre pages consécutives — pas une page d'erreur ou de blocage). **Conclusion vérité terrain : le site ne compte actuellement que 3 avis actifs au total pour ce filtre pays, tous sur la page 0 ; aucune page 4+ (ni même page 2/3) avec des avis supplémentaires n'existe.** `max_pages: 3` est donc une valeur généreuse mais **non fautive** ici — à la différence de UEMOA (`max_pages: 1` face à 194 avis réels sur 20 pages), Enabel n'a structurellement pas de pagination manquante : le nombre de pages réellement configurées (3) couvre très largement le nombre de pages réellement nécessaires (1).

Les 3 avis vérité terrain (titres et deadlines extraits indépendamment du HTML brut de `p0.html`, sélecteurs `p.h5 span` / `Date de clôture :`) :
```
$ python3 -c "
import re
html = open('p0.html', encoding='utf-8').read()
for m in re.finditer(r'<p class=\"h5\"[^>]*>\s*<span[^>]*>(.*?)</span>', html, re.S):
    print(repr(m.group(1)))
"
'\n  BFA23004-10084 &#8211;\n  Acquisition de matériel spécifique pour apprenants handicapés\n  '
'\n  BFA22002-10159 &#8211;\n  Acquisition et installation d&rsquo;équipements d'intrant au profit des entreprises agroalimentaires\n  '
'\n  BFA23002-10044 &#8211;\n  Fourniture, livraison et installation d'équipements médico-techniques pour les districts sanitaires de Boromo et de Houndé\n  '

$ python3 -c "
import re
html = open('p0.html', encoding='utf-8').read()
for m in re.finditer(r'.{20}Date de cl.ture.{150}', html, re.S): print(repr(m.group(0)))
"
'...Date de clôture : </strong> 14 September 2026 12:00 </p>...'
'...Date de clôture : </strong> 07 September 2026 12:00 </p>...'
'...Date de clôture : </strong> 08 September 2026 12:00 </p>...'
```
1. BFA23004-10084 – Acquisition de matériel spécifique pour apprenants handicapés (deadline 14/09/2026) — équipement pédagogique adapté, **aucun mot-clé IT/mots-clés de classification** (Contraintes globales) ne matche.
2. BFA22002-10159 – Acquisition et installation d'équipements d'intrant au profit des entreprises agroalimentaires (deadline 07/09/2026) — équipement agro-industriel, **aucun mot-clé IT ne matche**.
3. BFA23002-10044 – Fourniture, livraison et installation d'équipements médico-techniques pour les districts sanitaires de Boromo et de Houndé (deadline 08/09/2026) — équipement médico-technique, **aucun mot-clé IT ne matche** (« équipement » seul n'est pas dans la liste ; la liste exige des termes composés comme « équipement informatique »/« matériel informatique »).

Chaque carte contient par ailleurs un lien PDF « Cahier des charges » propre et distinct par avis (vérifié dans le HTML brut) :
```
$ python3 -c "
import re
html = open('p0.html', encoding='utf-8').read()
cards = re.split(r'card--news card--tenders', html)[1:]
for i, c in enumerate(cards):
    print(f'card {i}:', re.findall(r'href=\"([^\"]+\\.pdf)\"', c[:3000])[:1])
"
card 0: ['https://www.enabel.be/app/uploads/2026/08/BFA23004-10084_Cahier-des-charges-2.pdf']
card 1: ['https://www.enabel.be/app/uploads/2026/08/BFA-22002-10159_Cahier-des-charges.pdf']
card 2: ['https://www.enabel.be/app/uploads/2026/08/BFA23002-10044_Cahier_Charges-1-1.pdf']
```
— information exploitée plus bas (Step 2) pour identifier la cause exacte de la perte à l'étage `extract_item_links`.

**Résultat du pipeline (run `785adda4-f28c-4f3c-af0a-74b7e775d0b5`, fetch à 2026-09-01 21:20:49 UTC) :**

- `fetch_listings.json` (`grep -i "enabel" -A5 fetch_listings.json`) : `status: "success"`, `error: null`, `patterns` en sortie **identiques** à la config DB ci-dessus (mêmes clés, y compris l'absence de `pdf_selector`). **3 listings au total** — **correspondance exacte, titre pour titre et deadline pour deadline, avec la vérité terrain du 2026-09-02 ci-dessus** (`BFA23004-10084` / `14 September 2026 12:00`, `BFA22002-10159` / `07 September 2026 12:00`, `BFA23002-10044` / `08 September 2026 12:00`) — confirme empiriquement l'absence de dérive de contenu malgré l'écart d'un jour entre le run audité et la collecte de vérité terrain :
```
$ python3 -c "
import json
d = json.load(open('fetch_listings.json'))
entry = [e for e in d[0]['data'] if e.get('url','').startswith('https://www.enabel.be')][0]
print('status:', entry['status'], '| listings:', len(entry['listings']))
for l in entry['listings']: print(' -', l['title'], '|', l['deadline'])
"
status: success | listings: 3
 - BFA23004-10084 – Acquisition de matériel spécifique pour apprenants handicapés | 14 September 2026 12:00
 - BFA22002-10159 – Acquisition et installation d'équipements d'intrant au profit des entreprises agroalimentaires | 07 September 2026 12:00
 - BFA23002-10044 – Fourniture, livraison et installation d'équipements médico-techniques pour les districts sanitaires de Boromo et de Houndé | 08 September 2026 12:00
```
Chaque item porte `"url": "https://www.enabel.be/fr/marches-publics/?in_country=1726&is_status=0"` (l'URL de la page de listing elle-même, identique pour les 3) : `_extract_cards()` (`fetch_html_tender.py` lignes 131-138) n'affecte `item_url = page_url` que par défaut, faute de `pdf_sel` configuré pour cette source — les 3 liens PDF distincts par avis (vérifiés ci-dessus dans le HTML brut) existent bien mais ne sont jamais extraits, faute de `pdf_selector` dans `patterns`. **Les 3 pages configurées (`max_pages: 3`) ont bien été sollicitées par le code** (la boucle `urls = [list_url, page/2, page/3]` se déclenche puisque `pagination_url` est présent) ; le fait que le total de `listings` (3) corresponde exactement au nombre de cartes trouvées sur la seule page 0 de la vérité terrain (les pages 2/3 étant vérifiées vides ci-dessus, à un jour d'écart) est cohérent avec des pages 2/3 déjà vides le 2026-09-01 également — **nuance méthodologique honnête :** le nœud n'enregistre qu'un total agrégé par source (pas de détail par page), et les échecs de fetch par page sont capturés uniquement par `logger.warning()` (ligne 63-69 du fetcher), jamais renvoyés dans le JSON de sortie ni conservés (`docker logs` de ce run non disponibles, même limite que documentée section DGCMEF) — il n'est donc pas possible de prouver à 100% que les pages 2/3 ont réussi plutôt qu'échoué silencieusement le 09-01 ; cependant, la correspondance exacte du compte et du contenu avec la vérité terrain du lendemain (où les pages 2-5 sont confirmées vides, pas en erreur) rend cette hypothèse largement la plus probable. **Aucun signe de page 4+ avec des avis supplémentaires — le fetch n'est pas en cause pour cette source, contrairement à UEMOA/UNGM.**
- `extract_item_links.json` : **1/3 seulement** survit :
```
$ python3 -c "
import json
d = json.load(open('extract_item_links.json'))
data = d[0]['data']
for i in data:
    if 'enabel' in str(i.get('source','')).lower():
        print(i.get('title'), '|', i.get('url'))
"
BFA23004-10084 – Acquisition de matériel spécifique pour apprenants handicapés | https://www.enabel.be/fr/marches-publics/?in_country=1726&is_status=0
```
**Cause racine identifiée avec certitude dans le code (`extract_item_links.py`) :** pour `parser_type in ("html-tender", "crawl4ai")` (lignes 533-541), la clé de déduplication est `url = link.get("url") or link.get("link", "")`, insérée dans un unique set `seen_urls` **partagé entre toutes les sources du run** — or les 3 items Enabel partagent tous exactement la même `url` (celle de la page de listing, voir ci-dessus, faute de `pdf_selector`). Le premier item rencontré (`BFA23004-10084`) passe le test `key not in seen_urls` ; les deux suivants (`BFA22002-10159`, `BFA23002-10044`), avec la **même** clé, sont silencieusement rejetés comme « doublons » alors qu'il s'agit de 3 avis réels et distincts (références, titres, deadlines tous différents). C'est un artefact de collision d'URL introduit par l'absence de configuration `pdf_selector`, pas une déduplication légitime.
- `fetch_items.json` : le survivant unique (`BFA23004-10084`) passe intact, `status: "success"`.
- `parse_extract.json` (27 items au total toutes sources BF confondues) : **1/1** Enabel survit (`Counter({'ungm': 15, "UEMOA - Appels d'offres": 10, 'Enabel - Marchés publics Burkina Faso': 1, 'joffres.net': 1})`, cf. sections UNGM/UEMOA) — aucune perte supplémentaire à cet étage, cohérent avec le fait qu'il ne restait déjà plus qu'un seul item Enabel en entrée.
- `deduplicate.json` (24 items uniques au total) : **1/1** — le survivant passe `is_duplicate: false` (`Counter({'ungm': 14, "UEMOA - Appels d'offres": 8, 'Enabel - Marchés publics Burkina Faso': 1, 'joffres.net': 1})`), non fusionné à tort avec un autre avis.
- `persist_notices.json` : `{}` (vide) — run entier en échec avant tout commit (Finding #1, avertissement en tête de section BF). Répartition du batch de 24 items (Finding #1) : **Enabel a contribué 1 des 24 items** (`BFA23004-10084`), le seul survivant à avoir atteint `persist_notices`.
- `notices` (DB, `source_id=12`) : **0 ligne** (requête Step 3 exécutée le 2026-09-02). Requête et sortie brute :
```
$ ssh -i ~/.ssh/id_ed25519 tender-ai@195.35.48.198 \
  "docker exec staging_postgres psql -U tenderai -d tenderai_bf -c \
  \"SELECT n.id, n.title, n.ref_no, n.deadline_at, n.is_duplicate, n.duplicate_of_id, cns.is_relevant, cns.relevance_score, cns.classification_method FROM notices n LEFT JOIN company_notice_status cns ON cns.notice_id=n.id AND cns.company_id=1 WHERE n.source_id=12 ORDER BY n.created_at DESC LIMIT 50;\""

 id | title | ref_no | deadline_at | is_duplicate | duplicate_of_id | is_relevant | relevance_score | classification_method
----+-------+--------+-------------+--------------+-----------------+-------------+-----------------+------------------------
(0 rows)
```
Résultat attendu et non spécifique à Enabel (Finding #1, avertissement en tête de section BF) : le seul survivant Enabel a été englouti, comme les items Joffres.net/UEMOA/UNGM, par le `DatetimeFieldOverflow` transversal provoqué par une notice UNGM distincte dans la même transaction tout-ou-rien. Aucune ligne `company_notice_status` n'existe (livraison jamais déclenchée) : aucun faux positif de classification ne peut être vérifié pour cette source sur ce run — de toute façon, aucun des 3 avis Enabel ne matche un mot-clé de la liste de classification (voir ci-dessus), donc aucun candidat plausible à un faux positif n'existe pour cette source.

**Gaps constatés :**

| Titre | Vu par le pipeline ? | Étage où perdu/faux positif | Cause racine | Étiquette (bug/archi/techno) | Sévérité | Preuve |
|---|---|---|---|---|---|---|
| BFA22002-10159 – Acquisition et installation d'équipements d'intrant au profit des entreprises agroalimentaires | Oui, jusqu'à `fetch_listings` inclus (1 des 3 listings) ; perdu à `extract_item_links` | Dédoublonnage (`extract_item_links`, clé URL) | Absence de `pdf_selector` dans les `patterns` Enabel (DB) → `fetch_html_tender.py::_extract_cards()` assigne la même `url` (celle de la page de listing) aux 3 cartes → `extract_item_links.py` (lignes 533-541) déduplique par `url` dans un set global `seen_urls` partagé entre sources → seul le 1er item rencontré (`BFA23004-10084`) survit, celui-ci est éliminé à tort comme "doublon" alors qu'il s'agit d'un avis distinct (lien PDF propre, `BFA-22002-10159_Cahier-des-charges.pdf`, vérifié présent dans le HTML mais jamais extrait) | bug logique | Critique | `fetch_listings.json` : 3 listings, tous `"url"` identiques ; `extract_item_links.json` : 1/3 survivants ; `extract_item_links.py` lignes 533-541 (clé de dedup = `url`) ; HTML brut vérité terrain (`p0.html`) : lien PDF distinct confirmé par carte |
| BFA23002-10044 – Fourniture, livraison et installation d'équipements médico-techniques pour les districts sanitaires de Boromo et de Houndé | Oui, jusqu'à `fetch_listings` inclus (1 des 3 listings) ; perdu à `extract_item_links` | Dédoublonnage (`extract_item_links`, clé URL) | Même cause racine que ci-dessus — 3ᵉ carte, même collision d'URL, éliminée pour la même raison (lien PDF propre `BFA23002-10044_Cahier_Charges-1-1.pdf` vérifié présent mais jamais extrait) | bug logique | Critique | Idem — `extract_item_links.json` : 1/3 survivants ; HTML brut vérité terrain : lien PDF distinct confirmé |
| BFA23004-10084 – Acquisition de matériel spécifique pour apprenants handicapés (seul survivant Enabel à atteindre `deduplicate`/`persist_notices`) | Oui, jusqu'à `deduplicate` inclus (`is_duplicate: false`, 1/1 survivant) | Persist (`persist_notices`) | Non spécifique à Enabel : transaction unique tout-ou-rien du run BF entier (`persist_notices.py`, un seul `db.commit()` après la boucle) qui échoue à cause d'une notice **UNGM** distincte (`LRFP-2026-9205898`) — voir Finding #1 | bug logique | Critique | `deduplicate.json` : 1 item `source: "Enabel - Marchés publics Burkina Faso"`, `is_duplicate: false` ; Finding #1 (batch INSERT de 24 lignes dont 1 Enabel) ; requête SQL Step 3 (`source_id=12`) → 0 lignes |

Aucun cas de faux positif de classification à documenter pour cette source : aucune ligne `company_notice_status` n'existe (livraison jamais déclenchée), et aucun des 3 avis Enabel de ce run ne matche de toute façon un mot-clé de la liste de classification configurée (Contraintes globales) — pas de candidat plausible à vérifier.

**Verdict :** Enabel cumule deux défauts indépendants, tous deux corrigibles par un changement de configuration/code localisé (aucune limite architecturale ni technologique) :

1. **Dédoublonnage — perte majoritaire par collision d'URL, pas par pagination manquante** (défaut le plus sévère en proportion — 2 des 3 avis actifs, soit ~67 %, perdus chaque run de façon parfaitement reproductible) : à la différence de UEMOA (Tâche 5, `max_pages: 1` sans `pagination_url`) et de UNGM (Tâche 4, `PageIndex` câblé en dur), **la pagination d'Enabel n'est pas en cause** — `max_pages: 3` + `pagination_url` sont correctement configurés, le code boucle bien sur les 3 pages, et la vérité terrain confirme qu'il n'existe aujourd'hui que 3 avis actifs au total, tous sur la page 0 (pages 2 à 5 vérifiées vides, aucune page 4+ avec plus d'avis). Le vrai défaut est en aval, à l'étage `extract_item_links` : l'absence de `pdf_selector` dans les `patterns` Enabel fait que les 3 cartes de la page 0 partagent toutes la même `url` (celle de la page de listing), et la déduplication par `url` de `extract_item_links.py` (set global `seen_urls`, lignes 533-541) élimine à tort 2 des 3 avis comme "doublons". Corrigible de deux façons locales et indépendantes, sans refonte : (a) ajouter `"pdf_selector": "a[href$='.pdf']"` (ou plus spécifique) aux `patterns` Enabel en DB — pur changement de configuration, chaque carte porterait alors son propre lien PDF distinct comme `url` ; ou (b) durcir la clé de dedup de la branche `html-tender`/`crawl4ai` dans `extract_item_links.py` pour retomber sur un identifiant combiné (titre+index) quand plusieurs items d'une même source partagent une `url` identique. Aucune des deux options ne touche à l'architecture ni à la techno du fetcher.
2. **Persist — contribution passive au crash transversal du Finding #1** : le seul avis Enabel ayant survécu jusqu'à `deduplicate` (`BFA23004-10084`) a été englouti, comme pour toutes les autres sources BF de ce run, par la transaction `persist_notices` unique et tout-ou-rien cassée par une notice UNGM distincte — aucune particularité à Enabel dans ce mécanisme, déjà documenté au Finding #1 et dans les sections Joffres.net/UEMOA/UNGM.

Nuance importante sur l'impact métier réel aujourd'hui : **aucun des 3 avis Enabel de ce run — ni les 2 perdus à `extract_item_links`, ni le survivant — ne matche un mot-clé de la liste de classification IT configurée** (Contraintes globales : équipement pédagogique pour apprenants handicapés, équipement agro-industriel, équipement médico-technique — aucun terme composé du type « matériel informatique »/« équipement informatique » ne s'applique). Le bug de collision d'URL est réel, systématique et sévère en proportion (67 % de perte, 100 % reproductible), mais son impact concret pour une entreprise cliente IT est nul sur les avis vus ce jour précis — à la différence de UEMOA où au moins 2 avis manifestement pertinents IT étaient concernés par la perte de pagination.

Sévérité globale de la source : **critique** pour le mécanisme du bug (perte systématique et déterministe de 67 % des avis à chaque run, cause root parfaitement identifiée), **mais impact métier nul à date** faute d'avis IT-pertinent parmi les 3 avis actuellement publiés par cette source — combinée à la perte du seul survivant par le crash transversal déjà documenté (Finding #1), Enabel n'a contribué aucune notice à la base aujourd'hui, comme toutes les autres sources BF de ce run.

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
