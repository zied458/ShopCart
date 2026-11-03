# Déploiement Kubernetes durci

Exigence 4.5 : déploiement sur un cluster de test avec moindre privilège, `securityContext` restrictif,
NetworkPolicies en refus par défaut et contrôle d'admission (Kyverno). Tout est vérifié automatiquement,
sur le cluster en marche, par `scripts/k8s/verify.sh` (22 contrôles), en local comme dans la CI.

## Lancer

```bash
bash scripts/k8s/up.sh       # cluster kind, Kyverno, images, secret, déploiement, données d'exemple
bash scripts/k8s/verify.sh   # preuves du durcissement (tableau, aussi dans reports/k8s-checks.md)
bash scripts/zap-scan.sh     # scan dynamique authentifié (docs/dast.md)
bash scripts/k8s/down.sh     # supprime le cluster
```

La boutique répond sur <http://127.0.0.1:8090> (NodePort 30080, publié sur la boucle locale uniquement).
Versions : kind 0.33.0 (Kubernetes 1.37), Kyverno 1.19.2.

## Architecture

```
            Internet / poste
                  │  :8090 → NodePort 30080
          ┌───────▼────────┐        ┌──────────────┐        ┌──────────────┐
          │ web (nginx) ×2 │──3000─►│  api (Node) ×2│──5432─►│ db (Postgres)│◄── db-seed (Job)
          └────────────────┘        └──────────────┘        └──────────────┘
   namespace tropicline · Pod Security « restricted » · refus réseau par défaut · Kyverno
```

| Fichier | Contenu |
|---|---|
| `k8s/kind-cluster.yaml` | cluster d'un nœud, port 8090 publié sur `127.0.0.1` seulement |
| `k8s/base/namespace.yaml` | namespace avec Pod Security Admission `restricted` (enforce, warn, audit) |
| `k8s/base/quota.yaml` | `ResourceQuota` : nombre de pods, CPU, mémoire, 1 seul NodePort, aucun LoadBalancer |
| `k8s/base/serviceaccounts.yaml` | un compte de service par composant, sans jeton monté, sans aucun droit |
| `k8s/base/network-policies.yaml` | refus par défaut + une règle par flux autorisé |
| `k8s/base/{web,api,db}.yaml` | Deployments / StatefulSet durcis et leurs Services |
| `k8s/seed/db-seed.yaml` | Job d'initialisation de la base |
| `k8s/policies/pod-hardening.yaml` | 4 politiques Kyverno (`ValidatingPolicy`, mode `Deny`) |

## Moindre privilège

- **Aucun droit sur l'API Kubernetes.** Quatre comptes de service (`web`, `api`, `db`, `db-seed`), aucun
  `Role` ni `RoleBinding`. `automountServiceAccountToken: false` : aucun jeton n'est présent dans les pods,
  donc un attaquant qui prend la main sur l'API ne peut pas interroger le cluster.
- **Secrets au plus juste.** Chaque pod ne monte que les clés dont il a besoin (la base et le job
  d'initialisation ne reçoivent pas la clé de signature). Voir `docs/secrets.md`.
- **`enableServiceLinks: false`** : pas de variables d'environnement révélant les autres services.
- **Quotas** : un pod abusé ne peut pas épuiser le nœud ; un seul point d'entrée `NodePort`.

## securityContext

Identique pour tous les conteneurs, et imposé (Pod Security + Kyverno) :

| Réglage | Valeur | Pourquoi |
|---|---|---|
| `runAsNonRoot`, `runAsUser` | `true`, 65532 (API), 101 (nginx), 70 (postgres) | jamais root |
| `allowPrivilegeEscalation` | `false` | pas de setuid / sudo possible |
| `capabilities.drop` | `[ALL]` | aucune capacité Linux |
| `readOnlyRootFilesystem` | `true` | impossible de modifier le code ou de déposer un outil ; seuls des `emptyDir` limités sont inscriptibles (`/tmp`, configuration nginx générée, socket postgres) |
| `seccompProfile` | `RuntimeDefault` | filtre des appels système |
| `resources.limits` | CPU et mémoire sur chaque conteneur | pas de déni de service par épuisement |

Les fichiers de l'image API appartiennent à root : même sans système de fichiers en lecture seule, le
processus (utilisateur 65532) ne pourrait pas les modifier.

## NetworkPolicies : refus par défaut

`default-deny-all` bloque tout trafic entrant et sortant dans le namespace. Les seuls flux ouverts :

| Source | Destination | Port | Raison |
|---|---|---|---|
| tout le monde | web | 8080 | point d'entrée public |
| web | api | 3000 | le proxy `/api/` |
| api | db | 5432 | requêtes SQL |
| db-seed | db | 5432 | initialisation |
| web, api, db-seed | DNS du cluster (kube-system) | 53 | résolution des noms de service |

Conséquences vérifiées : la boutique ne peut pas joindre la base ; la base ne parle à personne ; **aucun pod
ne peut joindre Internet** (un attaquant qui exécute du code dans l'API ne peut pas exfiltrer les données
ni télécharger d'outil). Le CNI de kind (kindnet) applique les NetworkPolicies, ce que les tests réseau
ci-dessous confirment.

## Contrôle d'admission

Deux couches, toutes deux en mode bloquant :

1. **Pod Security Admission `restricted`** (intégré à Kubernetes) : non-root, pas de privilège, pas
   d'élévation, capacités supprimées, seccomp.
2. **Kyverno** (`k8s/policies/pod-hardening.yaml`), nos règles en plus :

| Politique | Règles |
|---|---|
| `tropicline-hardened-containers` | non-root, pas d'élévation, pas de conteneur privilégié, système de fichiers en lecture seule, `drop: [ALL]` |
| `tropicline-resources-and-host` | limites CPU et mémoire obligatoires ; pas de `hostNetwork`/`hostPID`/`hostIPC`, `hostPath`, `hostPort` |
| `tropicline-supply-chain` | images de `ghcr.io/saramseibi/shopcart-*` seulement (ou Postgres officiel **figé par empreinte**) ; tag explicite, jamais `:latest` |
| `tropicline-identity-and-secrets` | pas de jeton d'API monté ; compte de service dédié (pas `default`) ; secrets en fichiers, jamais en variable d'environnement |

Les politiques s'appliquent aussi aux Deployments, StatefulSets et Jobs (`autogen`) : une erreur est
refusée dès le `kubectl apply`, pas seulement à la création du pod. Kyverno 1.19 rend obsolète l'ancien
type `ClusterPolicy` ; nous utilisons le type actuel `ValidatingPolicy` (expressions CEL).

## Preuves (`scripts/k8s/verify.sh`)

Chaque test d'admission envoie un pod conforme dont **une seule** propriété est fautive, en
`--dry-run=server` : le serveur applique tous les contrôles, rien n'est créé.

| Domaine | Contrôle | Attendu | Obtenu |
|---|---|---|---|
| Admission | Pod conforme (témoin) | admis | admis |
| Admission | Pod en root | refusé | `violates PodSecurity "restricted:latest": runAsNonRoot != true …` |
| Admission | Conteneur privilégié | refusé | `violates PodSecurity "restricted:latest": privileged …` |
| Admission | Image `nginx:latest` | refusé | `Policy tropicline-supply-chain failed: Images must come from …` |
| Admission | Système de fichiers inscriptible | refusé | `Policy tropicline-hardened-containers failed …` |
| Admission | Sans limites CPU/mémoire | refusé | `Policy tropicline-resources-and-host failed …` |
| Admission | Secret en variable d'environnement | refusé | `Policy tropicline-identity-and-secrets failed …` |
| Admission | Jeton d'API monté | refusé | `Policy tropicline-identity-and-secrets failed …` |
| Réseau | web → api:3000 | autorisé | `{"status":"ok"}` |
| Réseau | api → db:5432 | autorisé | connexion ouverte |
| Réseau | web → db:5432 | bloqué | délai dépassé |
| Réseau | api → Internet | bloqué | `ETIMEDOUT` |
| Réseau | db → api:3000 | bloqué | délai dépassé |
| Privilèges | chaque compte de service peut-il lire les Secrets ? (×4) | non | `no` |
| Privilèges | jeton d'API dans le pod API | absent | absent |
| Conteneur | utilisateur de l'API / de nginx | 65532 / 101 | 65532 / 101 |
| Conteneur | écrire dans le code de l'API | refusé | `EROFS: read-only file system` |
| Conteneur | secrets en variables d'environnement | aucun | aucun |

Résultat : **22/22** sur le cluster local, et à chaque exécution de la CI (job *Deploy to Kubernetes + ZAP*).

## Limites

- Cluster d'un seul nœud (kind) : pas de haute disponibilité, pas de chiffrement etcd au repos
  (voir `docs/secrets.md`).
- Pas d'Ingress TLS : le test se fait en HTTP sur la boucle locale. En production : Ingress avec TLS et
  en-têtes de sécurité, et une NetworkPolicy qui n'autorise l'entrée que depuis le contrôleur d'Ingress.
- La signature des images (cosign + `ImageValidatingPolicy` de Kyverno) serait l'étape suivante de la
  chaîne d'approvisionnement ; la publication produit déjà une attestation de provenance et un SBOM.
