# Architecture Nginx: Apache2 → Nginx Docker → Applications

## Contexte

L'application TenderAI BF utilise une architecture à deux niveaux de reverse proxy pour coexister avec d'autres applications sur le même serveur.

## Architecture

```
Internet (HTTPS 443)
    ↓
Apache2 (host) - Gère SSL et toutes les applications
    ↓ proxy → localhost:8080
Nginx Docker - Reverse proxy pour TenderAI uniquement  
    ↓
API, UI, Worker containers
```

## Pourquoi cette architecture ?

✅ **Pas de conflit de ports** : Apache2 reste sur 443, Nginx Docker sur 8080 (localhost)  
✅ **Autres applications préservées** : Apache2 gère tous les sites  
✅ **SSL centralisé** : Un seul point de gestion SSL (Apache2)  
✅ **Isolation** : Nginx Docker optimisé uniquement pour TenderAI  
✅ **Configuration versionnée** : nginx.conf dans Git

## Changements

### Avant
- Apache2 directement vers les conteneurs ?
- Ports potentiellement exposés publiquement

### Après
- Apache2 (443) → Nginx Docker (8080) → Containers
- Tous les ports Docker internes seulement
- Configuration Nginx versionnée dans le repo

## Certificats SSL

Les certificats SSL restent sur le host et sont montés dans le conteneur :

```yaml
volumes:
  - /etc/letsencrypt/live/tender-ai.yulcom.net/fullchain.pem:/etc/nginx/ssl/fullchain.pem:ro
  - /etc/letsencrypt/live/tender-ai.yulcom.net/privkey.pem:/etc/nginx/ssl/privkey.pem:ro
  - /etc/letsencrypt:/etc/letsencrypt:ro
```

## Renouvellement SSL

Le renouvellement Let's Encrypt continue de fonctionner sur le host. Après renouvellement, rechargez Nginx :

```bash
# Dans le hook de renouvellement (/etc/letsencrypt/renewal-hooks/post/)
cd /home/yulcom/tenderai/rfp-watch-ai
docker-compose exec nginx nginx -s reload
```

## Gestion Nginx

### Vérifier le statut
```bash
# Nginx Docker
docker-compose ps nginx
docker-compose logs nginx

# Nginx host (ne devrait plus être actif)
sudo systemctl status nginx
```

### Redémarrer Nginx
```bash
# Redémarrer le conteneur
docker-compose restart nginx

# Recharger la configuration (sans interruption)
docker-compose exec nginx nginx -s reload
```

### Modifier la configuration

1. Éditez `infra/nginx/nginx.conf` dans le repo
2. Committez et poussez
3. Le déploiement CI/CD appliquera les changements

Ou manuellement sur le serveur :
```bash
cd /home/yulcom/tenderai/rfp-watch-ai
git pull
docker-compose exec nginx nginx -s reload
```

## Avantages

✅ **Configuration versionnée** : nginx.conf dans Git  
✅ **Déploiement cohérent** : même environnement dev/prod  
✅ **Isolation** : Nginx isolé dans Docker  
✅ **Rollback facile** : via Git  
✅ **Logs centralisés** : avec les autres services

## Si vous devez réactiver le Nginx host

```bash
# Arrêter le conteneur Nginx Docker
cd /home/yulcom/tenderai/rfp-watch-ai
docker-compose stop nginx

# Réactiver Nginx host
sudo systemctl enable nginx
sudo systemctl start nginx
```

⚠️ **Note** : Le prochain déploiement CI/CD arrêtera à nouveau le Nginx host.

## Ports utilisés

| Service | Port Host | Port Container | Accès |
|---------|-----------|----------------|-------|
| Apache2 | 80, 443 | - | Public (toutes apps) |
| Nginx Docker | 8080 (localhost) | 80 | Interne seulement |
| Nginx Docker | 8443 (localhost) | 443 | Interne seulement |
| API | - | 8000 | Interne Docker |
| UI | - | 7860 | Interne Docker |
| PostgreSQL | - | 5432 | Interne Docker |
| MinIO | - | 9000, 9001 | Interne Docker |

## Configuration Apache2

Voir le guide complet : **[APACHE2_SETUP.md](APACHE2_SETUP.md)**

Configuration du VirtualHost dans `/etc/apache2/sites-available/tender-ai.yulcom.net.conf` :

```apache
<VirtualHost *:443>
    ServerName tender-ai.yulcom.net
    
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/tender-ai.yulcom.net/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/tender-ai.yulcom.net/privkey.pem
    
    # Proxy vers Nginx Docker
    ProxyPass / http://127.0.0.1:8080/
    ProxyPassReverse / http://127.0.0.1:8080/
    
    # WebSocket support
    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} =websocket [NC]
    RewriteRule /(.*)  ws://127.0.0.1:8080/$1 [P,L]
</VirtualHost>
```

Installation :
```bash
sudo cp infra/apache2/tender-ai.yulcom.net.conf /etc/apache2/sites-available/
sudo a2enmod proxy proxy_http proxy_wstunnel ssl headers rewrite
sudo a2ensite tender-ai.yulcom.net
sudo systemctl reload apache2
```

## Dépannage

### Port 443 déjà utilisé
```bash
# Vérifier quel processus utilise le port
sudo netstat -tlnp | grep :443
sudo lsof -i :443

# Si c'est Nginx host
sudo systemctl stop nginx
sudo systemctl disable nginx

# Redémarrer le conteneur
cd /home/yulcom/tenderai/rfp-watch-ai
docker-compose up -d nginx
```

### Nginx ne démarre pas
```bash
# Vérifier les logs
docker-compose logs nginx

# Vérifier la config
docker-compose exec nginx nginx -t

# Vérifier que les certificats sont accessibles
sudo ls -la /etc/letsencrypt/live/tender-ai.yulcom.net/
```

### Certificats SSL non trouvés
```bash
# Vérifier que les certificats existent
sudo ls -la /etc/letsencrypt/live/tender-ai.yulcom.net/

# Vérifier les permissions
sudo chmod 755 /etc/letsencrypt/live
sudo chmod 755 /etc/letsencrypt/archive
```

## Ressources

- Configuration Nginx : `infra/nginx/nginx.conf`
- Docker Compose prod : `docker-compose.override.prod.yml`
- Workflow CI/CD : `.github/workflows/ci-cd.yml`
- Guide SSL : `SSL_SETUP.md`
