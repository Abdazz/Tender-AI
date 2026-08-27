# État du projet — TenderAI BF

**Document de suivi central.** À mettre à jour à chaque session qui avance un chantier — ne pas laisser l'état se déduire uniquement des messages de commit.

**Dernière mise à jour :** 2026-08-27, par une session Claude Code (finalisation du chantier "multi-company data model" + audit de l'ensemble des chantiers en cours).

## Vue d'ensemble — refonte SaaS (4 chantiers)

| # | Chantier | État | Porté par |
|---|---|---|---|
| 0 | Multi-company — data model (préalable aux 4 chantiers) | ✅ Terminé | `main`, `staging` |
| 1 | Séparation du monorepo en 3 repos | 🟡 11/14 tâches — cutover en attente | Worktree `.claude/worktrees/repo-split` → 3 repos GitHub séparés |
| 2 | Modernisation des dépendances | ✅ Terminé (2 sous-projets) | `staging` |
| 3 | Pipeline split (harvest/delivery multi-company) | 🟡 8-9/16 tâches | Worktree `.claude/worktrees/repo-split`, branche `worktree-repo-split` (**pas encore mergé dans `staging`**) |
| 4 | Audit qualité des pipelines | ⬜ Pas commencé | — |

## Carte des branches et repos

```
main ──────────────┐  (multi-company data model + docs chantier 1, dupliquées)
                    │
staging ────────────┤  (= main + chantier 2 complet)
                    │
worktree-repo-split ┘  (= staging + chantier 3, tâches 1-9/16, PAS mergé ailleurs)

3 repos GitHub séparés (produit du chantier 1, tâches 1-11) :
  - tenderai-backend, tenderai-frontend, tenderai-infra
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
- Spec : `docs/superpowers/specs/2026-08-26-multi-company-pipeline-split-design.md` (committée, dans le worktree uniquement pour l'instant)
- Plan : `docs/superpowers/plans/2026-08-27-multi-company-pipeline-split.md` (16 tâches) — ⚠️ **fichier non committé** (untracked dans le worktree), à committer.
- But : scinder `agents/graph.py` en un graphe "harvest" (collecte + persistance, sans email) et un nouveau `delivery_graph.py` (classification + email), pour permettre plusieurs runs de livraison par entreprise cliente.
- Avancement : tâches 1 à 8 confirmées terminées et reviewées dans le journal d'exécution (`.superpowers/sdd/2026-08-27-multi-company-pipeline-split/progress.md`, non versionné). La tâche 9 (`TenderAIGraph` devient harvest-only) est **committée** (`48b0f9d`) mais pas encore journalisée/reviewée — la session précédente s'est arrêtée brutalement (coupure de courant) à ce moment-là.
- Vit uniquement dans la branche `worktree-repo-split`, **pas encore fusionné dans `staging`**.
- Reste à faire : tâches 9 (review) à 16 (vérification finale), puis fusion vers `staging`.

### Chantier 4 — Audit qualité des pipelines
- Pas commencé. Aucun spec/plan écrit à ce jour.

## Actions immédiates suggérées

1. Committer le plan non versionné du chantier 3 (`docs/superpowers/plans/2026-08-27-multi-company-pipeline-split.md`) dans le worktree.
2. Reprendre le chantier 3 à partir de la tâche 9 (vérifier son état exact, la journaliser/reviewer, puis continuer jusqu'à la tâche 16).
3. Réconcilier `main` et `staging` (doublon de commits docs du chantier 1).
4. Décider quand déclencher les tâches 12-14 du chantier 1 (cutover + archivage) — nécessite une confirmation explicite, séparée de ce document.
