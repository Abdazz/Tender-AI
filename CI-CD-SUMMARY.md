# 🚀 CI/CD avec GitHub Actions - Résumé

## ✅ Ce qui a été créé

### 1. Workflow GitHub Actions (`.github/workflows/ci-cd.yml`)
- ✅ Lint et vérification du code (Ruff)
- ✅ Type checking (mypy)
- ✅ Tests unitaires avec couverture
- ✅ Build des 3 images Docker (api, ui, worker)
- ✅ Push vers GitHub Container Registry
- ✅ Déploiement automatique production (branch main)
- ✅ Déploiement automatique staging (branch develop)
- ✅ Scan de sécurité (Trivy)

### 2. Script de déploiement (`scripts/deploy.sh`)
Permet le déploiement manuel avec :
- Installation complète sur nouveau serveur
- Déploiement/mise à jour
- Backup de base de données
- Rollback vers version précédente
- Gestion des logs
- Redémarrage des services

### 3. Configuration Docker pour production
- `docker-compose.override.prod.yml` - Override pour utiliser les images du registry
- `infra/nginx/nginx.conf` - Configuration Nginx pour reverse proxy
- **Un seul `docker-compose.yml` pour tous les environnements** ✨

### 4. Documentation
- `.github/workflows/README.md` - Guide CI/CD complet
- `DEPLOYMENT.md` - Guide de déploiement production détaillé
- `.github/workflows/INFO.md` - Résumé de la structure

## 🎯 Points clés

### Utilisation du même docker-compose.yml
✅ **Pas de fichier séparé** - Le même `docker-compose.yml` est utilisé partout

En développement :
```bash
# Build local, hot reload, volumes montés
docker-compose up -d
```

En production :
```bash
# Copier l'override de production
cp docker-compose.override.prod.yml docker-compose.override.yml

# Docker Compose merge automatiquement les deux fichiers
# Utilise les images du registry, pas de rebuild
docker-compose pull
docker-compose up -d
```

### Fichier .env unique
✅ **Un seul `.env.example`** pour tous les environnements

Différenciation par la variable `ENVIRONMENT` :
```bash
# .env en développement
ENVIRONMENT=development

# .env en production
ENVIRONMENT=production
```

## 📋 Checklist de mise en place

### Sur GitHub
- [ ] Configurer les secrets (SSH_PRIVATE_KEY, PRODUCTION_HOST, etc.)
- [ ] Créer les environnements (production, staging)
- [ ] Activer GitHub Container Registry

### Sur le serveur
- [ ] Installer Docker et Docker Compose
- [ ] Générer et installer la clé SSH
- [ ] Cloner le repo dans `/opt/tenderai-bf`
- [ ] Créer le fichier `.env` depuis `.env.example`
- [ ] Copier `docker-compose.override.prod.yml` → `docker-compose.override.yml`
- [ ] Premier déploiement : `./scripts/deploy.sh main deploy`

### Workflow automatique
Une fois configuré :
```bash
# Push sur main = déploiement automatique en production
git push origin main

# Push sur develop = déploiement automatique en staging
git push origin develop
```

## 🛠️ Commandes utiles

### Déploiement manuel
```bash
# Installation complète
./scripts/deploy.sh main deploy

# Voir le statut
./scripts/deploy.sh main status

# Logs
./scripts/deploy.sh main logs api

# Backup
./scripts/deploy.sh main backup

# Rollback
./scripts/deploy.sh main rollback
```

### Docker Compose
```bash
# Développement (build local)
docker-compose up -d

# Production (images du registry)
cp docker-compose.override.prod.yml docker-compose.override.yml
docker-compose pull
docker-compose up -d
```

## 🔒 Sécurité

- ✅ Secrets dans GitHub Secrets (jamais dans le code)
- ✅ Clé SSH pour l'accès au serveur
- ✅ Images scannées avec Trivy
- ✅ ENVIRONMENT=production en production
- ✅ Protection rules pour la branche main

## 📚 Documentation complète

- **CI/CD** : `.github/workflows/README.md`
- **Déploiement** : `DEPLOYMENT.md`
- **Utilisation** : `README.md`

## 🎉 Prêt à déployer !

Le pipeline est configuré et prêt. Suivez simplement :
1. Configurer les secrets GitHub
2. Préparer le serveur (script deploy.sh)
3. Push sur main → Déploiement automatique ! 🚀
