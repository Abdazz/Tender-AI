# État du projet — TenderAI BF

**Document de suivi central.** À mettre à jour à chaque session qui avance un chantier — ne pas laisser l'état se déduire uniquement des messages de commit.

**Dernière mise à jour :** 2026-08-30 (session 5), par une session Claude Code — **chantier 5 (Auth & API multi-company) intégralement terminé, sous-projets A (backend) et B (frontend) mergés sur `staging`.** Backend : JWT `company_id`, renommage des rôles, routeur `companies.py`, scoping cross-tenant. Frontend : `CompanyContext`, page `/companies`, sélecteur d'entreprise, scoping des Paramètres/Destinataires/Sources/Utilisateurs. Voir section "Chantier 5" ci-dessous pour le détail complet des deux sous-projets, chacun avec sa propre revue finale ayant trouvé et corrigé des findings Critical réels (cross-tenant côté backend, cascade de rupture fonctionnelle + écart de plan côté frontend). **Reste à faire : déployer les deux ensemble sur le serveur staging** (décision de séquencement déjà actée, redéploiement `tenderai-infra` non encore déclenché).

## Vue d'ensemble — refonte SaaS (5 chantiers)

| # | Chantier | État | Porté par |
|---|---|---|---|
| 0 | Multi-company — data model (préalable aux autres chantiers) | ✅ Terminé | `main`, `staging` (monorepo) |
| 1 | Séparation du monorepo en 3 repos | 🟡 12/14 tâches — tâche 12 (cutover staging) ✅ **terminée et validée** (backend+infra+frontend). Tâches 13/14 bloquées, attente confirmation utilisateur | 3 repos GitHub séparés |
| 2 | Modernisation des dépendances | ✅ Terminé (2 sous-projets) | Synced dans `tenderai-backend/staging` |
| 3 | Pipeline split (harvest/delivery multi-company) | ✅ **Terminé** (16/16 tâches + revue finale + fix wave) | `tenderai-backend`, branche `staging` (poussé sur GitHub) |
| 4 | Audit qualité des pipelines | ⬜ Pas commencé | À faire sur `tenderai-backend` |
| 5 | Auth & API multi-company | ✅ **Terminé** (sous-projets A+B, backend+frontend, mergés). Reste : déploiement staging conjoint | `tenderai-backend` + `tenderai-frontend`, branches `staging` (poussées sur GitHub) |

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
  - Tâche 12 : cutover staging — ✅ **terminée et validée le 2026-08-28** (détail ci-dessous)
  - Tâche 13 : cutover production — reste bloquée, attente confirmation explicite
  - Tâche 14 : archivage du monorepo original — reste bloquée, attente confirmation explicite
- **Le monorepo `Tender-AI` reste le dépôt de production tant que ces 3 tâches n'ont pas été exécutées.**

#### Tâche 12 (cutover staging) — ✅ terminée le 2026-08-28 (session 3)

**Session 2 (backend/infra) :** 8 bugs infra résolus sur `tenderai-backend`/`tenderai-infra` — `.env` absent avant `docker compose`, override compose serveur, création de branche `staging`, CI qui ne se déclenchait pas sur push `staging`, mypy bloquant (494 erreurs préexistantes → non-bloquant), suite de tests 25 min → 15 s (tests lents/intégration filtrés), accès GHCR "Manage Actions access" refusé pour `tenderai-backend` (`permission_denied: write_package` sur `tenderai-bf-api`/`tenderai-bf-worker`, corrigé manuellement par l'utilisateur dans l'UI GitHub — **le CLI/API n'a aucun endpoint pour ça sur un compte perso, seule l'UI web fonctionne**). Vérifié par un re-run complet : `tenderai-backend` CI verte, images `:staging` `api`/`worker` poussées, déploiement `tenderai-infra` réussi, `/health` → 200.

**Session 3 (frontend) :** bug identique trouvé et corrigé côté frontend.
- Root cause identique à celle du backend : `tenderai-frontend/.github/workflows/ci.yml` ne se déclenchait que sur push `main`, jamais `staging` — corrigé en ajoutant `staging` à `on.push.branches` (commit `7d016e6`, poussé sur `origin/staging`).
- L'unique run historique (sur `main`, `0004854`, 2026-05-21) avait échoué avec la **même erreur GHCR** que le backend : `permission_denied: write_package` sur `ghcr.io/abdazz/tenderai-bf-frontend`. Confirmé par un premier re-run post-fix (run `33192240965`) qui a échoué avec la même erreur — l'utilisateur a accordé l'accès Write à `tenderai-frontend` sur le package `tenderai-bf-frontend` dans l'UI GitHub (identique à la procédure déjà suivie pour `tenderai-bf-api`/`tenderai-bf-worker`), puis un `gh run rerun` a réussi : image `:staging` construite et poussée.
- `tenderai-infra` redéployé (`gh workflow run deploy.yml --ref staging -f environment=staging -f image_tag=staging`, run `33193898122`, succès) pour tirer le nouveau frontend. `/health` reconfirmé 200 (DB/MinIO/SMTP healthy).
- **Validation visuelle effectuée dans le navigateur** sur `https://stagingtenderai.yulcom.net` : sélecteur de pays fonctionnel (Burkina Faso ↔ Canada), page `/countries` affichant les 2 pays actifs, Sources et Paramètres filtrés par pays sélectionné (`Pays: Canada` visible), rôle `super_admin` visible sur la page Utilisateurs. Toutes les fonctionnalités multi-company/multi-pays sont confirmées live sur staging.

**Le cutover staging (tâche 12) est maintenant intégralement complet** — backend, infra, et frontend tous rebuild/redéployés depuis les 3 nouveaux repos séparés. Les tâches 13 (cutover prod) et 14 (archivage monorepo) restent bloquées en attente de confirmation explicite de l'utilisateur.

**Point non résolu, hors scope de la tâche 12, soulevé par l'utilisateur (2026-08-28) :** le nom "BF" (Burkina Faso) reste présent partout — package Python `tenderai_bf` (41+ fichiers dans `tenderai-backend`), préfixe d'image GHCR `ghcr.io/abdazz/tenderai-bf`, noms de packages `tenderai-bf-api`/`-worker`/`-frontend`. De plus, les 3 nouveaux repos publient vers les **mêmes packages GHCR** que l'ancien monorepo (le préfixe d'image n'a pas été changé lors du repo-split — ce n'était pas une contrainte technique, juste une config héritée telle quelle). Un nettoyage/renommage a été proposé par l'utilisateur ; classé comme travail **architectural** (multi-repos + touche le serveur de prod/staging en cours d'exécution) nécessitant sa propre spec avant exécution.

#### Renommage `tenderai-bf` → `tenderai` (chantier 1, hors numérotation des 14 tâches) — sous-projet A ✅ terminé le 2026-08-29

Spec : `docs/superpowers/specs/2026-08-28-tenderai-bf-rename-infra-design.md`. Plan : `docs/superpowers/plans/2026-08-28-tenderai-bf-rename-infra.md`.

- **Périmètre couvert :** préfixe d'image GHCR (`ghcr.io/abdazz/tenderai-bf` → `ghcr.io/abdazz/tenderai`) dans `tenderai-backend/ci.yml` et `tenderai-frontend/ci.yml`, les 3 lignes `image:` de `tenderai-infra/docker-compose.server.yml`, et la chaîne `user_agent` du scraper dans `tenderai-infra/settings.yaml` (`TenderAI-BF/1.0` → `TenderAI/1.0`). **Exclu délibérément :** nom de la base Postgres et du bucket MinIO (`tenderai_bf`, données réelles déjà provisionnées, aucune migration), package Python `tenderai_bf` et son namespace de logger (sous-projet B, différé), `tenderai-infra/scripts/deploy.sh` (mort, non invoqué par la CI, laissé tel quel).
- **2 bugs supplémentaires découverts et corrigés en cours de route (indépendants du renommage) :**
  1. Le job `lint-test` de `tenderai-backend/ci.yml` a échoué 3 fois de suite avec `No space left on device` pendant `poetry install --extras "full" --with dev` (la 3ᵉ fois assez sévère pour empêcher le runner d'écrire son propre log) — alors que le même job avait réussi la veille sans changement de dépendances. Root cause : seul le job `build-and-push` avait déjà une étape de nettoyage disque (ajoutée lors du chantier 3), jamais `lint-test`. Corrigé en dupliquant cette étape dans `lint-test` (commit `937eaaa`).
  2. Après la publication des 3 nouvelles images sous les nouveaux noms, le déploiement échouait avec `Error response from daemon: denied` en tirant les images — cause différente du bug GHCR de la tâche 12 : cette fois c'est `tenderai-infra` (le repo qui *déploie*, pas ceux qui *publient*) qui n'avait aucun accès en lecture sur les 3 packages tout juste créés. Corrigé manuellement par l'utilisateur dans l'UI GitHub (accès Read accordé à `tenderai-infra` sur `tenderai-api`, `tenderai-frontend`, `tenderai-worker`) — **nouvelle variante du même problème structurel de la tâche 12** : chaque repo qui pousse OU tire une image GHCR doit recevoir son propre accès explicite par package, même au sein d'un seul compte GitHub perso, et cet accès ne se propage pas automatiquement à un package tout juste créé.
- **Validation :** `tenderai-backend` CI verte (images `tenderai-api`/`tenderai-worker` poussées), `tenderai-frontend` CI verte (image `tenderai-frontend` poussée, aucun souci d'accès cette fois), déploiement `tenderai-infra` réussi, `/health` → 200 (DB/MinIO/SMTP healthy, noms `tenderai_bf` inchangés comme prévu), revue de non-régression complète dans le navigateur (dashboard, sélecteur de pays, `/countries`, rôle `super_admin`) — comportement identique à avant le renommage.
- **Sous-projet B (renommage du package Python `tenderai_bf`, 41+ fichiers dans `tenderai-backend`) reste non planifié.** À reprendre dans une session future, avec sa propre spec dédiée du fait du risque de régression plus élevé.

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
- **Dette documentée, non bloquante, laissée pour plus tard :** 8 findings Minor de la revue finale (requête `NOT IN` au lieu de `NOT EXISTS`, pas de fenêtre de date sur le premier run de livraison, cron de livraison par défaut identique au cron de harvest, etc. — détail complet dans le journal SDD de la session, maintenant supprimé, et dans le message du commit `c6ff48b`) ; le bug pré-existant de préfixe de variable d'env dans `tests/conftest.py` (`TENDERAI_DATABASE_URL` vs `DATABASE_URL`) ; performance de la requête anti-jointure de `select_new_notices` jamais testée à l'échelle réelle. **Les 2 stopgaps YULCOM codés en dur (endpoints API manuels + création de destinataires) sont résolus — voir chantier 5 ci-dessous.**

### Chantier 5 — Auth & API multi-company

**Contexte :** le chantier 0 (data model) a créé les tables `Company`/`CompanyCountrySubscription`/`CompanySettings`/`CompanyNoticeStatus`, et le chantier 3 (pipeline split) a construit le graphe de livraison par entreprise — mais aucun des deux n'a jamais câblé cette isolation dans l'authentification ou l'API. Résultat : le JWT ne portait pas de `company_id`, aucun endpoint `companies.py` n'existait, et 3 endroits du code contournaient le problème en livrant systématiquement à YULCOM (commentaires "Stopgap until the Auth/API plan..."). Ce chantier ferme cet écart. Spec : Section 3 ("Auth & API") de `docs/superpowers/specs/2026-08-23-multi-company-design.md` (déjà approuvée lors du chantier 0, jamais implémentée).

**Sous-projet A — Backend (Auth & API) — ✅ terminé le 2026-08-29**
- Spec : `docs/superpowers/specs/2026-08-23-multi-company-design.md` (Section 3). Plan : `docs/superpowers/plans/2026-08-29-multi-company-auth-api.md` (5 tâches).
- Périmètre : renommage des rôles `admin`/`viewer` → `company_admin`/`company_viewer` (`super_admin` inchangé, migrations `0014`/`0015`) ; claim JWT `company_id` + dépendance FastAPI `CompanyScopedUser`/`require_company_scope` (403 pas 404 sur accès cross-company, `super_admin` non restreint) ; nouveau routeur `companies.py` (CRUD, abonnements pays, paramètres, déclenchement de livraison via `BackgroundTasks`) ; scoping `company_id` ajouté à `recipients.py`/`runs.py`/`reports.py`/`sources.py`/`users.py`/`countries.py` ; suppression des 3 stopgaps YULCOM, remplacés par un helper `resolve_delivery_company_id` qui préserve le comportement actuel du bouton "Lancer maintenant" (repli sur YULCOM pour `super_admin` sans sélection explicite — évite une régression silencieuse découverte pendant la conception, avant toute implémentation).
- **Exécution** : subagent-driven-development dans un worktree git isolé (`tenderai-backend/.worktrees/multi-company-auth-api`). Chacune des 5 tâches a eu son implémenteur + sa revue dédiée, avec vagues de correction où nécessaire (dont un bug réel trouvé pendant la conception même du plan — table `recipients.py` create — un endpoint bloquant la boucle événementielle ASGI au lieu d'utiliser `BackgroundTasks`, et 4 chemins d'autorisation livrés sans test).
- **Revue finale globale** (modèle le plus capable, portée sur les 5 tâches ensemble) : a trouvé **2 findings Critical réels de sécurité cross-tenant**, invisibles dans les revues par tâche : (1) les endpoints `recipients.py` GET/PUT/DELETE par ID n'avaient aucun scoping — un `company_admin` ou même un `company_viewer` (rôle lecture-seule) d'une entreprise A pouvait lire/modifier/supprimer un destinataire de l'entreprise B en devinant l'ID (les IDs sont des entiers séquentiels) ; (2) les filtres `list_runs`/`list_reports` utilisaient l'authentification optionnelle — omettre l'en-tête `Authorization`, ou envoyer un jeton invalide, contournait entièrement le filtre par entreprise et retournait les données de toutes les entreprises. Plus 7 findings Important (défaut de rôle DB resté sur `"viewer"` post-renommage ; `RecipientCreate` sans paramètre `company_id`, rendant impossible la création d'un destinataire pour une entreprise autre que YULCOM via l'API ; vérification de doublon d'email non scopée par entreprise ; `delete_run` sans aucun contrôle d'accès ; `update_user` ne revalidant pas la cohérence rôle/`company_id` ; un test non hermétique déclenchant un vrai pipeline de harvest ; une docstring de test surestimant sa propre couverture).
- **1 vague de correction** appliquée pour les 10 findings en une seule passe (comme prescrit par le skill subagent-driven-development pour une revue finale), suivie d'une re-revue scopée : les 10 vérifiés ADDRESSED (1 avec une nuance — voir ci-dessous), aucune nouvelle régression, 10 nouveaux tests, suite complète toujours verte (189 tests).
- **Dette documentée, non bloquante, découverte pendant la re-revue de la vague de correction :** le correctif applicatif du doublon d'email (scoping par `company_id`) est correct mais incomplet à lui seul — l'index unique au niveau base de données `uq_recipients_email_country` (migration `0012`, antérieure à ce chantier) reste scopé `(email, country_id)` uniquement, jamais révisé par la migration `0013` qui a ajouté `company_id`. Deux entreprises partageant un pays et un email de destinataire identique déclencheraient encore une erreur 500 non gérée en production (échec bruyant, pas une fuite silencieuse de données). Nécessite une migration de suivi (élargir l'index à `(company_id, email, country_id)`, corriger le `unique=True` obsolète au niveau ORM dans `models.py`). Hors périmètre de ce chantier (data-model, pas Auth/API) — laissé pour une session future.
- État final : commit `9085409` sur `tenderai-backend/staging`, mergé localement et poussé sur GitHub. 189 tests passants, `ruff check`/`ruff format` propres.

**Sous-projet B — Frontend (`CompanyContext`, page `/companies`, nav "Compagnies") — ✅ terminé le 2026-08-30**
- Spec : `docs/superpowers/specs/2026-08-29-multi-company-frontend-design.md` (Section 4). Plan : `docs/superpowers/plans/2026-08-30-multi-company-frontend.md` (8 tâches).
- Périmètre : renommage des littéraux de rôle `admin`/`viewer` → `company_admin`/`company_viewer` côté frontend (6 fichiers + 1 trouvé en trop pendant l'implémentation) ; nouveau `CompanyContext` imbriqué au-dessus du `CountryContext` existant (le layout décode `company_id` directement depuis le JWT, comme `country_id` l'était déjà) ; `CountryProvider` re-scopé pour ne fetcher que les pays abonnés par l'entreprise sélectionnée au lieu du catalogue global ; nouvelle famille de routes proxy `app/api/proxy/companies/*` (7 fichiers, miroir de `countries/*`) ; nouvelle page `/companies` (liste, création, checklist d'abonnement pays) + nav "Compagnies" (`super_admin` uniquement, protégé aussi côté serveur dans `middleware.ts`) ; champ `company_id` requis dans la création d'utilisateur `company_admin`/`company_viewer` ; Sources en lecture seule pour les rôles non-`super_admin` ; scoping par entreprise sur 3 des 8 onglets Paramètres (`classification`/`scheduler`/`email`, les seuls que le backend expose par entreprise) + Destinataires ; badge Collecte/Livraison sur la page Rapports.
- **Exécution** : subagent-driven-development dans un worktree git isolé (`tenderai-frontend/.worktrees/multi-company-frontend`). Absence totale d'infrastructure de test dans ce repo (`package.json` n'a que `dev`/`build`/`start`/`lint`) — vérification via `npm run build` (compilation TypeScript) à chaque tâche ; `npm run lint` cassé localement dans ce sandbox (config ESLint, bug d'environnement confirmé sans rapport avec le code, la CI GitHub Actions passe normalement). Vérification manuelle en navigateur/curl limitée sur la plupart des tâches : le backend local disponible dans ce sandbox datait d'avant le travail multi-company et répondait 404 sur toutes les routes `/api/v1/admin/companies/*` — écart d'environnement documenté à chaque tâche concernée, jamais silencieusement ignoré.
- **3 tâches sur 8 ont nécessité une vague de correction** : Tâche 2 (`CompanyContext`) — un `return` manquant sur le fetch imbriqué faisait mentir le flag `loading`, plus absence de garde d'annulation contre les changements rapides d'entreprise ; Tâche 4 (`/companies`) — `middleware.ts` (fichier jamais découvert pendant la conception du plan) avait une liste `SUPER_ADMIN_PATHS` protégeant `/users`/`/countries` côté serveur, jamais étendue à `/companies` ; Tâche 7 (Paramètres/Destinataires) — la fusion des paramètres d'entreprise se produisait dans deux `.then()` indépendants sans garantie d'ordre, risquant qu'une réponse pays arrive après celle de l'entreprise et écrase silencieusement les données d'entreprise.
- **Revue finale globale** (modèle le plus capable, portée sur les 8 tâches ensemble, avec accès en lecture au code source de `tenderai-backend` pour vérifier les contrats réels) : a trouvé **4 findings Critical**, invisibles dans les revues par tâche car aucune n'avait le contexte cross-repo nécessaire : (1) `CompanyProvider` appelait sans condition l'endpoint liste `GET /companies`, réservé `SuperAdminUser` côté backend — un `company_admin`/`company_viewer` recevait un 403, `selectedCompany` restait `null` pour toujours, cassant Dashboard/Sources/Paramètres pour exactement les rôles pour lesquels le multi-tenant existe ; (2) la fusion des paramètres d'entreprise dans Paramètres écrasait les 8 sections au lieu des 3 réellement éditables par entreprise (le endpoint backend renvoie tout, `seed_from_global` copie toutes les sections globales à la création d'une entreprise) — perte de données silencieuse possible sur Pipeline/LLM/RAG/Prompts ; (3) aucun sélecteur d'entreprise n'existait nulle part dans l'UI — `setSelectedCompany` était du code mort, tout `super_admin` restait bloqué sur la première entreprise par ordre alphabétique — **écart de plan, pas d'implémentation** (la spec et le backend supposaient tous deux qu'un sélecteur existerait, aucune tâche ne l'avait jamais prévu) ; (4) le badge Collecte/Livraison de la page Rapports affichait toujours "Livraison" car `RunStatusResponse` côté backend n'a aucun champ `run_type` — erreur factuelle dans le texte du plan, jamais vérifiée contre le code source réel. Plus 3 findings Important (troisième occurrence du même problème d'absence de garde d'annulation, cette fois capable de corrompre des écritures cross-entreprise dans `/companies` ; vérification "fail-closed" de `CompanyProvider` basée sur la mauvaise condition ; échecs de fetch d'entreprise invisibles pour l'utilisateur) et 1 Minor.
- **1 vague de correction** appliquée pour les 8 findings en une seule passe, suivie d'une re-revue scopée avec re-vérification indépendante contre le code source backend (pas seulement le rapport de l'implémenteur) : les 8 vérifiés ADDRESSED, aucune nouvelle régression, `npm run build` toujours vert (28 routes).
- **Dette documentée, non bloquante :** le finding Critical #4 (badge Collecte/Livraison) n'a reçu qu'un correctif frontend d'atténuation (affiche "—" au lieu d'une fausse assertion "Livraison") — le correctif complet nécessite d'ajouter et peupler un champ `run_type` sur `RunStatusResponse` côté `tenderai-backend`, hors périmètre de cette vague de correction frontend-only, à traiter dans une session future sur ce repo. Gaps produit non bloquants également relevés par la revue finale mais volontairement non inclus dans la vague de correction (portée trop large pour un fix wave de revue) : pas de formulaire d'édition d'entreprise après création (seule la désactivation existe), champ `logo_url` inatteignable dans le formulaire de création, pas de lien direct "Utilisateurs filtrés par cette entreprise" depuis `/companies`.
- État final : commit `de6a88c` sur `tenderai-frontend/staging`, mergé localement et poussé sur GitHub.

**Chantier 5 est maintenant intégralement terminé (sous-projets A et B).** Reste à déployer ensemble sur staging (backend + frontend, décision de séquencement déjà prise avec l'utilisateur) — non fait à ce stade, nécessite un redéploiement `tenderai-infra` explicite.

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

1. **Tâche 12 (cutover staging) est terminée et validée** (backend+infra+frontend, voir "Chantier 1" ci-dessus) — rien à faire ici.
2. **Nettoyage/renommage "BF"** — voir note de fin de la sous-section tâche 12. Proposé par l'utilisateur le 2026-08-28, classé architectural (spec requise avant exécution), pas encore démarré.
3. Réconcilier `main` et `staging` sur ce monorepo (doublon de commits docs du chantier 1) — nettoyage différé, non bloquant.
4. Chantier 4 (audit qualité des pipelines) — pas commencé, à démarrer sur `tenderai-backend` quand souhaité.
5. Tâches 13 (cutover prod) et 14 (archivage monorepo) restent bloquées en attente de confirmation explicite de l'utilisateur.
