# Observabilité et détection à l'exécution

Exigence 4.7 : journaux structurés avec identifiant de corrélation, métriques de sécurité, détection d'au
moins une attaque à l'exécution. La réponse aux alertes est décrite dans `docs/incident-response.md`.

## Journaux structurés

L'API écrit **une ligne JSON par événement** sur sa sortie standard ; Docker et Kubernetes les collectent
(`docker compose logs api`, `kubectl logs`). Code : `backend/src/security.js`.

```json
{"time":"2026-11-06T21:00:07.412Z","level":"alert","event":"security.alert","requestId":"8ce5772e…",
 "ip":"10.244.0.1","userId":null,"method":"POST","path":"/api/auth/login","rule":"brute_force",
 "description":"repeated failed sign-ins on one account from one address","count":5,"windowMinutes":5,
 "account":"a***@tropicline.local"}
```

| Événement | Niveau | Quand |
|---|---|---|
| `http.request` | info | chaque requête : statut, durée, IP, utilisateur, user-agent |
| `auth.login_succeeded` / `auth.registered` | info | connexion réussie, nouveau compte |
| `auth.login_failed` | warn | mot de passe faux ou compte inconnu |
| `auth.locked_out` | warn | connexion refusée pendant un verrouillage |
| `attack.injection_attempt` | warn | motif d'injection SQL ou de script dans une entrée |
| `authz.denied` | warn | requête refusée (401, 403) ou commande introuvable (404) |
| `admin.*` | info | journal d'audit : changement de statut, de prix, consultation des clients |
| `security.alert` | **alert** | une règle de détection atteint son seuil |
| `http.error` | error | erreur serveur, avec la pile d'appels (jamais envoyée au client) |

**Identifiant de corrélation** : nginx attribue un `X-Request-Id` à chaque requête ; l'API le reprend (ou en
crée un), le renvoie au client dans l'en-tête et dans les messages d'erreur, et l'écrit dans chaque ligne.
Une capture d'écran d'erreur envoyée par un client mène directement à la ligne du journal.

**Ce qui n'est jamais journalisé** : mots de passe, jetons, secrets. Les adresses e-mail sont masquées
(`a***@tropicline.local`). Les échantillons d'attaque sont tronqués à 200 caractères.

## Règles de détection

| Règle | Signal | Seuil | Réponse automatique |
|---|---|---|---|
| `brute_force` | échecs de connexion sur **un compte** depuis **une adresse** | 5 en 5 min | connexion refusée (429, `Retry-After`) pour ce couple jusqu'à la fin de la fenêtre, **même avec le bon mot de passe** |
| `injection_probe` | motifs d'injection SQL ou de script (`UNION SELECT`, `pg_sleep(`, `' OR '1'='1`, `<script`, `onerror=`…) dans les paramètres ou le corps | 3 en 5 min, par adresse | alerte (la requête est déjà inoffensive depuis la correction de V1 et V5) |
| `access_probe` | requêtes refusées (401, 403) ou numéros de commande inconnus (404) | 10 en 5 min, par adresse | alerte (énumération, tentative d'IDOR) |

Choix :
- **Le verrouillage vise le couple adresse + compte**, pas le compte seul : un attaquant ne peut pas bloquer
  un client légitime qui se connecte d'ailleurs (déni de service par verrouillage).
- **Une seule alerte par fenêtre** (au moment où le seuil est atteint), pour ne pas noyer l'équipe.
- **Les compteurs sont partagés** entre toutes les répliques de l'API (table `security_events` dans
  PostgreSQL, conservée une heure). Avec des compteurs en mémoire, un attaquant réparti sur 2 pods restait
  sous chaque seuil : le premier essai sur Kubernetes a montré 3 sondes d'injection réparties 2 + 1, sans
  alerte. Corrigé, puis vérifié : chaque règle se déclenche une seule fois sur 2 répliques.
- **La détection ne ralentit pas** les requêtes : les événements sont enregistrés en arrière-plan (sauf la
  connexion, où le verrouillage doit être exact).

## Métriques

`GET /metrics` (format Prometheus), **non exposé** au public : nginx ne transmet que `/api/` ; sur
Kubernetes, seul le pod lui-même ou un `kubectl port-forward` y accède.

```text
tropicline_http_requests_total{status="401"} 5
tropicline_http_requests_total{status="429"} 2
tropicline_security_events_total{event="auth.login_failed"} 5
tropicline_security_events_total{event="attack.injection_attempt"} 2
tropicline_security_alerts_total{rule="brute_force"} 1
```

```bash
kubectl --context kind-tropicline -n tropicline exec deploy/api -- \
  /nodejs/bin/node -e "fetch('http://127.0.0.1:3000/metrics').then(r=>r.text()).then(console.log)"
```

## Démonstration

```bash
bash scripts/demo/attack.sh            # 3 attaques sur le cluster, puis les alertes levées
bash scripts/detections.sh             # les alertes à tout moment (reports/detections.md)
```

Résultat sur le cluster Kubernetes (2 répliques de l'API) :

```text
── 1. Brute force : mots de passe faux sur un compte
401 401 401 401 401 429 429 429 429 429 429 429   (401 = mauvais mot de passe, 429 = verrouillé)
── 2. Sondes d'injection SQL sur la recherche
200 200 200   (inoffensives depuis la correction de V1, mais vues)
── 3. Énumération des commandes en tant que client
404 404 200 404 404 404 404 404 404 404 404 404 404 404
```

| Heure (UTC) | Règle | Source | Nombre / 5 min | Preuve |
|---|---|---|---|---|
| 21:00:07 | `brute_force` | `10.244.0.1` → a***@tropicline.local | 5 | POST /api/auth/login |
| 21:00:08 | `injection_probe` | `10.244.0.1` | 3 | `1; DROP TABLE users` |
| 21:00:09 | `access_probe` | `10.244.0.1` | 10 | GET /api/orders/1011 → 404 |

## Dans la CI

Le job *Deploy to Kubernetes + ZAP* attaque l'application déployée (tests de régression, dont un brute
force, puis le scan ZAP, qui envoie des injections et des requêtes refusées). L'étape *Runtime detection*
lit ensuite les journaux de tous les pods de l'API et **échoue si l'une des trois règles ne s'est pas
déclenchée** : une détection cassée par une modification du code casse le pipeline. Le tableau des alertes
apparaît sur la page de l'exécution.

## Limites

- **Adresse source** : sur kind, le trafic entre par un NodePort et arrive avec l'adresse du nœud
  (`10.244.0.1`) : tous les clients partagent alors la même adresse. En production, un Ingress ou un
  équilibreur qui conserve l'adresse du client (`externalTrafficPolicy: Local`, proxy protocol) est
  nécessaire pour que les règles par adresse aient un sens.
- **Pas de centralisation** : les alertes restent dans les journaux des pods (perdus si le pod est recréé).
  Étape suivante (bonus) : expédier les journaux vers un SIEM (Loki, Elastic, Wazuh) et y alerter, et
  collecter `/metrics` avec Prometheus pour un tableau de bord.
- **Signatures** : la règle d'injection reconnaît des motifs connus ; elle ne remplace pas la correction
  des failles, qui reste la vraie protection. Elle sert à voir qu'on est attaqué.
- **Détection au niveau des conteneurs** (shell lancé dans un pod, fichier modifié) : non couverte ; Falco
  serait l'outil adapté.
