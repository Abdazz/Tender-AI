# Apache2 Configuration for TenderAI BF

## Architecture

```
Internet (443) → Apache2 (host) → Nginx Docker (8080) → API/UI containers
```

- **Apache2** : Gère SSL/TLS et les autres applications sur le serveur (port 443)
- **Nginx Docker** : Reverse proxy interne pour TenderAI (port 8080, localhost only)
- **API/UI** : Services backend (ports internes Docker seulement)

## Installation

### 1. Activer les modules Apache2 nécessaires

```bash
sudo a2enmod proxy proxy_http proxy_wstunnel ssl headers rewrite
```

### 2. Mettre à jour la configuration du site

Le fichier de configuration existe déjà à `/etc/apache2/sites-available/tender-ai.yulcom.net.conf`.

**Option A - Remplacer complètement** (recommandé) :
```bash
cd /home/yulcom/tenderai/rfp-watch-ai
sudo cp infra/apache2/tender-ai.yulcom.net.conf /etc/apache2/sites-available/tender-ai.yulcom.net.conf
```

**Option B - Modifier manuellement** :
```bash
sudo nano /etc/apache2/sites-available/tender-ai.yulcom.net.conf
```

Remplacez la section `<VirtualHost *:443>` pour ajouter le proxy au lieu de `DocumentRoot` :
```apache
<VirtualHost *:443>
    ServerName tender-ai.yulcom.net
    
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/tender-ai.yulcom.net/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/tender-ai.yulcom.net/privkey.pem
    
    # SUPPRIMER ces lignes :
    # DocumentRoot /home/tender-ai/tender-ai
    # <Directory /home/tender-ai/tender-ai>
    #     ...
    # </Directory>
    
    # AJOUTER ces lignes :
    ProxyPreserveHost On
    ProxyRequests Off
    ProxyPass / http://127.0.0.1:8080/
    ProxyPassReverse / http://127.0.0.1:8080/
    
    # WebSocket support
    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} =websocket [NC]
    RewriteRule /(.*)  ws://127.0.0.1:8080/$1 [P,L]
    
    ErrorLog ${APACHE_LOG_DIR}/tender-ai.yulcom.net-ssl-error.log
    CustomLog ${APACHE_LOG_DIR}/tender-ai.yulcom.net-ssl-access.log combined
</VirtualHost>
```

### 3. Vérifier la configuration

```bash
sudo apache2ctl configtest
```

Si vous voyez "Syntax OK", continuez. Sinon, corrigez les erreurs.

### 4. Recharger Apache2

```bash
sudo systemctl reload apache2
```

**Note** : Pas besoin de `a2ensite` car le site est déjà activé.

### 5. Vérifier que le Nginx Docker tourne

```bash
cd /home/yulcom/tenderai/rfp-watch-ai
docker-compose ps nginx
```

Vous devriez voir le conteneur `tenderai-nginx` actif sur `127.0.0.1:8080->80/tcp, 127.0.0.1:8443->443/tcp`.

### 6. Tester l'accès

```bash
# Depuis le serveur
curl -I http://localhost:8080/health
curl -Ik https://localhost:8443/health

# Depuis l'extérieur
curl -I https://tender-ai.yulcom.net/health
```

## Ports utilisés

| Service | Port Host | Port Container | Accès |
|---------|-----------|----------------|-------|
| Apache2 | 80, 443 | - | Public (HTTPS) |
| Nginx Docker | 8080 (localhost) | 80 | Interne seulement |
| Nginx Docker | 8443 (localhost) | 443 | Interne seulement |
| API | - | 8000 | Interne Docker |
| UI | - | 7860 | Interne Docker |
| PostgreSQL | - | 5432 | Interne Docker |
| MinIO | - | 9000, 9001 | Interne Docker |

## Flux de requête

1. **Client** → `https://tender-ai.yulcom.net/api/health`
2. **Apache2** (port 443) reçoit la requête SSL
3. **Apache2** proxy vers `http://localhost:8080/api/health`
4. **Nginx Docker** (port 8080) reçoit la requête
5. **Nginx Docker** proxy vers `http://api:8000/health`
6. **API container** traite et répond

## Renouvellement SSL

Les certificats Let's Encrypt sont gérés par Apache2 sur le host :

```bash
# Renouvellement automatique déjà configuré par certbot
sudo certbot renew --dry-run

# Après renouvellement, recharger Apache2
sudo systemctl reload apache2
```

Le Nginx Docker utilise les mêmes certificats montés en lecture seule, donc pas besoin de le recharger.

## Dépannage

### Apache2 ne démarre pas

```bash
# Vérifier les logs
sudo tail -f /var/log/apache2/error.log

# Vérifier la syntaxe
sudo apache2ctl configtest

# Vérifier les ports
sudo netstat -tlnp | grep :443
```

### 502 Bad Gateway

Le Nginx Docker n'est pas accessible :

```bash
# Vérifier que Nginx Docker tourne
docker-compose ps nginx

# Vérifier les logs Nginx Docker
docker-compose logs nginx

# Vérifier que le port 8080 est accessible
curl -I http://localhost:8080/health
```

### 503 Service Unavailable

Les containers API/UI ne sont pas prêts :

```bash
# Vérifier tous les containers
docker-compose ps

# Vérifier les logs
docker-compose logs api
docker-compose logs ui
```

### WebSocket ne fonctionne pas

Vérifiez que les modules Apache2 sont activés :

```bash
sudo a2enmod proxy_wstunnel rewrite
sudo systemctl reload apache2
```

## Logs

```bash
# Apache2 logs
sudo tail -f /var/log/apache2/tender-ai-ssl-access.log
sudo tail -f /var/log/apache2/tender-ai-ssl-error.log

# Nginx Docker logs
docker-compose logs -f nginx

# Application logs
docker-compose logs -f api
docker-compose logs -f ui
```

## Désactiver le site

Si vous devez désactiver temporairement :

```bash
sudo a2dissite tender-ai.yulcom.net
sudo systemctl reload apache2
```

## Autres applications sur le même serveur

Apache2 peut gérer plusieurs sites en même temps. Chaque application peut avoir son propre VirtualHost :

```bash
/etc/apache2/sites-available/
├── 000-default.conf
├── autre-app.conf
├── tender-ai.yulcom.net.conf  # TenderAI
└── ...
```

Toutes les applications peuvent coexister sur le port 443 grâce à SNI (Server Name Indication).

## Configuration avancée

### Limiter le taux de requêtes (rate limiting)

Ajoutez dans le VirtualHost :

```apache
<IfModule mod_ratelimit.c>
    <Location /api/>
        SetOutputFilter RATE_LIMIT
        SetEnv rate-limit 512
    </Location>
</IfModule>
```

### Cache des ressources statiques

```apache
<IfModule mod_expires.c>
    ExpiresActive On
    ExpiresByType image/jpg "access plus 1 year"
    ExpiresByType image/jpeg "access plus 1 year"
    ExpiresByType image/png "access plus 1 year"
    ExpiresByType text/css "access plus 1 month"
    ExpiresByType application/javascript "access plus 1 month"
</IfModule>
```

### IP whitelisting pour /admin

```apache
<Location /admin>
    Require ip 192.168.1.0/24
    Require ip 10.0.0.0/8
</Location>
```

## Monitoring

### Vérifier l'état des services

```bash
# Apache2
sudo systemctl status apache2

# Nginx Docker
docker-compose ps nginx

# Application
docker-compose ps
```

### Vérifier la connectivité

```bash
# Depuis le serveur
curl -I http://localhost:8080/health    # Nginx Docker
curl -I https://localhost/health         # Apache2 (si configuré)

# Depuis l'extérieur
curl -I https://tender-ai.yulcom.net/health
```

## Résumé

✅ **Apache2** reste le point d'entrée principal (port 443)  
✅ **Autres applications** continuent de fonctionner normalement  
✅ **Nginx Docker** écoute sur localhost:8080 uniquement  
✅ **Aucun conflit de ports**  
✅ **SSL géré par Apache2**  
✅ **Isolation complète** entre applications
