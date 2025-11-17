# Structure des fichiers de déploiement

Ce répertoire contient la configuration CI/CD et les workflows GitHub Actions.

## 📁 Fichiers

### Workflows GitHub Actions

- **`ci-cd.yml`** - Pipeline principal CI/CD
  - Lint, tests, type checking
  - Build et push des images Docker
  - Déploiement automatique sur production/staging
  - Scan de sécurité

### Documentation

- **`README.md`** - Documentation complète du CI/CD
  - Configuration des secrets GitHub
  - Environnements
  - Workflow de déploiement
  - Dépannage

## 🔄 Workflow de déploiement

### Branches et environnements

- `main` → Production
- `develop` → Staging  
- Pull Requests → Tests uniquement

### Images Docker

Les images sont publiées sur GitHub Container Registry :

```
ghcr.io/abdazz/tenderai-bf-api:latest
ghcr.io/abdazz/tenderai-bf-ui:latest
ghcr.io/abdazz/tenderai-bf-worker:latest
```

### Configuration

Le même `docker-compose.yml` est utilisé partout. En production :

1. Le workflow copie `docker-compose.override.prod.yml` → `docker-compose.override.yml`
2. Docker Compose merge automatiquement les deux fichiers
3. L'override configure l'utilisation des images du registry

Pas besoin de fichiers séparés ! 🎉

## 📚 Ressources

- [Guide de déploiement complet](../../DEPLOYMENT.md)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)

## 🆘 Support

Pour toute question :
- Ouvrir une issue sur GitHub
- Consulter les logs des workflows
- Vérifier la documentation
