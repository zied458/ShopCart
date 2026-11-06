# Gestion des secrets

Ce document couvre l'exigence 4.4 : aucun secret dans le dépôt ni dans son historique, des secrets
fournis à l'exécution, et la démonstration « **révoquer d'abord, purger ensuite** » sur la fuite V6.

## Les secrets de l'application

| Secret | Rôle | Qui en a besoin | Force |
|---|---|---|---|
| `jwt-secret` | Clé de signature des jetons de connexion (HS256) | l'API seulement | 256 bits aléatoires (`openssl rand -hex 32`) |
| `db-password` | Mot de passe de l'utilisateur PostgreSQL `tropicline` | la base, l'API, le job d'initialisation | 256 bits aléatoires |

Les comptes de test (`backend/db/init.js`) ne sont pas des secrets : ce sont des données d'exemple,
publiques, réinitialisées à chaque déploiement de test.

## Règles

1. **Aucun secret dans le code, le dépôt, l'historique ou l'image.** La configuration
   (`backend/src/config.js`) n'a plus de valeur par défaut : elle lit `NOM_FILE` (un fichier monté) ou,
   pour un essai local, `NOM`.
2. **Échec au démarrage plutôt que repli.** Si un secret manque ou est trop court (moins de 64 caractères
   pour la clé de signature), l'API refuse de démarrer. C'était précisément la cause de V6 : une valeur de
   repli écrite dans le code.
3. **Des fichiers, pas des variables d'environnement.** Les variables d'environnement se retrouvent dans
   les journaux d'erreur, les dumps, `docker inspect` et `kubectl describe`, et sont héritées par les
   processus enfants. Les secrets sont montés en lecture seule (`/run/secrets/...`, mode `0440`).
4. **Le minimum par composant.** La base ne reçoit pas la clé de signature ; le job d'initialisation non
   plus. Chaque pod ne monte que les clés dont il a besoin (`items:` dans les manifestes).
5. **Générés, jamais choisis.** Les valeurs sont produites par `openssl rand` au moment du déploiement et
   ne sont écrites nulle part ailleurs.

## Où vivent les secrets, par environnement

| Environnement | Stockage | Fourniture | Création |
|---|---|---|---|
| Développement (`npm run dev`) | `.secrets/` (ignoré par Git, dossier en `700`) | `backend/.env` contient seulement les **chemins** (`DB_PASSWORD_FILE=...`) | `bash scripts/new-secrets.sh` |
| Docker Compose | `.secrets/` | secrets Compose montés dans `/run/secrets/` | `bash scripts/new-secrets.sh` |
| Kubernetes (cluster de test) | Secret `tropicline-secrets` | volume `secret` en lecture seule, clé par clé | `scripts/k8s/up.sh`, au premier déploiement |
| CI (GitHub Actions) | aucun secret applicatif | le cluster de test génère les siens, détruits avec la machine | à chaque exécution |

La CI n'utilise qu'un seul secret : `GITHUB_TOKEN`, fourni par GitHub pour la durée du job, avec les
droits minimaux (`contents: read` partout, `packages: write` dans le seul job de publication).

## Contrôles automatiques

| Contrôle | Où | Ce qu'il empêche |
|---|---|---|
| Gitleaks sur **tout** l'historique | CI, job *Secrets* | un secret poussé dans n'importe quel commit |
| Semgrep `hardcoded-secret-fallback` | CI, job *Code* | une valeur de repli `process.env.X ?? '...'` |
| Trivy `--scanners secret` | CI, job *Images* | un secret copié dans une image |
| Kyverno `tropicline-identity-and-secrets` | admission Kubernetes | un pod qui reçoit un secret en variable d'environnement |
| Configuration de l'API | démarrage | un démarrage sans secret, ou avec un secret faible |

## Limites connues (cluster de test)

- Un Secret Kubernetes est seulement encodé en base64 dans etcd. En production, il faut activer le
  chiffrement au repos (`EncryptionConfiguration`, idéalement avec un KMS) ou passer par un gestionnaire
  externe (External Secrets Operator + Vault ou un coffre du fournisseur cloud).
- Toute personne qui peut lire les Secrets du namespace peut lire les valeurs. Aucun compte de service de
  l'application n'a ce droit (vérifié par `scripts/k8s/verify.sh`) ; il faut aussi limiter les comptes
  humains.

---

## Incident V6 : révoquer d'abord, purger ensuite

### Ce qui s'est passé

La première version (commit `0a4cdf9` à l'origine, `c70fc4a` après la purge) contenait la clé de signature des jetons comme valeur par défaut
dans `backend/src/config.js`, et le mot de passe de la base dans `docker-compose.yml` et
`config.js`. Le dépôt est **public**.

### 1. Détection

Le premier passage du pipeline sur GitHub a échoué sur le job *Secrets* : Gitleaks a trouvé 3 secrets
(règles `tropicline-signing-key` et `postgres-url-with-password`, valeurs caviardées).
Exécution : <https://github.com/saramseibi/Shopcart/actions/runs/41513851737>.

**Impact confirmé** avant toute action : avec la clé lue dans le dépôt, un jeton administrateur fabriqué
donne accès aux données de tous les clients.

```text
$ node scripts/demo/forge-token.mjs http://localhost:8081 <clé lue dans le dépôt>
GET /api/admin/customers with a forged admin token -> HTTP 200 (6 customer records returned)
```

### 2. Révoquer d'abord

La fuite est publique : la seule mesure qui protège est de rendre les valeurs inutilisables. On les
remplace avant de toucher à l'historique.

- **Mot de passe de la base** : changé dans PostgreSQL (`ALTER USER`, valeur passée sur l'entrée standard,
  jamais en argument de commande), puis dans le secret monté.
- **Clé de signature** : nouvelle clé aléatoire ; l'API redémarre ; **tous** les jetons signés avec
  l'ancienne clé deviennent invalides (y compris les sessions légitimes, qui doivent se reconnecter : c'est
  le prix de la révocation).
- **Code** : la valeur de repli est supprimée, l'API refuse de démarrer sans secret (commit de correction
  de V6).

Résultat (stack Docker Compose) :

```text
$ node scripts/demo/forge-token.mjs http://localhost:8081 <ancienne clé>
GET /api/admin/customers with a forged admin token -> HTTP 401 (Sign in first.)
$ psql -h db -U tropicline   # avec l'ancien mot de passe
FATAL:  password authentication failed for user "tropicline"
$ curl -X POST /api/auth/login ...   # un vrai client
200
$ docker run tropicline-api:dev      # sans secret
Error: DB_PASSWORD is missing or shorter than 16 characters: set DB_PASSWORD_FILE or DB_PASSWORD.
```

Même procédure sur Kubernetes, avec `scripts/k8s/rotate-secrets.sh` (nouvelles valeurs aléatoires,
`ALTER USER`, remplacement du Secret, redémarrage progressif de l'API) :

```text
1) the deployed key leaks:       HTTP 200 (5 customer records returned)
2) bash scripts/k8s/rotate-secrets.sh
3) the leaked key after revocation: HTTP 401 (Sign in first.)
4) customers still sign in:      200
```

### 3. Purger ensuite

Une fois les valeurs révoquées, on les retire de l'historique pour qu'elles ne se propagent plus (et que
Gitleaks redevienne vert) : `scripts/purge-history.sh`.

1. clone miroir du dépôt GitHub dans `.purge/` (le dossier de travail n'est pas touché) ;
2. Gitleaks avant : 3 détections ;
3. `git filter-repo --replace-text` remplace chaque valeur fuitée par `***` dans **tous** les
   commits (liste des valeurs dans `.secrets/leaked-values.txt`, ignoré par Git) ;
4. Gitleaks après : 0 détection, et une recherche littérale confirme l'absence des valeurs ;
5. `--push` seulement : envoi forcé de l'historique réécrit.

**Fait le 6 novembre 2026** sur `github.com/zied458/ShopCart` : 21 commits réécrits, Gitleaks
`no leaks found`, envoi forcé de `master` ; dans le dossier de travail, `git reset --hard origin/master`
puis suppression des anciens objets (`git reflog expire`, `git gc --prune=now`). L'étape *Secrets* du pipeline
repasse au vert. Les numéros de commit ont changé (la version vulnérable est désormais `c70fc4a`).

Après l'envoi forcé : chaque membre de l'équipe reclone le dépôt ; GitHub conserve un temps les commits
devenus inaccessibles et les copies dans les forks et pull requests : pour un dépôt public, demander au
support GitHub de purger les vues en cache.

### Pourquoi dans cet ordre

Purger d'abord ne protège de rien : la valeur reste valide dans tous les clones déjà faits, les forks, les
journaux de CI et les caches, et la réécriture de l'historique attire l'attention sur la fuite. Révoquer
d'abord rend toutes ces copies inutiles ; la purge vient ensuite pour limiter la propagation et retrouver
un historique propre.

### Démonstration en soutenance

```bash
bash scripts/k8s/up.sh                                   # cluster de test
K="kubectl --context kind-tropicline -n tropicline"
LEAKED=$($K get secret tropicline-secrets -o jsonpath='{.data.jwt-secret}' | base64 -d)   # « la fuite »
node scripts/demo/forge-token.mjs http://127.0.0.1:8090 "$LEAKED"   # 200 : la fuite est exploitable
bash scripts/k8s/rotate-secrets.sh                       # révoquer
node scripts/demo/forge-token.mjs http://127.0.0.1:8090 "$LEAKED"   # 401 : la clé fuitée ne sert plus
bash scripts/purge-history.sh                            # purger (sans --push : démonstration sur le miroir)
```
