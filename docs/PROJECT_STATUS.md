# État du projet — TenderAI BF

**Document de suivi central.** À mettre à jour à chaque session qui avance un chantier — ne pas laisser l'état se déduire uniquement des messages de commit.

**Dernière mise à jour :** 2026-08-27, par une session Claude Code (finalisation du chantier "multi-company data model" + audit de l'ensemble des chantiers en cours + bascule du chantier 3 vers `tenderai-backend`).

## Vue d'ensemble — refonte SaaS (4 chantiers)

| # | Chantier | État | Porté par |
|---|---|---|---|
| 0 | Multi-company — data model (préalable aux 4 chantiers) | ✅ Terminé | `main`, `staging` (monorepo) |
| 1 | Séparation du monorepo en 3 repos | 🟡 11/14 tâches — cutover en attente | 3 repos GitHub séparés |
| 2 | Modernisation des dépendances | ✅ Terminé (2 sous-projets) | Synced dans `tenderai-backend/staging` |
| 3 | Pipeline split (harvest/delivery multi-company) | 🟡 9/16 tâches | **`tenderai-backend`, branche `staging`** (tâches 10-16 se font ici, plus sur le monorepo) |
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
  - Tâche 12 : cutover staging
  - Tâche 13 : cutover production
  - Tâche 14 : archivage du monorepo original
- **Le monorepo `Tender-AI` reste le dépôt de production tant que ces 3 tâches n'ont pas été exécutées.**

### Chantier 2 — Modernisation des dépendances
- Sous-projet A — upgrade LangChain/LangGraph : spec `docs/superpowers/specs/2026-08-25-langchain-langgraph-upgrade-design.md`, plan `docs/superpowers/plans/2026-08-25-langchain-langgraph-upgrade.md`. ✅ Terminé, testé (0 régression vs baseline), mergé dans `staging`.
- Sous-projet B — nettoyage ruff/lint : plan `docs/superpowers/plans/2026-08-25-ruff-lint-cleanup.md`. ✅ Terminé (ruff check clean), mergé dans `staging`.
- Les deux sont entrés dans `staging` via le commit `7235ac6` (merge du worktree vers `staging`, 2026-08-26).

### Chantier 3 — Pipeline split (harvest/delivery, support multi-company)
- Spec : `docs/superpowers/specs/2026-08-26-multi-company-pipeline-split-design.md` (existe sur le monorepo, à recopier dans `tenderai-backend` si besoin de référence).
- Plan : `docs/superpowers/plans/2026-08-27-multi-company-pipeline-split.md` (16 tâches), committé sur le monorepo (`5478d04`).
- But : scinder `agents/graph.py` en un graphe "harvest" (collecte + persistance, sans email) et un nouveau `delivery_graph.py` (classification + email), pour permettre plusieurs runs de livraison par entreprise cliente.
- Avancement : tâches 1 à 9 terminées (validation : 143 tests passants). La tâche 9 (`TenderAIGraph` devient harvest-only) avait été committée sur le monorepo (`48b0f9d`) mais pas encore journalisée/reviewée quand une coupure de courant a interrompu la session précédente.
- **Bascule (2026-08-27) :** le travail des tâches 1-9 a été synchronisé depuis le monorepo (worktree `.claude/worktrees/repo-split`) vers `tenderai-backend/staging` (commit `ae9086b`), avec le chantier 2 en même temps (rattrapage, voir ci-dessus). Suite à la règle "tout travail post-chantier-1 se fait sur les nouveaux repos", **les tâches 10 à 16 se poursuivent directement sur `tenderai-backend`, plus sur le monorepo.**
- Le journal d'exécution SDD (`.superpowers/sdd/2026-08-27-multi-company-pipeline-split/progress.md`, non versionné, scratch local) reste dans le worktree du monorepo pour les tâches 1-8 déjà journalisées — la tâche 9 et suivantes seront journalisées dans un nouveau workspace SDD ouvert sur `tenderai-backend`.
- Reste à faire : tâche 9 (review formelle) à 16 (vérification finale), sur `tenderai-backend/staging`.

### Chantier 4 — Audit qualité des pipelines
- Pas commencé. Aucun spec/plan écrit à ce jour.

## Règle de workflow git (obligatoire, tous repos)

Chaque repo du projet — ce monorepo **et** chacun des 3 repos produits par le chantier 1 (`tenderai-backend`, `tenderai-frontend`, `tenderai-infra`) — doit avoir une branche `staging`. Tout travail est d'abord fusionné sur `staging` (déployée, testée en conditions réelles), puis promu vers `main` seulement après validation. Jamais de fusion/push direct sur `main`. Documentée dans `CLAUDE.md`.

**Résolu (2026-08-27) :** branche `staging` créée (depuis `main`) et poussée sur les 3 repos. Clones locaux créés dans `/home/yulcom/web/tenderai/` (`tenderai-backend`, `tenderai-frontend`, `tenderai-infra`) — ils n'existaient nulle part localement avant (le chantier 1 avait travaillé depuis des dossiers `/tmp/tenderai-*-work` jetables, nettoyés après usage). `staging` n'a pas été mise comme branche par défaut sur GitHub — à faire si on veut que les PR ciblent `staging` par défaut.

## Règle de séquencement (décidée 2026-08-27, appliquée le même jour)

Décision initiale : finir le chantier 3 sur le monorepo puis re-sync `tenderai-backend` à la fin. **Révisée dans la foulée** : le principe correct est que tout travail postérieur au chantier 1 doit se faire sur les nouveaux repos dès que possible, pas seulement une fois un chantier entier terminé. Appliqué :

1. ✅ **Sync immédiat** de `tenderai-backend` avec l'état courant du monorepo (chantier 2 complet + chantier 3 tâches 1-9), plutôt que d'attendre la fin du chantier 3. Commit `ae9086b`, 143 tests passants, poussé sur `origin/staging`.
2. ✅ **Plus aucun travail backend/pipeline sur le monorepo à partir de maintenant.** Chantier 3 (tâches 10-16) et chantier 4 (pas commencé) se font sur `tenderai-backend/staging`.
3. **Ensuite**, une fois le chantier 3 terminé sur `tenderai-backend` : cutover du serveur staging (tâche 12 du chantier 1) vers les 3 nouveaux repos.

## Actions immédiates suggérées

1. Reprendre le chantier 3 à partir de la tâche 9 (review formelle) sur `tenderai-backend/staging`, continuer jusqu'à la tâche 16.
2. Réconcilier `main` et `staging` sur ce monorepo (doublon de commits docs du chantier 1) — nettoyage différé, non bloquant.
3. Cutover staging (tâche 12 du chantier 1) — une fois le chantier 3 terminé sur `tenderai-backend`.
