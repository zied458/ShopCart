# Plan de réponse à incident

Ce plan dit **qui fait quoi, dans quel ordre**, quand une alerte de sécurité se déclenche sur Tropic Line.
Il suit les phases du NIST SP 800-61 : préparation, détection et analyse, confinement, éradication,
rétablissement, retour d'expérience. Les commandes visent le cluster de test (`kind-tropicline`) ; elles
sont les mêmes sur un vrai cluster, avec son contexte.

## 1. Préparation

**Rôles** (équipe de 3–4 personnes ; une personne peut tenir deux rôles) :

| Rôle | Responsabilités |
|---|---|
| Responsable d'incident | déclare l'incident, fixe la gravité, décide du confinement, tient la chronologie |
| Analyste | lit les journaux et les métriques, établit les faits (quoi, quand, d'où, quelle donnée) |
| Opérateur | exécute les actions sur le cluster, les secrets et la base |
| Communication | prévient la direction, les clients et l'autorité si des données personnelles sont touchées |

**Déjà en place** :
- journaux JSON avec identifiant de corrélation et alertes (`docs/detection.md`) ;
- secrets remplaçables en une commande (`scripts/k8s/rotate-secrets.sh`) ;
- NetworkPolicies en refus par défaut : un pod sans règle ne parle à personne ;
- images reconstruites et redéployées par le pipeline ; tests de régression par faille ;
- comptes de service sans aucun droit sur l'API Kubernetes.

**Raccourci utilisé ci-dessous** :

```bash
K="kubectl --context kind-tropicline -n tropicline"
```

## 2. Détection et analyse

**Sources** : lignes `security.alert` dans les journaux de l'API (`bash scripts/detections.sh`), métriques
`tropicline_security_alerts_total`, échec d'une barrière du pipeline (Gitleaks, Trivy, ZAP), signalement
d'un client ou d'un tiers.

**Premières questions** (15 minutes) :
1. Quelle règle, depuis quand, depuis quelle adresse, sur quel compte ? (`requestId` de l'alerte)
2. L'attaque a-t-elle **réussi** ? Chercher, pour la même adresse, les réponses `200` après les refus,
   les connexions réussies (`auth.login_succeeded`) et les actions `admin.*`.
3. Quelles données sont exposées ?

```bash
bash scripts/detections.sh                                            # les alertes
$K logs -l app.kubernetes.io/name=api --prefix --tail=-1 > incident-$(date +%F).log  # conserver les preuves
grep '"ip":"10.244.0.1"' incident-*.log | grep -v '"status":40'       # ce qui a réussi depuis cette adresse
grep '<requestId>' incident-*.log                                     # tout le parcours d'une requête
```

**Gravité** :

| Niveau | Exemples | Délai de réponse |
|---|---|---|
| **P1 critique** | données personnelles lues ou modifiées, secret valide divulgué, compte admin compromis | immédiat, toute l'équipe |
| **P2 élevée** | attaque en cours sans preuve de réussite (brute force soutenu, injection répétée) | dans l'heure |
| **P3 faible** | sonde isolée, scanner automatique, alerte bloquée par le verrouillage | jour ouvré suivant |

## 3. Confinement → 4. Éradication → 5. Rétablissement, par scénario

### A. Brute force ou bourrage d'identifiants (`brute_force`)

| Phase | Action |
|---|---|
| Confinement | Le verrouillage automatique (429) agit déjà pour le couple adresse + compte. Si l'attaque vient de nombreuses adresses ou continue : bloquer l'adresse en amont (pare-feu, WAF, Ingress). |
| Analyse | Une connexion **réussie** sur le compte visé depuis l'adresse attaquante ? Si oui → scénario C. |
| Éradication | Réinitialiser le mot de passe du compte visé ; prévenir le client. |
| Rétablissement | Débloquer un client légitime verrouillé à tort : voir ci-dessous. |

```sql
-- Débloquer un compte (après vérification de l'identité du client)
DELETE FROM security_events WHERE rule = 'brute_force' AND key LIKE '%|client@example.com';
```

### B. Injection SQL ou script (`injection_probe`)

| Phase | Action |
|---|---|
| Analyse | Les requêtes signalées ont-elles renvoyé autre chose que des résultats normaux ? (taille de réponse, `http.error`). Depuis la correction de V1, la requête est paramétrée : la sonde est inoffensive. Vérifier que la version déployée est bien la version corrigée (`$K get deploy api -o jsonpath='{..image}'`). |
| Confinement si réussite | Isoler les pods de l'API (voir « Mettre un pod en quarantaine ») et redéployer la version corrigée. |
| Éradication | Corriger la cause, ajouter un test de régression, laisser le pipeline bloquer toute réintroduction. |
| Si des données ont été lues | Scénario C (données) et D (rotation des secrets si la table des utilisateurs est concernée : forcer la réinitialisation des mots de passe). |

### C. Compte ou données compromis (accès admin anormal, IDOR, fuite)

| Phase | Action |
|---|---|
| Confinement | Révoquer **toutes** les sessions en changeant la clé de signature : `bash scripts/k8s/rotate-secrets.sh jwt` (chaque jeton émis devient invalide). Rétrograder un compte admin suspect : `UPDATE users SET role = 'customer' WHERE email = '…';` (effet immédiat : le rôle est vérifié en base à chaque requête). |
| Analyse | Journal d'audit : `grep '"event":"admin\.' incident-*.log` ; liste des données consultées (`admin.customers_viewed`, commandes lues). |
| Éradication | Corriger la faille (cf. V3, V4), test de régression, redéploiement. |
| Notification | Données personnelles (nom, téléphone, adresse) : prévenir les clients concernés et l'autorité de protection des données (en Tunisie, l'INPDP), dans les délais légaux. |

### D. Secret divulgué (Gitleaks, dépôt public, journal)

**Révoquer d'abord, purger ensuite** — procédure complète et démontrée : `docs/secrets.md`.

```bash
bash scripts/k8s/rotate-secrets.sh      # nouvelles valeurs, ALTER USER, redémarrage de l'API : l'ancienne ne marche plus
bash scripts/purge-history.sh           # puis réécriture de l'historique Git, vérifiée par Gitleaks
```

### E. Pod compromis (comportement anormal, code exécuté dans un conteneur)

#### Mettre un pod en quarantaine

Changer l'étiquette du pod le **sort** de son Deployment et de son Service : Kubernetes en recrée un sain
pour le remplacer, et les NetworkPolicies de l'application ne le concernent plus. Seule `default-deny-all`
s'applique : le pod ne peut plus parler à personne, mais **reste en vie pour l'analyse** (mémoire,
processus, fichiers).

```bash
$K get pods -l app.kubernetes.io/name=api                                      # repérer le pod
$K label pod <pod> app.kubernetes.io/name=quarantine --overwrite               # isolé, remplacé
$K logs <pod> > quarantine-<pod>.log                                           # preuves
$K delete pod <pod>                                                            # après l'analyse
```

Ensuite : changer les secrets que ce pod pouvait lire (`rotate-secrets.sh`), reconstruire l'image depuis le
dépôt (jamais depuis le conteneur), vérifier le durcissement (`bash scripts/k8s/verify.sh`).

## 6. Retour d'expérience (sous 5 jours ouvrés)

Une page, sans recherche de coupable :
- chronologie (détection → confinement → retour à la normale), avec les `requestId` ;
- cause racine, et pourquoi les contrôles existants ne l'ont pas arrêtée plus tôt ;
- actions : nouveau test de régression, nouvelle règle de détection ou seuil ajusté, règle Semgrep ou
  politique Kyverno, mise à jour de ce plan.

## Exercice réalisé (simulation)

Le 6 novembre 2026, sur le cluster de test, avec `scripts/demo/attack.sh` :

| Heure (UTC) | Événement | Phase |
|---|---|---|
| 21:00:07 | alerte `brute_force` sur `a***@tropicline.local` depuis `10.244.0.1` ; les essais suivants reçoivent 429 | détection, confinement automatique |
| 21:00:08 | alerte `injection_probe` : `1; DROP TABLE users` dans la recherche | détection |
| 21:00:09 | alerte `access_probe` : 10 commandes inconnues demandées (énumération) | détection |
| + 5 min | analyse : aucune connexion réussie depuis l'adresse, aucune réponse anormale aux injections (requêtes paramétrées), aucune commande d'autrui lue (404) → **P3**, pas de donnée exposée | analyse |
| — | constat : le compte admin restait verrouillé depuis l'adresse de l'attaquant pendant 5 minutes ; la démonstration attaque désormais un compte client, et la commande de déblocage a été ajoutée à ce plan | retour d'expérience |

Constat de l'exercice précédent, qui a amélioré la détection : avec des compteurs en mémoire, les 3 sondes
d'injection s'étaient réparties sur les 2 répliques de l'API (2 + 1) **sans alerte**. Les compteurs sont
maintenant partagés en base (`docs/detection.md`).
