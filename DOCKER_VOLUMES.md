# 🔄 Configuration Docker avec Volumes Montés

## 📋 Vue d'ensemble

Le projet utilise des **volumes Docker** pour monter le code source directement dans les containers. Cela permet de **développer sans rebuilder** les images à chaque modification.

## ✅ Avantages

### 1. **Développement Rapide**
- Modifier le code dans `./src/`
- **Pas besoin de rebuild** 
- Les changements sont **instantanés**

### 2. **Hot Reload Automatique**
- **API** : Uvicorn avec `--reload` détecte les changements
- **UI** : Gradio recharge automatiquement
- **Worker** : Redémarrage rapide avec `docker compose restart worker`

### 3. **Simplicité**
- Une seule configuration `docker-compose.yml`
- Fonctionne partout (dev, staging, prod)

---

## 📂 Volumes Montés

### Service API
```yaml
volumes:
  - ./src:/app/src              # Code source Python
  - ./alembic:/app/alembic      # Migrations DB
  - ./settings.yaml:/app/settings.yaml  # Configuration
  - ./logs:/app/logs            # Logs
```

### Service UI
```yaml
volumes:
  - ./src:/app/src              # Code source Python
  - ./settings.yaml:/app/settings.yaml  # Configuration
  - ./logs:/app/logs            # Logs
```

### Service Worker
```yaml
volumes:
  - ./src:/app/src              # Code source Python
  - ./settings.yaml:/app/settings.yaml  # Configuration
  - ./logs:/app/logs            # Logs
```

---

## 🚀 Workflow de Développement

### 1. Démarrage Initial (une seule fois)

```bash
# Build des images (seulement la première fois)
docker compose build

# Démarrer tous les services
docker compose up -d

# Voir les logs
docker compose logs -f
```

### 2. Développement Quotidien

```bash
# Les services sont déjà en cours d'exécution
docker compose ps

# ✨ Modifier le code dans ./src/tenderai_bf/
# Par exemple: src/tenderai_bf/api/routers/sources.py

# ✅ L'API recharge automatiquement (hot reload activé)
# Vérifier les logs :
docker compose logs -f api

# Vous verrez :
# WARNING: watchfiles detected changes in 'src/tenderai_bf/...'
# INFO: Application reload complete
```

### 3. Modifications du Settings

```bash
# Modifier settings.yaml
nano settings.yaml

# Redémarrer les services concernés (rapide, pas de rebuild)
docker compose restart api worker ui
```

### 4. Redémarrage Rapide

```bash
# Un seul service
docker compose restart api

# Tous les services applicatifs
docker compose restart api ui worker

# Arrêter et redémarrer tout
docker compose down
docker compose up -d
```

---

## ⚠️ Quand Faut-il Rebuilder ?

Vous devez **rebuilder** uniquement dans ces cas :

### ❌ Rebuild NÉCESSAIRE pour :
- Changements dans `pyproject.toml` (nouvelles dépendances)
- Changements dans `poetry.lock`
- Modifications des `Dockerfile.*`
- Ajout de packages système (apt-get, tesseract, etc.)

```bash
# Rebuild d'un service
docker compose build api

# Rebuild de tous les services
docker compose build

# Rebuild sans cache (si problème)
docker compose build --no-cache
```

### ✅ Rebuild PAS NÉCESSAIRE pour :
- Modifications du code Python dans `./src/`
- Changements dans `settings.yaml`
- Modifications des migrations Alembic
- Ajout/modification de fichiers `.py`

**✨ Juste redémarrer suffit !**

```bash
docker compose restart api
```

---

## 🔥 Hot Reload en Action

### API (FastAPI)

L'API utilise `uvicorn --reload` qui surveille automatiquement :

```bash
# Modifier un fichier
echo "# Test change" >> src/tenderai_bf/api/routers/sources.py

# Logs API :
# WARNING: watchfiles detected changes in 'src/tenderai_bf/api/routers/sources.py'
# INFO: Application reload complete (0.15s)
```

### UI (Gradio)

```bash
# Modifier l'UI
nano src/tenderai_bf/ui/app.py

# Rafraîchir la page dans le navigateur
# http://localhost:7860
```

### Worker

Le worker n'a pas de hot reload automatique :

```bash
# Modifier le code worker
nano src/tenderai_bf/agents/nodes/fetch_listings.py

# Redémarrer (< 5 secondes)
docker compose restart worker
```

---

## 🛠️ Commandes Utiles

### Vérifier les Volumes

```bash
# Voir les volumes montés
docker compose exec api ls -la /app/src

# Vérifier que le code est bien monté
docker compose exec api cat /app/src/tenderai_bf/__init__.py
```

### Logs en Temps Réel

```bash
# Tous les services
docker compose logs -f

# Un service spécifique
docker compose logs -f api

# Filtrer par keyword
docker compose logs -f api | grep ERROR
```

### Status des Services

```bash
# Voir l'état
docker compose ps

# Statistiques CPU/Mémoire
docker stats tenderai-api tenderai-ui tenderai-worker
```

---

## 📊 Comparaison : Avant vs Après

### ⏱️ Avant (sans volumes montés)

```bash
# Modifier le code
nano src/tenderai_bf/api/routers/sources.py

# Rebuild (2-5 minutes)
docker compose build api

# Redémarrer
docker compose up -d api

# TOTAL: ~3-7 minutes par changement 😫
```

### ⚡ Après (avec volumes montés)

```bash
# Modifier le code
nano src/tenderai_bf/api/routers/sources.py

# Hot reload automatique (1-2 secondes) ✨
# Ou redémarrer si nécessaire (5 secondes)
docker compose restart api

# TOTAL: ~2-5 secondes par changement 🚀
```

**Gain de temps : 99% plus rapide !**

---

## 🎯 Cas d'Usage Typiques

### Modifier une Route API

```bash
# 1. Modifier le fichier
nano src/tenderai_bf/api/routers/sources.py

# 2. Uvicorn recharge automatiquement
# 3. Tester immédiatement
curl http://localhost:8000/api/v1/sources
```

### Changer la Configuration

```bash
# 1. Modifier settings.yaml
nano settings.yaml

# 2. Redémarrer (pas de rebuild)
docker compose restart api worker

# 3. Changements actifs en 5 secondes
```

### Ajouter un Nouveau Module

```bash
# 1. Créer le fichier
touch src/tenderai_bf/agents/nodes/new_node.py
nano src/tenderai_bf/agents/nodes/new_node.py

# 2. Importer dans le code existant
nano src/tenderai_bf/agents/graph.py

# 3. Hot reload prend en charge automatiquement
# Pas de rebuild nécessaire !
```

### Ajouter une Dépendance

```bash
# 1. Ajouter via Poetry
docker compose exec api poetry add httpx-auth

# OU modifier pyproject.toml
nano pyproject.toml

# 2. Rebuild NÉCESSAIRE
docker compose build api

# 3. Redémarrer
docker compose up -d api
```

---

## 💡 Conseils

### Performance

- Les volumes montés ont une **excellente performance** sur Linux
- Légèrement plus lent sur macOS/Windows (mais toujours mieux que rebuild)
- Utiliser Docker Desktop avec WSL2 sur Windows pour meilleures performances

### Sécurité

- En production, vous pouvez désactiver les volumes source si souhaité
- Ou simplement ne pas monter `./src` dans l'environnement prod
- Le hot reload n'est actif que si `--reload` est passé à uvicorn

### Debugging

- Ajouter des `print()` ou `logger.debug()` dans le code
- Voir immédiatement dans `docker compose logs -f api`
- Pas besoin de rebuild !

---

## 🔍 Troubleshooting

### Problème : Les changements ne sont pas détectés

```bash
# Vérifier que le volume est bien monté
docker compose exec api ls -la /app/src/tenderai_bf

# Redémarrer le service
docker compose restart api

# Vérifier les logs pour le reload
docker compose logs -f api | grep reload
```

### Problème : Permission Denied

```bash
# S'assurer que le user tenderai peut lire les fichiers
# Sur l'hôte :
chmod -R 755 src/

# Recréer le container
docker compose up -d --force-recreate api
```

### Problème : Module non trouvé après ajout

```bash
# Rebuild si nouvelle dépendance
docker compose build api

# Sinon, juste restart
docker compose restart api
```

---

## 🎉 Résumé

✅ **Volumes montés activés** pour `api`, `ui`, et `worker`  
✅ **Hot reload** configuré pour l'API  
✅ **Pas de rebuild** nécessaire pour les changements de code  
✅ **Développement ultra-rapide** avec feedback immédiat  
✅ **Configuration simple** avec un seul `docker-compose.yml`  

**Développez rapidement, testez instantanément ! 🚀**
