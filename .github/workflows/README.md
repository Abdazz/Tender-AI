# GitHub Actions CI/CD Pipeline

Ce document explique comment configurer et utiliser le pipeline CI/CD pour TenderAI BF.

## 📋 Vue d'ensemble

Le pipeline GitHub Actions automatise les processus suivants:
- ✅ Linting et vérification du formatage du code
- ✅ Vérification des types avec mypy
- ✅ Tests unitaires avec couverture de code
- 🐳 Build et push des images Docker vers GitHub Container Registry
- 🚀 Déploiement automatique sur les environnements staging et production
- 🔒 Scan de sécurité avec Trivy

## 🔧 Configuration des secrets GitHub

### Secrets requis

Allez dans **Settings > Secrets and variables > Actions** de votre dépôt GitHub et ajoutez les secrets suivants:

#### Pour le déploiement Production:
```
SSH_PRIVATE_KEY          # Clé SSH privée pour accéder au serveur
PRODUCTION_HOST          # Adresse IP ou nom de domaine du serveur (ex: 192.168.1.100)
PRODUCTION_USER          # Nom d'utilisateur SSH (ex: deploy)
PRODUCTION_SSH_PORT      # Port SSH (optionnel, défaut: 22)
PRODUCTION_DEPLOY_PATH   # Chemin de déploiement (optionnel, défaut: /opt/tenderai-bf)
```

#### Pour le déploiement Staging:
```
STAGING_HOST             # Adresse IP ou nom de domaine du serveur staging
STAGING_USER             # Nom d'utilisateur SSH pour staging
STAGING_SSH_PORT         # Port SSH staging (optionnel, défaut: 22)
STAGING_DEPLOY_PATH      # Chemin de déploiement staging (optionnel, défaut: /opt/tenderai-bf-staging)
```

#### Pour la couverture de code (optionnel):
```
CODECOV_TOKEN            # Token Codecov pour l'upload des rapports de couverture
```

### Génération de la clé SSH

Sur votre machine locale:
```bash
# Générer une paire de clés SSH
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/tenderai_deploy

# Copier la clé publique sur le serveur
ssh-copy-id -i ~/.ssh/tenderai_deploy.pub user@server

# Copier le contenu de la clé privée
cat ~/.ssh/tenderai_deploy
# Copiez ce contenu et ajoutez-le comme secret SSH_PRIVATE_KEY dans GitHub
```

## 🌍 Environnements GitHub

Configurez les environnements dans **Settings > Environments**:

### Production
- **Name**: `production`
- **URL**: https://tender-ai.yulcom.net
- **Protection rules** (recommandé):
  - ✅ Required reviewers (1-2 reviewers)
  - ✅ Wait timer: 5 minutes

### Staging
- **Name**: `staging`
- **URL**: https://staging.tender-ai.yulcom.net
- **Protection rules**: Aucune (déploiement automatique)

## 🚀 Déclencheurs du pipeline

### Push sur main
- ✅ Lint & Tests
- 🐳 Build des images Docker
- 🚀 Déploiement automatique en **production**
- 🔒 Scan de sécurité

### Push sur develop
- ✅ Lint & Tests
- 🐳 Build des images Docker
- 🚀 Déploiement automatique en **staging**

### Pull Request
- ✅ Lint & Tests uniquement
- ❌ Pas de build ni déploiement

### Tags (v*)
- ✅ Lint & Tests
- 🐳 Build des images Docker avec version sémantique
- 🚀 Déploiement en production

## 📦 Images Docker

Les images sont poussées vers GitHub Container Registry:
```
ghcr.io/abdazz/tenderai-bf-api:latest
ghcr.io/abdazz/tenderai-bf-api:main
ghcr.io/abdazz/tenderai-bf-api:v1.0.0

ghcr.io/abdazz/tenderai-bf-ui:latest
ghcr.io/abdazz/tenderai-bf-worker:latest
```

### Tags des images
- `latest` - Dernière version de la branche main
- `main` - Dernière version de la branche main
- `develop` - Dernière version de la branche develop
- `v1.0.0` - Version sémantique (tags git)
- `main-abc123` - SHA du commit

## 🔄 Workflow de déploiement

### Préparation du serveur

Sur votre serveur de production/staging:

```bash
# 1. Installer Docker et Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# 2. Cloner le dépôt et utiliser le script de déploiement
git clone https://github.com/Abdazz/Tender-AI.git /tmp/tenderai-setup
cd /tmp/tenderai-setup

# 3. Utiliser le script de déploiement automatique
sudo ./scripts/deploy.sh main deploy

# Ou manuellement:
# sudo mkdir -p /opt/tenderai-bf
# sudo chown $USER:$USER /opt/tenderai-bf
# cd /opt/tenderai-bf
# git clone https://github.com/Abdazz/Tender-AI.git .
# cp .env.prod.example .env
# nano .env  # Configurer les variables d'environnement
# cp docker-compose.server.yml docker-compose.override.yml
# docker compose --env-file .env up -d
# docker-compose exec api alembic upgrade head
```

### Processus de déploiement automatique

1. **Merge ou push sur main/develop**
2. GitHub Actions:
   - Execute les tests
   - Build les images Docker
   - Push vers GitHub Container Registry
3. Connexion SSH au serveur
4. Pull du code et des images depuis le registry
5. Active docker-compose.override.yml pour utiliser les images pré-construites
6. Exécution des migrations de base de données
7. Redémarrage des services (zero-downtime)
8. Nettoyage des anciennes images
9. Health check de l'application

**Note**: Le même fichier `docker-compose.server.yml` est utilisé pour tous les environnements. En production, le fichier `docker-compose.override.yml` (copié depuis `docker-compose.server.yml`) configure l'utilisation des images du registry au lieu de rebuilder localement.

## 🧪 Tests en local

Avant de push, testez le workflow localement:

```bash
# Linting
make lint

# Tests
make test

# Type checking
make type-check

# Tous les checks CI
make ci
```

## 📊 Monitoring du pipeline

### Visualiser les workflows
https://github.com/Abdazz/Tender-AI/actions

### Logs du déploiement
Cliquez sur un workflow > Deploy to Production/Staging > Voir les logs

### En cas d'échec
1. Vérifiez les logs dans GitHub Actions
2. Vérifiez la connectivité SSH au serveur
3. Vérifiez les secrets configurés
4. Vérifiez les logs du serveur: `docker-compose logs -f`

## �️ Utilisation du script de déploiement

Le script `scripts/deploy.sh` facilite le déploiement manuel :

```bash
# Déployer depuis main (production)
./scripts/deploy.sh main deploy

# Déployer depuis develop (staging)
./scripts/deploy.sh develop deploy

# Voir l'état du déploiement
./scripts/deploy.sh main status

# Voir les logs
./scripts/deploy.sh main logs api
./scripts/deploy.sh main logs ui

# Créer un backup de la base de données
./scripts/deploy.sh main backup

# Rollback vers une version précédente
./scripts/deploy.sh main rollback

# Redémarrer les services
./scripts/deploy.sh main restart
./scripts/deploy.sh main restart api  # Redémarrer un service spécifique
```

## �🔐 Sécurité

### Best practices
- ✅ Ne commitez jamais de secrets dans le code
- ✅ Utilisez GitHub Secrets pour toutes les données sensibles
- ✅ Configurez ENVIRONMENT=production dans le .env en production
- ✅ Limitez l'accès SSH aux IPs de GitHub Actions (optionnel)
- ✅ Activez les protection rules pour la production
- ✅ Activez 2FA sur votre compte GitHub
- ✅ Révoquez et régénérez les clés SSH périodiquement

### Scan de vulnérabilités
Le pipeline exécute Trivy pour scanner les images Docker. Les résultats sont disponibles dans:
**Security > Code scanning alerts**

## 🆘 Dépannage

### Échec de connexion SSH
```bash
# Vérifier la connectivité
ssh -p PORT user@host

# Vérifier les permissions de la clé
chmod 600 ~/.ssh/tenderai_deploy
```

### Échec du pull d'images Docker
```bash
# Sur le serveur, se connecter au registry
echo "GITHUB_TOKEN" | docker login ghcr.io -u USERNAME --password-stdin
```

### Échec des migrations
```bash
# Vérifier l'état de la base de données
docker-compose exec api alembic current

# Rollback si nécessaire
docker-compose exec api alembic downgrade -1
```

## 📚 Ressources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Docker Documentation](https://docs.docker.com/)
- [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)

## 🔄 Rollback

En cas de problème après un déploiement:

```bash
# Sur le serveur
cd /opt/tenderai-bf

# Revenir au commit précédent
git log --oneline -n 5
git checkout COMMIT_HASH

# Relancer le déploiement
docker-compose pull
docker-compose up -d

# Rollback de la base de données si nécessaire
docker-compose exec api alembic downgrade -1
```

## 📝 Notes

- Le déploiement en production nécessite une approbation manuelle si configuré
- Les images Docker sont conservées indéfiniment sur GHCR (gérer manuellement si nécessaire)
- Les logs des workflows sont conservés 90 jours par défaut
