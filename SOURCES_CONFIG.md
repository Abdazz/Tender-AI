# 📋 Configuration des Sources - Guide

## 🎯 Deux Modes de Gestion des Sources

Le système supporte **deux modes** de gestion des sources, contrôlés par la variable `USE_DATABASE_SOURCES` :

### Mode 1️⃣ : **YAML Direct** (Développement)
**`USE_DATABASE_SOURCES=false`** *(mode par défaut)*

- ✅ Utilise **uniquement** `settings.yaml`
- ✅ **Pas de synchronisation** avec la base de données
- ✅ **Modifications instantanées** : éditez `settings.yaml` et redémarrez
- ✅ **Parfait pour le développement** et les tests
- ✅ **Aucune dépendance** à la BDD pour les sources

**Cas d'usage :**
- Phase de développement
- Tests rapides de nouvelles sources
- Pas besoin de gérer la BDD

### Mode 2️⃣ : **Database Sync** (Production)
**`USE_DATABASE_SOURCES=true`**

- ✅ Synchronise `settings.yaml` **avec la base de données**
- ✅ Crée/met à jour les sources dans la table `sources`
- ✅ Utilise le flag `enabled` de la BDD
- ✅ **Tracking avancé** : `last_success_at`, `last_error_at`, etc.
- ✅ **Gestion via API/UI** possible

**Cas d'usage :**
- Environnement de production
- Besoin de tracking et historique
- Gestion dynamique via l'interface admin

---

## ⚙️ Configuration

### 📝 Fichier `.env`

```bash
# Sources Configuration
# If true, loads sources from database (synced with settings.yaml)
# If false, uses only settings.yaml (bypasses database, good for dev/testing)
USE_DATABASE_SOURCES=false
```

### 📄 Fichier `settings.yaml`

```yaml
sources:
  - name: "ARCOP - Autorité de régulation de la commande publique"
    list_url: "https://www.arcop.bf/appels-doffres/"
    item_url_pattern: "https://www.arcop.bf/telechargement/{id}"
    parser: "pdf"
    rate_limit: "8/m"
    enabled: true  # ✅ Active cette source
```

---

## 🔄 Workflow par Mode

### Mode YAML (USE_DATABASE_SOURCES=false)

```
1. settings.yaml
   ↓
2. Lecture des sources enabled=true
   ↓
3. Conversion au format pipeline
   ↓
4. Utilisation directe (PAS de BDD)
   ↓
5. Exécution du scraping
```

**Logs :**
```
Load sources completed (YAML mode) - sources_loaded=1
Using sources directly from settings.yaml (development mode)
```

### Mode Database (USE_DATABASE_SOURCES=true)

```
1. settings.yaml
   ↓
2. Pour chaque source dans YAML :
   - Si existe dans BDD → Mise à jour
   - Sinon → Création
   ↓
3. Lecture depuis la BDD (enabled=true)
   ↓
4. Enrichissement avec metadata BDD
   ↓
5. Exécution du scraping
   ↓
6. Mise à jour des stats BDD
```

**Logs :**
```
Load sources completed (Database mode) - sources_loaded=1
Syncing sources with database (production mode)
```

---

## 🚀 Exemples d'Utilisation

### Développement : Tester une nouvelle source rapidement

```bash
# 1. S'assurer que le mode YAML est actif
echo "USE_DATABASE_SOURCES=false" >> .env

# 2. Ajouter la source dans settings.yaml
nano settings.yaml

# 3. Redémarrer l'API
docker compose restart api

# 4. Lancer un test
curl -X POST http://localhost:8000/api/v1/runs/trigger \
  -H "Content-Type: application/json" \
  -d '{"triggered_by": "test", "send_email": false}'

# ✅ La nouvelle source est utilisée immédiatement !
```

### Production : Utiliser le mode Database

```bash
# 1. Activer le mode Database
sed -i 's/USE_DATABASE_SOURCES=false/USE_DATABASE_SOURCES=true/' .env

# 2. Redémarrer
docker compose restart api

# 3. Les sources sont maintenant synchronisées avec la BDD
# 4. Vous pouvez les gérer via l'API ou l'interface admin
```

---

## 📊 Comparaison des Modes

| Caractéristique | YAML Mode | Database Mode |
|-----------------|-----------|---------------|
| **Vitesse de développement** | ⚡ Très rapide | 🐌 Plus lent |
| **Modifications** | Éditer YAML + restart | Via API/UI ou YAML |
| **Historique** | ❌ Non | ✅ Oui (last_success, errors) |
| **Tracking** | ❌ Non | ✅ Oui (statistiques) |
| **Gestion UI** | ❌ Non | ✅ Oui |
| **Simplicité** | ✅ Simple | ⚠️ Plus complexe |
| **Recommandé pour** | 🔧 Dev & Test | 🏭 Production |

---

## 🔍 Vérification du Mode Actuel

### Via les Logs

```bash
# Regarder les logs au démarrage
docker compose logs api | grep "Load sources"

# Mode YAML affichera :
# "Using sources directly from settings.yaml (development mode)"
# "Load sources completed (YAML mode)"

# Mode Database affichera :
# "Syncing sources with database (production mode)"
# "Load sources completed (Database mode)"
```

### Via une Variable d'Environnement

```bash
# Dans le container
docker compose exec api env | grep USE_DATABASE_SOURCES

# Résultat :
# USE_DATABASE_SOURCES=false  → Mode YAML
# USE_DATABASE_SOURCES=true   → Mode Database
```

### Via Python

```python
from tenderai_bf.config import settings

print(f"Mode: {'Database' if settings.use_database_sources else 'YAML'}")
```

---

## 💡 Recommandations

### 🔧 Phase de Développement (Maintenant)

```bash
# .env
USE_DATABASE_SOURCES=false
```

**Pourquoi ?**
- Itérations rapides
- Pas de pollution de la BDD
- Facile à tester différentes configurations

### 🏭 Phase de Production (Plus tard)

```bash
# .env
USE_DATABASE_SOURCES=true
```

**Pourquoi ?**
- Tracking et monitoring
- Gestion via interface web
- Historique des erreurs
- Statistiques de performance

---

## 🛠️ Dépannage

### Problème : Sources non chargées

```bash
# Vérifier le mode actif
docker compose exec api env | grep USE_DATABASE_SOURCES

# Vérifier settings.yaml
cat settings.yaml | grep -A 10 "sources:"

# Vérifier les logs
docker compose logs api | grep "Load sources"
```

### Problème : Mode Database mais sources YAML non sync

```bash
# Forcer une synchronisation en redémarrant
docker compose restart api

# Ou basculer en mode YAML temporairement
echo "USE_DATABASE_SOURCES=false" >> .env
docker compose restart api
```

---

## 📝 Résumé

✅ **`USE_DATABASE_SOURCES=false`** : Mode développement, sources depuis YAML uniquement  
✅ **`USE_DATABASE_SOURCES=true`** : Mode production, sync avec base de données  
✅ **Changement** : Éditer `.env` + `docker compose restart api`  
✅ **Recommandation actuelle** : Garder `false` pendant le développement  

**🎯 Vous avez maintenant un contrôle total sur la source des données !**
