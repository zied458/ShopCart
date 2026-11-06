# Politique de blocage du pipeline

Ce document fixe ce qui **casse le build** dans l'étape de sécurité du pipeline
(`.github/workflows/ci.yml`), quelles exceptions sont tolérées, et sous quelle échéance
(exigence 4.3). Les mêmes contrôles s'exécutent en local avec `bash scripts/security-scan.sh`.

## Organisation du pipeline

```
build ──┬─► image (Trivy, par service) ─────────────────────────┐
        └─► dast : déploiement kind durci + vérifications       ├──► publish (GHCR, branche main uniquement)
             Kubernetes + ZAP authentifié                       │
secrets (Gitleaks, tout l'historique)                           │
sast (Semgrep)                                                  │
dependencies (Trivy fs)                                         │
iac (Trivy config : Dockerfile, Compose, Kubernetes) ──────────┘
                                       report : synthèse de toutes les barrières (toujours exécuté)
```

Les contrôles tournent en parallèle. L'image n'est publiée que si **tous** réussissent, y compris le
déploiement de test et le scan dynamique.

**Lisibilité.** Chaque job écrit un résumé sur la page de l'exécution GitHub (tableau des détections avec
gravité, emplacement, correctif et faille du projet concernée), produit par `scripts/ci/summary.mjs` à
partir des rapports JSON des outils. Le job *Security report* rassemble toutes les barrières dans un seul
tableau et publie `security-report.json`. Les rapports complets sont joints à l'exécution (artefacts).
Les valeurs des secrets n'apparaissent jamais : seuls la règle, le fichier, la ligne et le commit sont affichés.
La branche `main` doit être protégée (règle « Require status checks to pass ») pour que ce blocage
s'applique aussi aux fusions de pull requests.

Les outils tournent dans des images Docker à version figée (Trivy 0.76.1, Gitleaks 8.30.1,
Semgrep 1.182.1) et les actions GitHub sont figées par empreinte de commit, pour que le pipeline
lui-même ne change pas sans revue (chaîne d'approvisionnement, OWASP A03:2025).

## Règles de blocage

| Contrôle | Outil | Bloque le build | Signalé sans bloquer |
|---|---|---|---|
| Secrets | Gitleaks (règles par défaut + règles du projet), sur **tout** l'historique, valeurs caviardées | toute détection | — |
| Code source | Semgrep : règles publiques `p/default` + règles d'équipe `.semgrep/` | gravité `ERROR` | `WARNING`, `INFO` |
| Dépendances | Trivy `fs` (fichiers `package-lock.json`) | `CRITICAL` et `HIGH` **avec correctif disponible** | `MEDIUM`, `LOW`, failles sans correctif |
| Image conteneur | Trivy `image` (paquets système, modules Node, secrets) + contrôle de l'utilisateur | `CRITICAL`/`HIGH` avec correctif, secret dans l'image, image exécutée en root | `MEDIUM`, `LOW` |
| Fichiers de déploiement | Trivy `config` (Dockerfile, manifestes Kubernetes) | `HIGH` et `CRITICAL` | `MEDIUM`, `LOW` |
| Déploiement de test | `scripts/k8s/up.sh` + `scripts/k8s/verify.sh` sur un cluster kind | échec du déploiement, ou l'un des 22 contrôles de durcissement | — |
| Scan dynamique (DAST) | OWASP ZAP 2.17.0, authentifié, sur l'application déployée | alerte de risque `High` | `Medium`, `Low`, `Informational` |
| Tests de régression | `backend/test/security.test.mjs` sur l'application déployée | tout test en échec (une faille revenue, ou la boutique cassée) | — |
| Détection | `scripts/detections.sh` après les attaques du job | une des trois règles ne s'est pas déclenchée | — |

## Justification des seuils

- **Secrets : tolérance zéro.** Un secret poussé est compromis dès qu'il est dans l'historique, quelle
  que soit sa « gravité ». Le contrôle porte sur tout l'historique (`fetch-depth: 0`) car un secret
  supprimé dans un commit suivant reste lisible. Les valeurs sont caviardées (`--redact`) pour que le
  rapport ne devienne pas lui-même une fuite.
- **Code source : `ERROR` seulement.** Nos règles `ERROR` correspondent à des failles exploitables
  (injection SQL, XSS, rôle choisi par le client, secret codé en dur). Les `WARNING` (CORS large,
  détail d'erreur, etc.) dépendent du contexte et produisent plus de faux positifs ; les bloquer
  pousserait l'équipe à les désactiver. Ils restent visibles dans le rapport et doivent être triés.
- **Dépendances et images : `HIGH`/`CRITICAL` avec correctif.** Ce sont les failles exploitables à
  distance ou à fort impact (CVSS ≥ 7). Quand un correctif existe, le corriger coûte une mise à jour ;
  il n'y a pas de raison de livrer la version vulnérable. Une faille sans correctif ne peut pas être
  résolue par l'équipe : la bloquer figerait toutes les livraisons sans gain de sécurité. Elle est
  signalée et suivie. `MEDIUM`/`LOW` sont signalés seulement, pour éviter la fatigue d'alertes.
- **Image en root : bloquant.** Exigence 4.1 ; une évasion du conteneur depuis un processus root a un
  impact bien plus grand.
- **Déploiement de test : tout écart.** Les 22 contrôles sont binaires (un pod root est admis ou non) ;
  un seul échec signifie que la protection n'est pas en place.
- **DAST : `High`.** ZAP n'émet `High` que pour une attaque qui a réussi contre l'application en marche
  (injection SQL, XSS…), avec peu de faux positifs. `Medium` regroupe surtout des en-têtes de sécurité
  absents et des configurations à trier ; ils sont signalés et suivis (docs/dast.md).
- **Fichiers de déploiement : `HIGH`/`CRITICAL`.** Ce niveau couvre les privilèges excessifs
  (conteneur privilégié, root, montage de l'hôte), ceux qui ouvrent un chemin vers le nœud.

## Exceptions tolérées

Une exception n'est acceptée que si elle a **une justification écrite, un responsable et une date de
fin**. À l'échéance, le contrôle bloque à nouveau automatiquement quand l'outil le permet.

| Contrôle | Où la déclarer | Échéance maximale |
|---|---|---|
| Dépendances, image | `.trivyignore`, avec `exp:AAAA-MM-JJ` (Trivy la réapplique après la date) | 30 jours pour `CRITICAL`, 60 jours pour `HIGH` |
| Code source | commentaire `// nosemgrep: <règle> — <raison>` sur la ligne, et un ticket | 30 jours ; revue à chaque sprint |
| Secrets | `.gitleaksignore` (empreinte), **uniquement pour un faux positif** démontré | sans objet : un vrai secret n'est jamais exempté |
| Fichiers de déploiement | annotation `trivy:ignore:<ID>` avec la raison | 60 jours |
| DAST (ZAP) | `alertFilter` dans `zap/plan.yaml`, limité à une URL et un paramètre, avec la raison (faux positif démontré) | revue tous les 60 jours (prochaine : 2027-01-31) |

**Un vrai secret détecté n'est jamais mis en exception.** La procédure est : **révoquer d'abord**
(le secret est changé, l'ancien ne fonctionne plus), **purger ensuite** l'historique Git, puis vérifier
que Gitleaks ne trouve plus rien. Purger sans révoquer laisserait le secret valide dans toutes les copies
déjà clonées.

## État actuel (version volontairement vulnérable)

Exécution locale de `scripts/security-scan.sh` sur la première version :

| Contrôle | Résultat | Détections bloquantes |
|---|---|---|
| Secrets | **échec** | 3 secrets : clé de signature des jetons (`backend/src/config.js`), 2 chaînes de connexion PostgreSQL avec mot de passe |
| Code source | **échec** | 4 `ERROR` : injection SQL (V1), rôle lu dans la requête (V4), XSS (V5), secret codé en dur (V6) ; 4 `WARNING` |
| Dépendances | **échec** | lodash 4.17.11 : 1 `CRITICAL` (CVE-2019-10744), 3 `HIGH` (V7) |
| Fichiers de déploiement | réussite | 0 sur les deux Dockerfile (27 contrôles chacun) |
| Images | **échec** | image API : lodash (V7) ; image boutique : 0 (après mise à jour des paquets Alpine) |

Le pipeline bloque donc la livraison de cette version, comme attendu.

## Ce que ces contrôles ne prouvent pas

- **V2 (altération du prix) et V3 (IDOR) ne sont détectés par aucun outil statique** : ce sont des
  erreurs de logique métier et de contrôle d'accès. Ils relèvent des tests dynamiques (étape 4.6),
  de tests d'autorisation écrits par l'équipe et de la revue de code.
- Les règles Semgrep publiques gratuites n'ont trouvé **aucune** des failles injectées dans le code ;
  les détections viennent des règles d'équipe. Ces règles ont été écrites en connaissant les failles :
  leur taux de détection sur un code inconnu serait plus faible.
- Un scan « propre » signifie « aucune faille connue de ces outils », pas « application sûre ».
  Les bases de vulnérabilités ont un retard, et les dépendances indirectes non déclarées échappent
  à l'analyse.
