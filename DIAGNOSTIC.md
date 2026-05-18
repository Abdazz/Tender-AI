# Diagnostic — Problèmes structurels TenderAI BF

Suivi des problèmes identifiés lors de l'analyse du rapport du 2026-05-18.
Périmètre cible confirmé : **IT services · Matériel informatique · Conseil/ingénierie IT**.

**Légende**
- ✅ Corrigé
- ⚠️ Partiellement corrigé
- ❌ À faire

---

## 1. Architecture

### 1.1 RAG + chunking inadapté aux PDF structurés ✅
**Problème** : Le Quotidien des marchés publics est un document fortement structuré (chaque avis a une délimitation claire). Appliquer du chunking RAG fragmente les avis entre plusieurs chunks, ce qui produit des artefacts d'extraction (ex. : `"Financement : Budget SONABHY, exercice 2026"` extrait comme avis autonome alors que c'est une ligne de financement d'un autre avis).

**Correction** : Nouveau parseur structuré `parse_pdf_structured.py` — extrait le texte complet du PDF avec pdfminer, identifie la section AVIS (`Fournitures et Services courants`), découpe par marqueur `Avis de demande de prix N°` / `Avis d'Appel d'Offres N°` / `Avis à Manifestation d'Intérêt N°`, et soumet chaque bloc complet au LLM en une seule passe. Les artefacts de fragmentation RAG sont éliminés à la source.

---

### 1.2 Double passe LLM extraction → classification — redondance et incohérence ✅
**Problème** : L'extraction LLM attribue déjà un score de pertinence. La classification LLM refait le même travail. Les deux peuvent se contredire, et les filtres (PV de dépouillement, inscriptions fournisseurs) doivent être dupliqués dans les deux étapes pour être fiables.

**Correction** : Schéma Pydantic `TenderBlock` enrichi avec `is_relevant: bool`, `domain: Literal[...]`, `is_results_notice: bool`, `relevance_score: int 1-5` — tous renseignés dans le même appel LLM que l'extraction. Les items extraits par `parse_pdf_structured.py` ont le flag `classification_embedded=True` ; `classify_node` les passe directement dans `relevant_items` sans second appel LLM. La classification par mots-clés reste active pour les sources HTML (joffres.net, BCEAO, UNGM).

---

### 1.3 Pas de persistance inter-runs des références vues ❌
**Problème** : La déduplication ne s'applique qu'au sein d'un même run. Un appel d'offres publié un lundi peut réapparaître dans les rapports du mardi et mercredi si la source le republie (cas fréquent sur joffres.net qui agrège des avis anciens).

**Solution recommandée** : Maintenir une table `seen_references` en base de données (référence + entité + date de première vue). Avant classification, vérifier si la référence a déjà été traitée dans les N derniers jours.

---

## 2. Classification / Pertinence

### 2.1 Mots-clés trop larges — catégorie `engineering` hors périmètre ✅
**Problème** : La catégorie `engineering` dans `settings.yaml` incluait `génie civil`, `BTP`, `routes`, `bâtiment`, `hydraulique`, `assainissement` — des domaines que YULCOM ne cible pas. Ces termes produisaient des faux positifs dès l'extraction.

**Correction** : Catégorie renommée `it_consulting`, nettoyée et resserrée sur les termes spécifiques IT (études informatiques, audits de sécurité, schémas directeurs, déploiement de systèmes). Mots-clés génériques supprimés (`conseil`, `formation`, `matériel de bureau`, `câbles`, `batterie`).

---

### 2.2 Prompt LLM de classification trop vague ✅
**Problème** : La question posée au LLM — *"Est-ce pertinent pour IT/Ingénierie/Télécommunications ?"* — était trop ouverte. "Ingénierie" sans qualificatif IT pouvait inclure du génie civil. Le LLM répondait OUI à des AO de construction d'infrastructure physique.

**Correction** : Prompt remplacé par trois domaines précis avec exemples concrets (services IT, matériel informatique, conseil IT) et une liste d'exclusions explicites alignée sur les cas observés.

---

### 2.3 Prompt d'extraction non aligné sur le périmètre métier ✅
**Problème** : Le LLM d'extraction était chargé d'extraire *tous* les appels d'offres, sans filtre de domaine. Il extrayait donc des AO de BTP, agriculture, fournitures alimentaires, etc. qui remontaient ensuite dans le pipeline.

**Correction** : Prompt d'extraction mis à jour pour cibler uniquement les trois domaines de YULCOM dès la source.

---

### 2.4 Faux positifs — inscriptions de fournisseurs/prestataires ✅
**Problème** : Les appels à constitution d'une base de données de fournisseurs/prestataires (inscription administrative, ex. ONI, DPESFPT) étaient classifiés comme pertinents car le LLM voyait "base de données" et concluait à de l'IT.

**Correction** : Filtre déterministe `_is_supplier_registration()` ajouté dans `classify.py`, appliqué avant tout scoring LLM ou par mots-clés.

---

### 2.5 Faux positifs — PV de dépouillement et publications de résultats ✅
**Problème** : Les procès-verbaux d'ouverture des plis (publiés dans le Quotidien après clôture des soumissions) passaient le filtre d'attribution existant. Signaux manquants : `"nombre de plis reçus"`, `"candidats retenus"`, `"soumissionnaires retenus"`.

**Correction** : Signaux ajoutés dans `_ATTRIBUTION_SIGNALS` dans `classify.py` et dans le prompt d'extraction dans `settings.yaml`.

---

### 2.6 Scoring non discriminant — tous les items à 0.80 ❌
**Problème** : La formule de scoring LLM (`0.8 + keyword_matches/total * 0.2`) produit des scores quasi-identiques pour tous les items retenus. Impossible de distinguer un AO très pertinent (ex. développement d'un SIG) d'un borderline (ex. consommables imprimantes). Le rapport ne peut pas être trié par priorité réelle.

**Solution recommandée** : Remplacer le score binaire OUI/NON par une note de pertinence 1–5 demandée directement au LLM dans la réponse, avec des critères explicites (valeur estimée du marché pour YULCOM, adéquation avec les compétences cœur, complexité technique).

---

## 3. Déduplication

### 3.1 Similarité textuelle inadaptée aux doublons inter-sources ⚠️
**Problème** : Le même appel d'offres publié dans le PDF DGCMEF et sur joffres.net a des textes très différents (mise en forme, longueur, ordre des champs). Le seuil de similarité à 85% ne les attrapait pas. Cas observé : SONABHY 100 Mbits apparaissait 3 fois dans le rapport.

**Correction** : Seuil abaissé à 75% dans `settings.yaml`. Matching par numéro de référence ajouté comme signal primaire dans `deduplicate.py` (si deux items ont le même numéro de référence, c'est un doublon, quelle que soit la similarité textuelle).

**Reste à faire** : Voir point 1.3 (persistance inter-runs).

---

### 3.2 Artefacts d'extraction traités comme des doublons au lieu d'être filtrés à la source ⚠️
**Problème** : Des fragments de texte mal découpés (ex. `"Financement : Budget SONABHY, exercice 2026"`) sont extraits comme des avis autonomes. La déduplication par référence les élimine si la référence est bien extraite, mais pas toujours.

**Correction partielle** : Le matching par référence aide. La correction définitive dépend du point 1.1 (parseur structuré).

---

## 4. Configuration / Infrastructure

### 4.1 `deduplication_threshold` et `deduplication_method` non lus depuis `settings.yaml` ✅
**Problème** : Le parser YAML dans `config.py` ne lisait que `min_relevance_score` et `use_llm_classification`. Les paramètres de déduplication étaient ignorés, laissant les valeurs par défaut codées dans `config.py`.

**Correction** : Lecture de `deduplication_threshold` et `deduplication_method` ajoutée dans le parser YAML de `config.py`.

---

### 4.2 Nom de fichier de rapport codé en dur ✅
**Problème** : Le préfixe `RFP_Watch_BF_` était codé en dur dans 3 endroits (`minio_client.py`, `smtp_client.py`, `reports.py`). Incohérent avec le nom du projet et non configurable.

**Correction** : Les 3 endroits utilisent maintenant `settings.app_name` pour construire le nom de fichier.

---

### 4.3 Credentials de sécurité faibles au démarrage en production ✅
**Problème** : `TENDERAI_ADMIN_PASSWORD=admin123` et `TENDERAI_JWT_SECRET` avec valeur placeholder provoquaient un refus de démarrage du conteneur API en production (validation dans `config.py`).

**Correction** : Secrets injectés via GitHub Secrets dans le workflow CI/CD. Le déploiement écrase automatiquement les valeurs du `.env` serveur à chaque run.

---

## Priorités recommandées pour la suite

| Priorité | Point | Impact |
|---|---|---|
| 🔴 Haute | 1.3 Persistance inter-runs des références | Élimine les AO récurrents sur plusieurs jours |
| 🔴 Haute | 2.6 Scoring discriminant | Permet de trier les AO par priorité réelle (score 1-5 déjà extrait, reste à afficher dans le rapport) |
| ✅ Terminé | 1.1 Parseur structuré pour PDF | Élimine les artefacts d'extraction à la source |
| ✅ Terminé | 1.2 Fusion extraction + classification | Réduit les appels LLM, élimine les incohérences |
| 🟢 Basse | SSL certificat production | Fonctionnel une fois Certbot configuré sur le serveur |
