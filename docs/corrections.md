# Corrections des failles

Ce document décrit la correction de chaque faille de `docs/vulnerabilities.md`, avec la preuve qu'elle
fonctionne. Chaque correction est **un commit séparé** ; chaque faille a au moins un **test de régression**
(`backend/test/security.test.mjs`) écrit **avant** la correction, qui échouait sur la version vulnérable et
réussit après.

## Méthode

1. Écrire les tests du point de vue de l'attaquant, contre l'application déployée (derrière nginx), plus des
   tests « témoins » qui vérifient que la boutique fonctionne toujours.
2. Les exécuter sur la version vulnérable : **13 tests sur 18 échouent**, chaque faille est détectée, les
   témoins réussissent.
3. Corriger une faille, reconstruire, relancer les tests, committer.
4. Relancer l'analyse statique (Semgrep, Trivy) et le scan dynamique (ZAP).

Les tests tournent dans la CI après chaque déploiement de test (job *Deploy to Kubernetes + ZAP*) : une
faille réintroduite plus tard casse le pipeline.

```bash
BASE_URL=http://localhost:8081 npm --prefix backend run test:security
```

## Synthèse

| # | Faille | Correctif | Commit | Tests avant → après |
|---|---|---|---|---|
| V1 | Injection SQL | requête paramétrée (`$1`), jokers `%` `_` échappés, longueur limitée | `Fix V1` | 2 ❌ → 2 ✅ |
| V2 | Prix fourni par le client | prix lu en base, prix du client ignoré ; ligne produit verrouillée (`FOR UPDATE`) | `Fix V2` | 1 ❌ → 1 ✅ |
| V3 | IDOR sur les commandes | la commande doit appartenir à l'appelant, sinon 404 | `Fix V3` | 1 ❌ → 1 ✅ |
| V4 | Rôle choisi à l'inscription | rôle toujours `customer` ; rôle admin vérifié **en base** à chaque requête | `Fix V4` | 1 ❌ → 1 ✅ |
| V5 | XSS stocké | avis affiché comme texte ; CSP sans script en ligne ; longueur limitée | `Fix V5` | 3 ❌ → 3 ✅ |
| V6 | Secret dans le code | secrets à l'exécution, révoqués (`docs/secrets.md`) | `Fix V6` | — |
| V7 | lodash vulnérable | lodash supprimé ; champs du profil copiés un par un | `Fix V7` | 1 ❌ → 2 ✅ |
| V8 | Mauvaise configuration | plus de CORS, plus de `X-Powered-By`, en-têtes de sécurité, erreurs génériques + identifiant | `Fix V8` | 4 ❌ → 4 ✅ |

Résultat : **18/18 tests réussis** sur la version corrigée.

---

## V1 — Injection SQL

**Avant** : le texte de recherche était collé dans la requête SQL. Une apostrophe provoquait une erreur SQL
(500, avec le message de PostgreSQL et la pile d'appels), et une charge `UNION SELECT` renvoyait **7 comptes
avec leur e-mail et leur empreinte de mot de passe**.

**Correctif** (`backend/src/routes/products.js`) :
- le texte est passé en **paramètre** (`ILIKE $1`) : PostgreSQL le reçoit séparément de la requête et le
  traite toujours comme une donnée, jamais comme du code ;
- `%` et `_` sont échappés, pour être cherchés littéralement ;
- 100 caractères au plus ; l'ordre de tri vient d'une liste fixe.

**Pourquoi pas un filtre de caractères** : bloquer `'` ou `UNION` se contourne (encodages, commentaires) et
casse des recherches légitimes. La requête paramétrée supprime la cause.

## V2 — Altération du prix

**Avant** : le prix unitaire de chaque ligne venait du navigateur ; un moulin à 165 TND s'achetait 0,001 TND.

**Correctif** (`backend/src/routes/orders.js`, `frontend/src/store/orders.ts`) :
- le prix est lu dans la table `products` ; un prix envoyé par le client est **ignoré** ; la boutique n'en
  envoie plus ;
- la ligne produit est verrouillée (`SELECT … FOR UPDATE`) jusqu'à l'enregistrement de la commande : deux
  commandes simultanées ne peuvent pas vendre le dernier sachet deux fois ;
- la mouture est vérifiée (liste fixe, café seulement) ; 30 lignes au plus par commande.

**Principe** : le client n'est pas une source de confiance pour une donnée métier (OWASP A06 Insecure Design).

## V3 — Accès aux commandes d'autrui (IDOR)

**Avant** : tout client connecté lisait n'importe quelle commande par son numéro, avec le nom, le téléphone et
l'adresse d'un autre client (la commande 1004 d'un autre client répondait 200).

**Correctif** (`backend/src/routes/orders.js`) : la commande doit appartenir à l'appelant
(`WHERE id = $1 AND user_id = $2`). Sinon, ou si le numéro est invalide, la réponse est **404**, comme pour une
commande qui n'existe pas : elle ne confirme même pas que le numéro est utilisé. Les administrateurs passent
par `/api/admin/orders`.

## V4 — Élévation de rôle à l'inscription

**Avant** : `"role": "admin"` dans le formulaire d'inscription créait un compte administrateur.

**Correctif** (`backend/src/routes/auth.js`, `backend/src/middleware/auth.js`) :
- le rôle d'un nouveau compte est toujours `customer` ; il n'est jamais lu dans la requête ;
- les routes d'administration lisent le rôle **en base** à chaque requête au lieu de le croire dans le jeton :
  un jeton reste valable 7 jours, et un compte qui perd le rôle admin perd l'accès immédiatement.

**Remédiation des données** : corriger le code ne retire pas les comptes déjà élevés. Les comptes devenus
administrateurs par la faille (3 comptes de test dans la base locale) ont été rétrogradés :

```sql
UPDATE users SET role = 'customer' WHERE role = 'admin' AND email <> 'admin@tropicline.local';
```

En production, il faudrait aussi examiner ce que ces comptes ont fait avec les droits admin.

## V5 — Script stocké (XSS) dans les avis

**Avant** : la boutique insérait chaque avis comme du HTML (`dangerouslySetInnerHTML`) : un script dans un
avis s'exécutait chez chaque visiteur (vol de session, actions en son nom).

**Correctif** :
- **cause** (`frontend/src/pages/Product.tsx`) : l'avis est affiché comme **texte** ; React l'échappe, le
  balisage apparaît comme des caractères ; `whitespace-pre-line` conserve les retours à la ligne ;
- **deuxième ligne de défense** (`frontend/nginx/security-headers.conf`) : `Content-Security-Policy` avec
  `script-src 'self'` : aucun script en ligne ni gestionnaire `onerror=` ne peut s'exécuter, même si du HTML
  injecté atteignait la page par un autre chemin ;
- l'API refuse les avis de plus de 1 000 caractères.

**Vérifié dans un navigateur** sur la version reconstruite : l'avis `<img src=x onerror="alert(…)">` s'affiche
en caractères, aucun élément `img` n'est créé, aucune boîte de dialogue ne s'ouvre, et aucune page ne signale
de violation CSP (polices et vidéo se chargent).

Les avis malveillants déjà en base ne sont plus dangereux (affichés comme texte) ; ils peuvent être modérés.

## V7 — Dépendance vulnérable (lodash 4.17.11)

**Avant** : `PATCH /api/users/me` fusionnait tout le corps de la requête avec `_.defaultsDeep` ; la charge
`{"constructor":{"prototype":{…}}}` modifiait `Object.prototype` pour tout le serveur. Le test le montre : après
la pollution, un article sans mouture héritait de la mouture `espresso`.

**Correctif** (`backend/src/routes/users.js`, `backend/package.json`) : lodash est **supprimé**. La route lit
`phone`, `address`, `city` et `preferences.grind` un par un, vérifie type et longueur, et ignore tout le reste.

**Pourquoi supprimer plutôt que mettre à jour** : lodash 4.18 corrige les CVE connues, mais la fusion profonde
d'un corps de requête reste une mauvaise pratique (affectation de masse). Une dépendance de moins, c'est une
surface d'attaque et une maintenance de moins. Trivy sur `backend/package-lock.json` : **0** `HIGH`/`CRITICAL`
(1 `CRITICAL` et 3 `HIGH` avant).

## V8 — Mauvaise configuration

**Avant** : `Access-Control-Allow-Origin: *`, `X-Powered-By: Express`, aucun en-tête de sécurité, et les
erreurs renvoyaient le message brut de PostgreSQL et la pile d'appels.

**Correctif** (`backend/src/app.js`, `frontend/nginx/`) :
- **CORS supprimé** (et le paquet `cors`) : la boutique et l'API partagent la même origine via nginx ; aucun
  autre site n'a besoin de lire l'API ; sans en-tête CORS, le navigateur refuse ;
- `X-Powered-By` désactivé ;
- API : `X-Content-Type-Options: nosniff`, CSP `default-src 'none'`, `Referrer-Policy`, `Cache-Control: no-store` ;
- boutique (nginx) : CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` ;
- **erreurs** : le client reçoit un message court et un **identifiant de corrélation** ; le détail (message,
  code, pile) part uniquement dans le journal du serveur, en une ligne JSON avec ce même identifiant :

```text
client : {"error":"Something went wrong on our side.","requestId":"b0eff675…"}
journal : {"level":"error","requestId":"b0eff675…","method":"GET","path":"/api/…","message":"…","stack":"…"}
```

## Résultats d'ensemble

| Contrôle | Version vulnérable | Version corrigée |
|---|---|---|
| Tests de régression | 13 échecs / 18 | **18 / 18** |
| Semgrep | 4 `ERROR` (V1, V4, V5, V6) | **0 `ERROR`** (2 `WARNING`, faux positifs connus) |
| Trivy dépendances (API) | 1 `CRITICAL`, 3 `HIGH` | **0** |
| ZAP | 1 High (V1), 5 Medium, 3 Low | **0 High réelle**, 11 alertes sur 13 disparues (`docs/dast.md`) |
| Gitleaks | 3 secrets | **0** (révoqués, puis historique purgé : `docs/secrets.md`) |
