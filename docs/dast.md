# Test dynamique authentifié (DAST) — OWASP ZAP

Exigence 4.6 : un scan dynamique **authentifié** de l'application **déployée**, qui confirme au moins deux
failles, lesquelles sont ensuite corrigées.

## Comment le scan est fait

| Élément | Choix |
|---|---|
| Cible | l'application déployée sur le cluster Kubernetes de test (`scripts/k8s/up.sh`), par la boutique : `http://127.0.0.1:8090` |
| Outil | OWASP ZAP 2.17.0 (`zaproxy/zap-stable:2.17.0`), en mode *Automation Framework* (`zap/plan.yaml`) |
| Authentification | le script se connecte comme un client (`POST /api/auth/login`), puis ZAP ajoute `Authorization: Bearer <jeton>` à **chaque** requête (`ZAP_AUTH_HEADER_VALUE`). Le jeton n'est ni affiché ni enregistré. |
| Preuve d'authentification | première tâche du plan : `GET /api/auth/me` doit répondre **200** (401 sans jeton valide) ; sinon le plan échoue |
| Découverte | la description OpenAPI de l'API (`zap/openapi.yaml`, toutes les routes et leurs paramètres) + l'exploration de la boutique (spider) |
| Analyse | passive (en-têtes, cookies, contenu), puis active (injections, XSS, etc.), force et seuil moyens, 15 minutes au plus |
| Rapports | `reports/zap/zap-report.html` et `.json` ; résumé sur la page d'exécution GitHub ; artefact `dast-report` |
| Blocage | alerte de risque **High** (voir `docs/pipeline-policy.md`) |

```bash
bash scripts/k8s/up.sh && bash scripts/zap-scan.sh      # en local
```

Dans la CI, le job *Deploy to Kubernetes + ZAP (authenticated)* enchaîne déploiement, vérification du
durcissement et scan, à chaque push.

## Résultats sur la version vulnérable

Scan du 3 novembre 2026, application déployée sur kind, connecté comme `amel.t@example.com` :
**1 High, 5 Medium, 3 Low, 4 Informational**. Le scan bloque donc le pipeline.

| Risque | Alerte ZAP | Exemple | Faille |
|---|---|---|---|
| **High** | SQL Injection | `GET /api/products?search='&sort=price` : une apostrophe dans `search` change la réponse | **V1** |
| Medium | Cross-Domain Misconfiguration | `Access-Control-Allow-Origin: *` sur toutes les routes de l'API, y compris authentifiées | **V8** |
| Medium | Content Security Policy (CSP) Header Not Set | pages de la boutique | **V8** |
| Medium | Missing Anti-clickjacking Header | pages de la boutique | **V8** |
| Medium | Sub Resource Integrity Attribute Missing | feuille de style Google Fonts | — |
| Medium | HTTP Only Site | pas de HTTPS sur le cluster de test | — (limite de l'environnement de test) |
| Low | Server Leaks Information via "X-Powered-By" | `X-Powered-By: Express` sur l'API | **V8** |
| Low | X-Content-Type-Options Header Missing | réponses de l'API | **V8** |
| Low | Cross Site Scripting Weakness (Persistent in JSON Response) | `<script>alert(1);</script>` envoyé dans un avis, renvoyé tel quel par `GET /api/products/kenya-nyeri/reviews` | **V5** |
| Info | Modern Web Application, User Agent Fuzzer, Authentication Request Identified, Suspicious Comments | — | — |

### Failles confirmées à l'exécution : V1, V5, V8

- **V1 — injection SQL** : confirmée par une attaque réussie, risque **High**. C'est la confirmation la plus
  forte : ZAP n'a pas lu le code, il a observé le comportement de l'application en marche.
- **V5 — XSS stocké** : ZAP a enregistré un script dans un avis (route accessible **seulement connecté**,
  ce que permet le scan authentifié) et l'a retrouvé intact dans la réponse. ZAP le classe *Low* car la
  réponse est du JSON ; le risque réel est plus élevé, car la boutique insère ce texte comme HTML
  (`dangerouslySetInnerHTML`, confirmé par Semgrep).
- **V8 — mauvaise configuration** : CORS ouvert à toutes les origines, en-têtes de sécurité absents,
  `X-Powered-By` exposé.

### Ce que ZAP n'a pas trouvé, et pourquoi

| Faille | Pourquoi un scanner dynamique ne la voit pas | Comment on la prouve |
|---|---|---|
| V2 — prix modifié par le client | la requête « normale » réussit aussi : il faut savoir que le prix ne doit pas venir du client | test fonctionnel : commander avec `price: 0.001` |
| V3 — commandes d'autrui (IDOR) | il faudrait deux comptes et savoir que la commande 1003 n'appartient pas au client | test avec deux comptes |
| V4 — rôle choisi à l'inscription | ZAP ne sait pas que `role` est un champ interdit | test : s'inscrire avec `"role":"admin"` |
| V6 — clé de signature | corrigée avant le scan (docs/secrets.md) | — |
| V7 — lodash vulnérable | pollution de prototype par un corps JSON imbriqué : ZAP n'a pas de règle active pour cela côté serveur | Trivy (dépendances et image) |

Ce sont des failles de **logique métier et de contrôle d'accès** : elles demandent de connaître les règles
de l'application. Le DAST complète l'analyse statique, il ne la remplace pas ; ces trois failles sont
couvertes par des tests ciblés (« cette faille ne doit pas exister ») ajoutés avec leurs corrections.

## Après correction

À compléter après les commits de correction de V1, V5 et V8 : nouveau scan, même plan, et comparaison
alerte par alerte (le pipeline doit redevenir vert sur le job DAST).
