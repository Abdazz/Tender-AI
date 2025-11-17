# 🚀 Guide de Déploiement Production

Ce guide explique comment déployer TenderAI BF en production avec GitHub Actions CI/CD.

## 📋 Table des matières

- [Déploiement automatique (CI/CD)](#déploiement-automatique-cicd)
- [Déploiement manuel](#déploiement-manuel)
- [Configuration des environnements](#configuration-des-environnements)
- [Maintenance](#maintenance)

## Déploiement automatique (CI/CD)

### 1. Configuration initiale

#### Sur GitHub

1. **Configurer les secrets GitHub** (Settings > Secrets and variables > Actions)

   **Production:**
   ```
   SSH_PRIVATE_KEY          # Clé SSH privée pour le serveur
   PRODUCTION_HOST          # IP ou domaine (ex: 192.168.1.100)
   PRODUCTION_USER          # Utilisateur SSH (ex: deploy)
   PRODUCTION_SSH_PORT      # Port SSH (optionnel, défaut: 22)
   PRODUCTION_DEPLOY_PATH   # Chemin de déploiement (optionnel, défaut: /opt/tenderai-bf)
   ```

   **Staging:**
   ```
   STAGING_HOST
   STAGING_USER
   STAGING_SSH_PORT
   STAGING_DEPLOY_PATH
   ```

2. **Générer une clé SSH** (sur votre machine locale)
   
   ```bash
   # Générer la paire de clés
   ssh-keygen -t ed25519 -C "github-deploy-tenderai" -f ~/.ssh/tenderai_deploy
   
   # Copier la clé publique sur le serveur
   ssh-copy-id -i ~/.ssh/tenderai_deploy.pub user@server
   
   # Afficher la clé privée pour l'ajouter dans GitHub Secrets
   cat ~/.ssh/tenderai_deploy
   ```

3. **Configurer les environnements GitHub** (Settings > Environments)
   
   - **production**: Avec protection rules (required reviewers)
   - **staging**: Déploiement automatique

#### Sur le serveur de production

```bash
# 1. Installer Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker

# 2. Installation initiale avec le script
git clone https://github.com/Abdazz/Tender-AI.git /tmp/tenderai-temp
sudo /tmp/tenderai-temp/scripts/deploy.sh main deploy

# Le script va:
# - Créer /opt/tenderai-bf
# - Cloner le repository
# - Configurer l'environnement
# - Démarrer les services
```

### 2. Workflow automatique

Une fois configuré, le déploiement est automatique:

#### Production (branche main)
```bash
git checkout main
git add .
git commit -m "feat: nouvelle fonctionnalité"
git push origin main
```

Le workflow GitHub Actions va:
1. ✅ Exécuter les tests
2. 🐳 Builder les images Docker
3. 📦 Push vers GitHub Container Registry
4. 🚀 Déployer automatiquement en production

#### Staging (branche develop)
```bash
git checkout develop
git add .
git commit -m "test: nouvelle feature"
git push origin develop
```

Déploiement automatique sur l'environnement staging.

### 3. Monitoring du déploiement

Surveillez le déploiement sur: https://github.com/Abdazz/Tender-AI/actions

## Déploiement manuel

### Utilisation du script de déploiement

Le script `scripts/deploy.sh` simplifie le déploiement manuel:

```bash
# Déploiement complet
./scripts/deploy.sh main deploy

# Voir le statut
./scripts/deploy.sh main status

# Voir les logs
./scripts/deploy.sh main logs api
./scripts/deploy.sh main logs ui
./scripts/deploy.sh main logs worker

# Backup de la base de données
./scripts/deploy.sh main backup

# Rollback vers version précédente
./scripts/deploy.sh main rollback

# Redémarrer les services
./scripts/deploy.sh main restart
./scripts/deploy.sh main restart api  # Service spécifique
```

### Déploiement pas à pas

Si vous préférez le contrôle manuel total:

```bash
# 1. Se connecter au serveur
ssh user@production-server

# 2. Aller dans le répertoire de déploiement
cd /opt/tenderai-bf

# 3. Pull du code
git pull origin main

# 4. Configurer pour utiliser les images du registry
cp docker-compose.override.prod.yml docker-compose.override.yml

# 5. Login au registry GitHub (optionnel, sinon build local)
echo "YOUR_GITHUB_TOKEN" | docker login ghcr.io -u abdazz --password-stdin

# 6. Pull des images (ou skip pour build local)
docker-compose pull

# 7. Migrations de base de données
docker-compose run --rm api alembic upgrade head

# 8. Redémarrer les services
docker-compose up -d

# 9. Vérifier le statut
docker-compose ps
curl http://localhost:8000/health
```

## Configuration des environnements

### Variables d'environnement (.env)

Copiez `.env.example` vers `.env` et configurez:

```bash
# Base de données
DATABASE_PASSWORD=STRONG_PASSWORD_HERE

# MinIO (stockage)
MINIO_ACCESS_KEY=YOUR_ACCESS_KEY
MINIO_SECRET_KEY=YOUR_SECRET_KEY

# Email SMTP
SMTP_HOST=smtp.gmail.com
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
EMAIL_TO_ADDRESS=recipient@example.com

# LLM Provider (choisir un)
LLM_PROVIDER=groq
GROQ_API_KEY=your-groq-api-key

# Sécurité
ADMIN_PASSWORD=STRONG_ADMIN_PASSWORD
SECRET_KEY=LONG_RANDOM_SECRET_KEY

# Environnement
ENVIRONMENT=production
LOG_LEVEL=INFO
```

### Différences par environnement

#### Production
```env
ENVIRONMENT=production
LOG_LEVEL=INFO
ENABLE_SCHEDULER=true
```

#### Staging
```env
ENVIRONMENT=staging
LOG_LEVEL=DEBUG
ENABLE_SCHEDULER=false
```

#### Development
```env
ENVIRONMENT=development
LOG_LEVEL=DEBUG
ENABLE_SCHEDULER=false
```

### Docker Compose Override

En production, utilisez `docker-compose.override.yml`:

```bash
# Active l'override pour utiliser les images du registry
cp docker-compose.override.prod.yml docker-compose.override.yml
```

Cela configure:
- Utilisation des images pré-construites depuis GitHub Container Registry
- Pas de rebuild local
- Optimisations de ressources (CPU/Memory limits)
- Pas de hot-reload du code

## Maintenance

### Backups automatiques

Créez un cron job pour les backups réguliers:

```bash
# Editer crontab
crontab -e

# Ajouter: Backup tous les jours à 2h du matin
0 2 * * * cd /opt/tenderai-bf && ./scripts/deploy.sh main backup
```

### Monitoring des logs

```bash
# Logs en temps réel
docker-compose logs -f

# Logs d'un service spécifique
docker-compose logs -f api
docker-compose logs -f worker

# Dernières 100 lignes
docker-compose logs --tail=100 api
```

### Health checks

```bash
# API
curl http://localhost:8000/health

# Services Docker
docker-compose ps

# Ressources
docker stats
```

### Mise à jour des secrets

```bash
# 1. Editer .env
nano /opt/tenderai-bf/.env

# 2. Redémarrer les services
docker-compose restart
```

### Rollback en cas de problème

#### Automatique avec le script
```bash
./scripts/deploy.sh main rollback
# Puis sélectionner le commit vers lequel revenir
```

#### Manuel
```bash
cd /opt/tenderai-bf

# Voir l'historique
git log --oneline -n 10

# Revenir à un commit spécifique
git checkout COMMIT_HASH

# Redéployer
docker-compose up -d
```

### Gestion des volumes

```bash
# Lister les volumes
docker volume ls

# Backup d'un volume
docker run --rm -v tenderai_postgres-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/postgres-backup.tar.gz -C /data .

# Restore d'un volume
docker run --rm -v tenderai_postgres-data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/postgres-backup.tar.gz -C /data
```

### Nettoyage

```bash
# Nettoyer les images inutilisées
docker image prune -f

# Nettoyer les volumes inutilisés (ATTENTION: perte de données)
docker volume prune -f

# Nettoyer tout (ATTENTION: arrête les conteneurs)
docker system prune -a --volumes
```

## Sécurité en production

### Checklist de sécurité

- [ ] Firewall configuré (ufw/iptables)
- [ ] Accès SSH par clé seulement (pas de password)
- [ ] Ports exposés minimaux (reverse proxy recommandé)
- [ ] Secrets stockés dans .env (jamais dans git)
- [ ] HTTPS activé (Let's Encrypt)
- [ ] Mots de passe forts partout
- [ ] Backups réguliers configurés
- [ ] Monitoring et alertes en place

### Reverse Proxy (Nginx/Caddy)

Recommandé pour la production:

```nginx
# /etc/nginx/sites-available/tenderai
server {
    listen 80;
    server_name tender-ai.yulcom.net;
    
    location / {
        proxy_pass http://localhost:7860;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### SSL/TLS (Let's Encrypt)

```bash
# Installer certbot
sudo apt install certbot python3-certbot-nginx

# Obtenir un certificat
sudo certbot --nginx -d tender-ai.yulcom.net

# Renouvellement automatique (déjà configuré par certbot)
sudo certbot renew --dry-run
```

## Dépannage

### Les services ne démarrent pas

```bash
# Vérifier les logs
docker-compose logs api

# Vérifier la config
docker-compose config

# Vérifier le .env
cat .env
```

### Base de données inaccessible

```bash
# Vérifier PostgreSQL
docker-compose ps postgres
docker-compose logs postgres

# Se connecter à la DB
docker-compose exec postgres psql -U tenderai -d tenderai_bf
```

### Erreur de migration

```bash
# Voir l'état actuel
docker-compose exec api alembic current

# Réinitialiser (ATTENTION: perte de données)
docker-compose exec api alembic downgrade base
docker-compose exec api alembic upgrade head
```

### Espace disque insuffisant

```bash
# Vérifier l'espace
df -h

# Nettoyer Docker
docker system df
docker system prune -a

# Nettoyer les logs
sudo journalctl --vacuum-time=7d
```

## Ressources

- [Documentation complète](.github/workflows/README.md)
- [API Documentation](http://localhost:8000/docs)
- [GitHub Actions](https://github.com/Abdazz/Tender-AI/actions)
- [Issues](https://github.com/Abdazz/Tender-AI/issues)
