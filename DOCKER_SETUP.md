# Docker Setup Guide

## Développement Local

Pour le développement local, vous devez exposer les ports PostgreSQL et MinIO pour y accéder depuis votre machine.

### Configuration initiale

1. **Copiez le fichier override de développement :**
   ```bash
   cp docker-compose.override.dev.yml docker-compose.override.yml
   ```

2. **Démarrez les services :**
   ```bash
   docker-compose up -d
   ```

3. **Accédez aux services :**
   - PostgreSQL : `localhost:5432`
   - MinIO API : `localhost:9000`
   - MinIO Console : `localhost:9001`
   - API : `localhost:8000`
   - UI : `localhost:7860`

### Important

- Le fichier `docker-compose.override.yml` est dans `.gitignore` et ne sera **jamais commité**
- Ne modifiez **jamais** directement `docker-compose.yml` pour décommenter les ports
- Utilisez toujours le fichier override pour vos besoins locaux

## Production

En production, les ports PostgreSQL et MinIO ne sont **pas exposés** sur l'hôte pour :
- Éviter les conflits de ports avec des services existants
- Améliorer la sécurité (accès uniquement via le réseau Docker interne)
- Les services communiquent entre eux via le réseau Docker

L'accès externe se fait uniquement via :
- Nginx (reverse proxy) → API (port 8000) et UI (port 7860)
- Les conteneurs accèdent à PostgreSQL et MinIO via leurs noms de service (`postgres:5432`, `minio:9000`)

## Structure des fichiers

```
docker-compose.yml                    # Configuration de base (ports commentés)
docker-compose.override.dev.yml       # Override pour développement (À COPIER)
docker-compose.override.prod.yml      # Override pour production (utilisé en CI/CD)
docker-compose.override.yml           # Fichier local (dans .gitignore)
```

## Résolution de problèmes

### Port déjà utilisé en local

Si vous avez déjà PostgreSQL ou MinIO qui tournent localement :

**Option 1 - Arrêter les services locaux :**
```bash
sudo systemctl stop postgresql
sudo systemctl stop minio
```

**Option 2 - Utiliser des ports différents :**

Créez un fichier `.env` local :
```bash
cp .env.example .env
```

Modifiez les ports :
```bash
POSTGRES_PORT=5433
MINIO_PORT=9002
MINIO_CONSOLE_PORT=9003
```

### Accès à la base de données en local

```bash
# Via docker-compose
docker-compose exec postgres psql -U tenderai -d tenderai_bf

# Via client local (si ports exposés)
psql -h localhost -p 5432 -U tenderai -d tenderai_bf
```

### Accès à MinIO Console

Ouvrez dans votre navigateur : http://localhost:9001

Credentials (par défaut) :
- Access Key: `minioadmin`
- Secret Key: `minioadmin123`
