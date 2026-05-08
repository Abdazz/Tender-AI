# Points d'amélioration — TenderAI BF

## Sécurité

### Credentials par défaut exposés
- **Fichier** : `settings.yaml` (section `security`)
- **Problème** : `admin_password: admin123` est en clair dans le fichier de config versionné.
- **Action** : Retirer la valeur par défaut et forcer la variable d'environnement `TENDERAI_ADMIN_PASSWORD` sans fallback. Ajouter une validation au démarrage qui refuse de lancer si le mot de passe est absent ou trivial.


### JWT secret avec fallback faible
- **Fichier** : `settings.yaml` (section `security`)
- **Problème** : `jwt_secret_key: "${TENDERAI_JWT_SECRET:-change-this-secret-key-in-production-use-openssl-rand-hex-32}"` — si la variable n'est pas définie, une clé connue est utilisée.
- **Action** : Supprimer le fallback et lever une exception au démarrage si la variable est absente.

---

## Architecture du pipeline

### Gestion d'erreurs incomplète dans le graphe
- **Fichier** : `src/tenderai_bf/agents/graph.py`
- **Problème** : Le flag `error_occurred` ne court-circuite pas le pipeline. Les nœuds intermédiaires (`classify`, `deduplicate`, etc.) s'exécutent même après une erreur dans `parse_extract`. Seul le nœud `email_report` possède une arête conditionnelle vers `error_handler`.
- **Action** : Ajouter des arêtes conditionnelles après chaque nœud critique, ou utiliser un `should_continue` check en début de chaque nœud.

### Pipeline séquentiel — pas de parallélisme
- **Fichier** : `src/tenderai_bf/agents/graph.py`
- **Problème** : Le fetch de plusieurs sources se fait en séquence. Avec 5+ sources, le temps de pipeline augmente linéairement.
- **Action** : Utiliser les branches parallèles de LangGraph (`Send` API) pour fetcher les sources en parallèle, puis merger les résultats avant `parse_extract`.

### Singleton global de pipeline
- **Fichier** : `src/tenderai_bf/agents/graph.py` (fonction `get_pipeline`)
- **Problème** : Le singleton `_pipeline` global n'est pas thread-safe. Deux requêtes simultanées pourraient initialiser deux instances ou accéder à un état partagé.
- **Action** : Utiliser un verrou (`threading.Lock`) autour de l'initialisation, ou instancier le pipeline à chaque run.

---

## Configuration RAG

### `chunk_size` trop grand
- **Fichier** : `settings.yaml` (section `rag`)
- **Problème** : `chunk_size: 76800` caractères correspond à ~19 000 tokens — supérieur à la fenêtre de contexte de nombreux modèles (ex. Groq `llama3.1` : 8k tokens).
- **Action** : Réduire à 2048–4096 caractères selon le modèle utilisé. Documenter la relation entre `chunk_size` et le `max_tokens` du LLM choisi.

### Répertoire Chroma non configuré en production
- **Fichier** : `settings.yaml` (section `rag.chroma`)
- **Problème** : `persist_directory: "./data/chroma_db"` est un chemin relatif qui dépend du répertoire de lancement. En Docker, il peut ne pas être persisté si le volume n'est pas monté.
- **Action** : Utiliser un chemin absolu via variable d'environnement et s'assurer que le volume Docker correspondant est déclaré dans `docker-compose.yml`.

---

## Qualité du code

### Fichiers de prototypage dans `src/`
- **Fichiers** :
  - `src/test_docling.py`
  - `src/test_docling_v2.py`
  - `src/analyze_with_docling.py`
  - `src/download_docling_models.py`
- **Problème** : Ces scripts de R&D sont à la racine de `src/` et se retrouvent dans l'image Docker de production.
- **Action** : Supprimer tous les fichiers qui ne sont pas utilisés.

### Incohérence entre `state.dict()` et `TenderAIState`
- **Fichier** : `src/tenderai_bf/agents/graph.py` (méthode `run`)
- **Problème** : `self.app.invoke(state.dict())` passe un dict brut à LangGraph, qui retourne aussi un dict. Le reste du code mélange accès dict et accès attribut (`final_state.get(...)` vs `final_state["..."]`).
- **Action** : Reconstruire systématiquement un objet `TenderAIState` depuis le dict retourné par `invoke`, ou passer l'objet directement.

---

## Sources et extensibilité

### Seulement 2 sources actives
- **Fichier** : `settings.yaml` (section `sources`)
- **Problème** : DGCMEF (mode RAG) et Joffres.net sont les seules sources activées. Le marché burkinabè compte d'autres plateformes (ARCOP, SONABHY, ONEA, etc.).
- **Action** : Planifier l'intégration progressive d'autres sources en réutilisant les parsers existants (`html-listing`, `pdf_rag`).

### Absence de retry/backoff sur les fetches HTTP
- **Fichiers** : `src/tenderai_bf/agents/nodes/fetch_listings.py`, `fetch_items.py`
- **Problème** : `retry_attempts: 3` est défini dans la config mais l'implémentation du backoff exponentiel n'est pas vérifiable depuis la config seule.
- **Action** : S'assurer que les retries utilisent un backoff exponentiel (ex. `tenacity`) pour ne pas marteler les serveurs cibles en cas d'erreur temporaire.

---

## Tests

### Couverture de tests insuffisante sur les nœuds agents
- **Fichier** : `tests/`
- **Problème** : Les tests existants couvrent les utilitaires (`test_utils.py`) et la fumée (`test_smoke.py`), mais aucun nœud LangGraph n'est testé unitairement.
- **Action** : Ajouter des tests unitaires pour chaque nœud (`classify`, `deduplicate`, `parse_extract`) avec des fixtures de state mock.

### Tests d'intégration nécessitent les services externes
- **Fichier** : `tests/test_integration.py`
- **Problème** : Les tests d'intégration dépendent de PostgreSQL et MinIO en live, ce qui les rend inutilisables en CI sans services.
- **Action** : Utiliser `pytest-docker` ou `testcontainers-python` pour démarrer PostgreSQL/MinIO automatiquement en CI.

---

## Comportement en cas d'échec email

### Échec d'envoi email = pipeline marqué "failed"
- **Fichiers** : `src/tenderai_bf/agents/nodes/email_report.py`, `src/tenderai_bf/agents/graph.py`
- **Problème** : Si l'envoi email échoue (ex. erreur SMTP 451 "Temporary local problem"), le pipeline entier est marqué `failed` alors que le rapport a été correctement généré et uploadé sur MinIO. L'erreur email est traitée comme une erreur fatale, ce qui est trompeur opérationnellement.
- **Action** : Distinguer les erreurs fatales (pas de rapport généré) des erreurs non-bloquantes (rapport généré mais email non envoyé). En cas d'échec email, marquer le run `completed_with_warnings` et logguer un avertissement plutôt que de basculer vers `error_handler`.

---

## Priorités suggérées

| Priorité | Item | Impact | Effort |
|----------|------|--------|--------|
| Critique | Credentials exposés | Sécurité | Faible |
| Critique | JWT secret sans fallback | Sécurité | Faible |
| Haute | Gestion d'erreurs pipeline | Fiabilité | Moyen |
| Haute | Échec email non-bloquant | Fiabilité | Faible |
| Haute | chunk_size RAG | Qualité extraction | Faible |
| Moyenne | respect_robots_txt | Légal/Conformité | Faible |
| Moyenne | Fichiers de prototypage | Propreté code | Faible |
| Moyenne | Tests nœuds agents | Maintenabilité | Élevé |
| Basse | Parallélisme pipeline | Performance | Élevé |
| Basse | Nouvelles sources | Valeur métier | Élevé |
