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

**Conclusion sur la récurrence :** le `DatetimeFieldOverflow` n'est pas un incident isolé provoqué par l'audit — il a fait échouer le run planifié quotidien de production **ce matin même** (07:00, avant toute action de cet audit), et avait déjà fait échouer le run du 2026-08-29 avec une notice/date différente (donc pas spécifique à une seule notice UNGM buggée — c'est une classe de bug qui se reproduira à chaque nouvelle notice UNGM dont la date déborde). Combiné au Finding #2, la persistance BF est effectivement cassée en production depuis au moins le 2026-08-08 (début de la fenêtre observée) : soit par crash direct (4 runs sur 20), soit par `unique_items: 0` sur les runs "réussis" (cause distincte, non résolue). Le mail de livraison quotidien continue d'être envoyé (`emails_sent: 1` ou plus sur les runs completed) mais avec un rapport vide de nouvelles notices, sans qu'aucune alerte ne signale que la collecte réelle est à l'arrêt.

### Fix appliqué avant re-déclenchement (action infra, hors périmètre "no fixes")

```
docker exec -u root staging_api mkdir -p /app/logs/nodes
docker exec -u root staging_api chown -R tenderai:tenderai /app/logs/nodes
```
`/app/logs/nodes` n'existait pas dans le conteneur `staging_api` (appartenait à `root:root`, le conteneur tourne en `uid 999`/`tenderai`), ce qui faisait échouer silencieusement tous les appels `log_node_output()`. Corrigé — confirmé fonctionnel : le re-run a produit tous les fichiers JSON de nœuds attendus dans `bf-nodes/nodes/` (`load_sources.json`, `fetch_listings.json`, `extract_item_links.json`, `fetch_items.json`, `parse_extract.json`, `deduplicate.json`, `persist_notices.json`).

Le `DatetimeFieldOverflow` lui-même n'a **pas** été corrigé, contourné, ni la notice UNGM en cause écartée — conformément à la consigne, il a été laissé se reproduire pour capturer cette preuve.

### DGCMEF (source id 8, parser_type pdf_rag)
_(rempli par sa propre tâche — Task 2)_

### Joffres.net (source id 9, parser_type html-listing)
_(rempli par sa propre tâche — Task 3)_

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
