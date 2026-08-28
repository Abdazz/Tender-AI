# État du projet — TenderAI BF

**Document de suivi central.** À mettre à jour à chaque session qui avance un chantier — ne pas laisser l'état se déduire uniquement des messages de commit.

**Dernière mise à jour :** 2026-08-28 (session 2), par une session Claude Code — cutover staging (tâche 12) exécuté côté backend/infra : CI `tenderai-backend` réparée (accès GHCR + 7 autres bugs infra), images `:staging` `api`/`worker` poussées, déploiement `tenderai-infra` sur le serveur staging réussi, `/health` répond 200. **Mais bug découvert côté frontend : le cutover staging n'est PAS complet** — voir section "Chantier 1" ci-dessous.

## Vue d'ensemble — refonte SaaS (4 chantiers)

| # | Chantier | État | Porté par |
|---|---|---|---|
| 0 | Multi-company — data model (préalable aux 4 chantiers) | ✅ Terminé | `main`, `staging` (monorepo) |
| 1 | Séparation du monorepo en 3 repos | 🟡 11/14 tâches — tâche 12 (cutover staging) à moitié faite : backend+infra OK, **frontend pas rebuild, CI cassée** | 3 repos GitHub séparés |
| 2 | Modernisation des dépendances | ✅ Terminé (2 sous-projets) | Synced dans `tenderai-backend/staging` |
| 3 | Pipeline split (harvest/delivery multi-company) | ✅ **Terminé** (16/16 tâches + revue finale + fix wave) | `tenderai-backend`, branche `staging` (poussé sur GitHub) |
| 4 | Audit qualité des pipelines | ⬜ Pas commencé | À faire sur `tenderai-backend` |

**Règle appliquée depuis le 2026-08-27 :** tout travail postérieur au chantier 1 (repo-split) se fait sur les nouveaux repos, jamais sur le monorepo. Le monorepo `Tender-AI` (ce dépôt) n'accueille plus aucun développement backend/pipeline actif — il ne reçoit que la maintenance, les docs, et reste le dépôt de production jusqu'au cutover (tâches 12-14 du chantier 1).

## Carte des branches et repos

```
main ──────────────┐  (multi-company data model + docs chantier 1, dupliquées)
                    │
staging ────────────┤  (= main + chantier 2 + chantier 3 tâches 1-9, historique figé ici)
                    │
worktree-repo-split ┘  (identique à staging à ce point — plus de développement actif ici)

tenderai-backend/staging (le repo actif à partir de maintenant) :
  = extraction du 24/08 + sync du 27/08 rattrapant chantier 2 (upgrade
    LangChain ^1.3/LangGraph ^1.2 + lint) + chantier 3 tâches 1-9
    (commit ae9086b, 143 tests passants). Tâches 10-16 du chantier 3
    continuent ici.

tenderai-frontend, tenderai-infra : état de l'extraction du 24/08,
  rien à re-sync (aucun travail chantier 2/3 ne les concernait).

3 repos GitHub séparés (produit du chantier 1, tâches 1-11) :
  - tenderai-backend, tenderai-frontend, tenderai-infra
  - clonés localement sous /home/yulcom/web/tenderai/
  - PAS encore le repo de prod — le monorepo Tender-AI reste live tant que
    les tâches 12-14 du chantier 1 n'ont pas été exécutées.
```

**Point d'hygiène non résolu :** les docs de conception du chantier 1 (repo-split) ont été committées séparément sur `main` (commits `2e12233`/`7b6e7b3`) et sur `staging` (commits `0239d34`/`289e562`) — même contenu, hash différents. `staging` contient tout `main` par ailleurs (`main..staging` est vide côté code). À réconcilier au prochain nettoyage de branches (fusionner `main` → `staging` ou l'inverse selon quelle branche doit faire foi).

## Détail par chantier

### Chantier 0 — Multi-company : data model
- Spec : `docs/superpowers/specs/2026-08-23-multi-company-design.md`
- Plan : `docs/superpowers/plans/2026-08-23-multi-company-data-model.md`
- 8 tâches, toutes implémentées, reviewées, fix wave final appliqué.
- 18 tests pré-existants cassés (sans rapport avec le plan) réparés et documentés dans le commit `9932e35`.
- **Statut : terminé et fusionné dans `main` et `staging`.**

### Chantier 1 — Séparation du monorepo en 3 repos
- Spec : `docs/superpowers/specs/2026-08-24-repo-split-design.md`
- Plan : `docs/superpowers/plans/2026-08-24-repo-split.md` (14 tâches)
- Journal d'exécution détaillé (scratch, non versionné) : `.superpowers/sdd/2026-08-24-repo-split/progress.md` dans le worktree — **n'existe que localement sur cette machine, pas dans git.**
- Tâches 1-11 : ✅ terminées. Les 3 repos GitHub (`tenderai-backend`, `tenderai-frontend`, `tenderai-infra`) existent, sont peuplés, testés (129-130 tests passants), CI en place. Secrets GitHub Actions migrés vers `tenderai-infra` (tâche 11).
- Tâches 12-14 : ⚠️ **bloquées volontairement**, nécessitent une confirmation explicite avant exécution (irréversibles / touchent la prod) :
  - Tâche 12 : cutover staging — 🟡 **backend+infra fait le 2026-08-28, frontend PAS fait** (détail ci-dessous)
  - Tâche 13 : cutover production
  - Tâche 14 : archivage du monorepo original
- **Le monorepo `Tender-AI` reste le dépôt de production tant que ces 3 tâches n'ont pas été exécutées.**

#### Tâche 12 (cutover staging) — session du 2026-08-28 : backend/infra fait, frontend en panne

**Ce qui a été résolu cette session (8 bugs infra sur `tenderai-backend`/`tenderai-infra`) :**
`.env` absent avant `docker compose`, override compose serveur, création de branche `staging`, CI qui ne se déclenchait pas sur push `staging`, mypy bloquant (494 erreurs préexistantes → non-bloquant), suite de tests 25 min → 15 s (tests lents/intégration filtrés), accès GHCR "Manage Actions access" refusé pour `tenderai-backend` (`permission_denied: write_package` sur `tenderai-bf-api`/`tenderai-bf-worker`, corrigé manuellement par l'utilisateur dans l'UI GitHub — **le CLI/API n'a aucun endpoint pour ça sur un compte perso, seule l'UI web fonctionne**). Vérifié par un re-run complet : `tenderai-backend` CI verte (lint/test + push des 2 images `:staging`), déploiement `tenderai-infra` → serveur staging réussi, `curl https://stagingtenderai.yulcom.net/health` → `200 healthy` (DB, MinIO, SMTP tous OK).

**Bug découvert et NON résolu : le frontend déployé sur staging est un build de plus de 3 mois, sans aucun des changements multi-company.**
- `tenderai-frontend/.github/workflows/ci.yml` (post-split) ne se déclenche que sur push vers `main` (`on.push.branches: [main]`) — jamais sur `staging`, contrairement à `tenderai-backend/ci.yml` qui a été corrigé pour inclure `staging`. Un seul run existe dans l'historique Actions de ce repo, sur `main`, et il a échoué (`gh run list --repo Abdazz/tenderai-frontend` → 1 seul run, `main`, `failure`).
- Le tag `:staging` de `ghcr.io/abdazz/tenderai-bf-frontend` actuellement servi vient donc de l'ancien monorepo (`ci-cd.yml`), dont le job `build-and-push` ne tourne que sur tag `v*`, `workflow_dispatch`, ou commit contenant `[build]` dans le message — pas sur chaque push. Le dernier commit `[build]` dans l'historique est `0004854` du **2026-05-21**.
- Or tous les commits multi-company du frontend sont postérieurs à cette date : `CountryContext`/`CountrySelector`/pages `/countries` (2026-06-01), rôle `super_admin` + `country_id` JWT + guards middleware (2026-06-02), filtrage settings/sources par pays (2026-06-01/02), éditeur de requêtes Tavily (2026-06-03), gestion des destinataires (2026-06-21), adaptation Dockerfile post-split (2026-08-24).
- **Conclusion : l'image frontend en prod sur staging n'a AUCUNE des fonctionnalités multi-company/multi-pays.** Le health check `/health` de l'API ne détecte pas ce problème (il ne teste que backend/DB/MinIO/SMTP, pas le frontend).

**Action à faire pour compléter la tâche 12 (prochaine session) :**
1. Corriger `tenderai-frontend/.github/workflows/ci.yml` : ajouter `staging` à `on.push.branches` (copier le pattern déjà appliqué sur `tenderai-backend/ci.yml`).
2. Comprendre pourquoi l'unique run sur `main` a échoué (`gh run view <id> --repo Abdazz/tenderai-frontend --log-failed`) avant de compter sur cette CI.
3. Déclencher un build (push trivial sur `staging`, ou `gh workflow run` si un `workflow_dispatch` est ajouté) et vérifier que l'image `:staging` de `tenderai-bf-frontend` est bien poussée sur GHCR.
4. Re-déclencher le déploiement `tenderai-infra` (`gh workflow run deploy.yml --repo Abdazz/tenderai-infra --ref staging -f environment=staging -f image_tag=staging`) pour que le nouveau frontend soit tiré.
5. Valider visuellement dans le navigateur sur `https://stagingtenderai.yulcom.net` : sélecteur de pays, page `/countries`, filtrage settings/sources par pays, rôle `super_admin`.
6. Seulement après ça, la tâche 12 est vraiment terminée et les tâches 13 (cutover prod) et 14 (archivage monorepo) peuvent être envisagées — avec confirmation explicite de l'utilisateur au préalable, comme déjà décidé.

### Chantier 2 — Modernisation des dépendances
- Sous-projet A — upgrade LangChain/LangGraph : spec `docs/superpowers/specs/2026-08-25-langchain-langgraph-upgrade-design.md`, plan `docs/superpowers/plans/2026-08-25-langchain-langgraph-upgrade.md`. ✅ Terminé, testé (0 régression vs baseline), mergé dans `staging`.
- Sous-projet B — nettoyage ruff/lint : plan `docs/superpowers/plans/2026-08-25-ruff-lint-cleanup.md`. ✅ Terminé (ruff check clean), mergé dans `staging`.
- Les deux sont entrés dans `staging` via le commit `7235ac6` (merge du worktree vers `staging`, 2026-08-26).

### Chantier 3 — Pipeline split (harvest/delivery, support multi-company) — ✅ TERMINÉ
- Spec : `docs/superpowers/specs/2026-08-26-multi-company-pipeline-split-design.md`, plan : `docs/superpowers/plans/2026-08-27-multi-company-pipeline-split.md` (16 tâches) — les deux copiés sur `tenderai-backend` pour référence.
- But : scinder `agents/graph.py` en un graphe "harvest" (collecte + persistance, sans email) et un nouveau `delivery_graph.py` (classification + email), pour permettre plusieurs runs de livraison par entreprise cliente. **Atteint.**
- Tâches 1-9 : implémentées initialement sur le monorepo (worktree `.claude/worktrees/repo-split`), synchronisées vers `tenderai-backend/staging` le 2026-08-27 (commit `ae9086b`, avec le chantier 2 en même temps). Suite à la règle "tout travail post-chantier-1 se fait sur les nouveaux repos", **plus aucun travail n'a été fait sur le monorepo à partir de ce point.**
- Tâches 10-16 : implémentées, reviewées et corrigées directement sur `tenderai-backend/staging` (2026-08-27/28), commits `9d1a97a`..`ece90ec`.
- **Revue finale globale** (modèle le plus capable, périmètre tâches 10-16) : architecture saine, chaîne de données bout-en-bout cohérente, mais a trouvé **1 finding Critical réel** — le curseur de livraison (présence d'une ligne `CompanyNoticeStatus`) avançait à la classification, avant que la livraison (résumé/rapport/email) n'aboutisse réellement ; en cas d'échec en cours de route (MinIO, SMTP, destinataires manquants), les avis concernés n'étaient plus jamais proposés à la livraison, silencieusement — une régression par rapport au pipeline pré-scission qui était auto-réparateur. Plus 5 findings Important (destinataires créés via l'API perdant leur `company_id`, rapports livrés affichant "0 sources" et stats vides, stat `notices_persisted` jamais enregistrée, `Makefile` cassé par le changement CLI, absence de test bout-en-bout du graphe de livraison).
- **1 vague de correction** appliquée pour les 6 findings (commit `c6ff48b`), incluant un nouveau test d'intégration bout-en-bout (`tests/test_delivery_graph.py::test_delivery_graph_runs_end_to_end`) qui exécute le vrai graphe contre une DB SQLite en mémoire. Re-review scopée : les 6 findings vérifiés ADDRESSED, aucune nouvelle régression. Un correctif de documentation trivial (commit `ece90ec`) a suivi.
- État final : `ece90ec` sur `tenderai-backend/staging`, poussé sur GitHub. 158 tests passants, `ruff check`/`ruff format` propres (seules les 3 violations pré-existantes hors périmètre subsistent).
- **Dette documentée, non bloquante, laissée pour plus tard :** 8 findings Minor de la revue finale (requête `NOT IN` au lieu de `NOT EXISTS`, pas de fenêtre de date sur le premier run de livraison, cron de livraison par défaut identique au cron de harvest, etc. — détail complet dans le journal SDD de la session, maintenant supprimé, et dans le message du commit `c6ff48b`) ; le bug pré-existant de préfixe de variable d'env dans `tests/conftest.py` (`TENDERAI_DATABASE_URL` vs `DATABASE_URL`) ; deux stopgaps documentés et intentionnels (YULCOM en dur dans les endpoints API manuels et la création de destinataires, en attendant un futur plan Auth/API ; performance de la requête anti-jointure de `select_new_notices` jamais testée à l'échelle réelle).

### Chantier 4 — Audit qualité des pipelines
- Pas commencé. Aucun spec/plan écrit à ce jour.

## Règle de workflow git (obligatoire, tous repos)

Chaque repo du projet — ce monorepo **et** chacun des 3 repos produits par le chantier 1 (`tenderai-backend`, `tenderai-frontend`, `tenderai-infra`) — doit avoir une branche `staging`. Tout travail est d'abord fusionné sur `staging` (déployée, testée en conditions réelles), puis promu vers `main` seulement après validation. Jamais de fusion/push direct sur `main`. Documentée dans `CLAUDE.md`.

**Résolu (2026-08-27) :** branche `staging` créée (depuis `main`) et poussée sur les 3 repos. Clones locaux créés dans `/home/yulcom/web/tenderai/` (`tenderai-backend`, `tenderai-frontend`, `tenderai-infra`) — ils n'existaient nulle part localement avant (le chantier 1 avait travaillé depuis des dossiers `/tmp/tenderai-*-work` jetables, nettoyés après usage). `staging` n'a pas été mise comme branche par défaut sur GitHub — à faire si on veut que les PR ciblent `staging` par défaut.

## Règle de séquencement (décidée 2026-08-27, appliquée le même jour)

Décision initiale : finir le chantier 3 sur le monorepo puis re-sync `tenderai-backend` à la fin. **Révisée dans la foulée** : le principe correct est que tout travail postérieur au chantier 1 doit se faire sur les nouveaux repos dès que possible, pas seulement une fois un chantier entier terminé. Appliqué :

1. ✅ **Sync immédiat** de `tenderai-backend` avec l'état courant du monorepo (chantier 2 complet + chantier 3 tâches 1-9), plutôt que d'attendre la fin du chantier 3. Commit `ae9086b`, 143 tests passants, poussé sur `origin/staging`.
2. ✅ **Plus aucun travail backend/pipeline sur le monorepo à partir de maintenant.** Chantier 3 (tâches 10-16, ✅ terminé) et chantier 4 (pas commencé) se font sur `tenderai-backend/staging`.
3. **Ensuite**, une fois le chantier 3 terminé sur `tenderai-backend` (✅ fait) : cutover du serveur staging (tâche 12 du chantier 1) vers les 3 nouveaux repos.

## Actions immédiates suggérées

1. **Finir la tâche 12 (cutover staging) côté frontend** — voir la sous-section détaillée dans "Chantier 1" ci-dessus. Backend+infra sont déjà cutover et validés (`/health` 200) ; il manque uniquement de corriger `tenderai-frontend/ci.yml` (trigger sur `staging`), rebuild, redéployer, et valider visuellement le multi-company dans le navigateur.
2. Réconcilier `main` et `staging` sur ce monorepo (doublon de commits docs du chantier 1) — nettoyage différé, non bloquant.
3. Chantier 4 (audit qualité des pipelines) — pas commencé, à démarrer sur `tenderai-backend` quand souhaité.
4. Tâches 13 (cutover prod) et 14 (archivage monorepo) restent bloquées en attente de confirmation explicite de l'utilisateur, et ne doivent pas être lancées avant que la tâche 12 soit *entièrement* validée (frontend inclus).
