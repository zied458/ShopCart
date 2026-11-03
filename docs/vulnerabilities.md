# Failles initiales — Tropic Line ShopCart

Ce document décrit les failles **volontairement** présentes dans la première version de l'application,
**avant toute correction** (exigence 4.2 du cahier des charges). Chaque faille est repérée dans le code
par un commentaire `Vn` qui renvoie à ce document.

> Périmètre : toutes les démonstrations se font uniquement sur notre instance locale
> (`http://localhost:3000` et `http://localhost:4173`), avec des comptes et des secrets de test.

Référence : OWASP Top 10, édition 2025. Comptes de test : voir `backend/db/init.js`.

## Synthèse

| # | Faille | Emplacement | OWASP 2025 | CWE | Gravité estimée |
|---|---|---|---|---|---|
| V1 | Injection SQL dans la recherche | `backend/src/routes/products.js` (GET `/api/products`) | A05 Injection | CWE-89 | Critique |
| V2 | Altération du prix au paiement | `backend/src/routes/orders.js` (POST `/api/orders`) | A06 Insecure Design | CWE-602 | Élevée |
| V3 | Accès direct aux commandes d'autrui (IDOR) | `backend/src/routes/orders.js` (GET `/api/orders/:id`) | A01 Broken Access Control | CWE-639 | Élevée |
| V4 | Élévation de rôle à l'inscription | `backend/src/routes/auth.js` (POST `/api/auth/register`) | A01 Broken Access Control | CWE-915, CWE-269 | Critique |
| V5 | Script stocké (XSS) dans les avis | `backend/src/routes/products.js` + `frontend/src/pages/Product.tsx` | A05 Injection | CWE-79 | Élevée |
| V6 | Secret de signature des jetons écrit dans le code | `backend/src/config.js` | A04 Cryptographic Failures | CWE-321, CWE-798 | Critique |
| V7 | Dépendance vulnérable (lodash 4.17.11) | `backend/package.json`, `backend/src/routes/users.js` | A03 Software Supply Chain Failures | CWE-1395, CWE-1321 | Critique (CVE-2019-10744) |
| V8 | Mauvaise configuration : erreurs détaillées, CORS ouvert, en-têtes absents | `backend/src/app.js` | A02 Security Misconfiguration, A10 Mishandling of Exceptional Conditions | CWE-209, CWE-942, CWE-693 | Moyenne |

Les gravités sont des estimations qualitatives (impact × facilité d'exploitation), pas des scores mesurés.

---

## V1 — Injection SQL dans la recherche

- **Emplacement** : `GET /api/products?search=…`, fichier `backend/src/routes/products.js`.
- **Cause** : le texte saisi dans la barre de recherche de la boutique est concaténé dans la requête SQL
  (`ILIKE '%${search}%'`) au lieu d'être passé en paramètre.
- **Impact** : lecture de toute la base, dont les e-mails et les empreintes de mots de passe des clients,
  via `UNION SELECT`. Les messages d'erreur détaillés (V8) facilitent la mise au point de la charge.
- **Démonstration** :
  ```
  GET /api/products?search=zzz' UNION SELECT id, email, 'kit', password_hash, role, null, null, null, null, null, null, '{}'::text[], null, null, 0, 0, null, null, null FROM users--
  ```
  La réponse contient une « fiche produit » par compte, avec l'e-mail et l'empreinte bcrypt.
- **Correction prévue** : requête paramétrée (`$1`) ; validation de longueur ; compte de base de données
  sans droits sur les tables qui ne le concernent pas.

## V2 — Altération du prix au paiement

- **Emplacement** : `POST /api/orders`, fichier `backend/src/routes/orders.js`.
- **Cause** : le serveur enregistre le prix unitaire envoyé par le navigateur (`item.price`) au lieu de le
  lire dans la table `products`. Le navigateur envoie le prix affiché (`frontend/src/store/orders.ts`).
- **Impact** : n'importe quel client achète au prix qu'il choisit (perte financière directe).
- **Démonstration** : envoyer `{"slug":"hand-grinder","qty":1,"price":0.001}` ; le moulin à 165 TND est
  commandé pour 0,001 TND (total 7,001 TND avec la livraison).
- **Correction prévue** : prix et frais de port calculés uniquement côté serveur à partir de la base ;
  le champ `price` envoyé par le client est ignoré.

## V3 — Accès direct aux commandes d'autrui (IDOR)

- **Emplacement** : `GET /api/orders/:id`, fichier `backend/src/routes/orders.js` ; page
  `/account/orders/:id` du site.
- **Cause** : la route vérifie qu'un utilisateur est connecté, mais pas que la commande lui appartient.
  Les numéros de commande sont séquentiels (TL-1001, TL-1002…).
- **Impact** : fuite de données personnelles de tous les clients (nom, téléphone, adresse, achats).
- **Démonstration** : connecté en tant qu'Amel, ouvrir `/account/orders/1003` : la commande de Sana
  s'affiche avec son adresse et son téléphone.
- **Correction prévue** : filtrer par `user_id = req.user.sub` (ou rôle admin) et répondre 404 sinon ;
  éventuellement des identifiants non devinables.

## V4 — Élévation de rôle à l'inscription

- **Emplacement** : `POST /api/auth/register`, fichier `backend/src/routes/auth.js`.
- **Cause** : le rôle du nouveau compte est lu dans le corps de la requête (`req.body.role`).
- **Impact** : un visiteur crée un compte administrateur et obtient l'accès au tableau de bord, aux
  commandes, aux clients et à la modification des prix.
- **Démonstration** : `POST /api/auth/register` avec `"role": "admin"` en plus des champs du formulaire.
- **Correction prévue** : liste blanche des champs acceptés ; rôle toujours `customer` à l'inscription ;
  promotion d'un compte uniquement par un administrateur.

## V5 — Script stocké (XSS) dans les avis

- **Emplacement** : `POST /api/products/:slug/reviews` (stockage sans filtrage) et
  `frontend/src/pages/Product.tsx` (affichage avec `dangerouslySetInnerHTML`).
- **Cause** : l'avis est enregistré tel quel puis inséré comme HTML dans la page.
- **Impact** : le script s'exécute chez chaque visiteur de la fiche produit ; il peut lire le jeton de
  session stocké dans `localStorage` et agir au nom de la victime, y compris un administrateur.
- **Démonstration** : publier l'avis `<img src=x onerror="…">` ; recharger la page : le code s'exécute.
- **Correction prévue** : afficher l'avis comme texte (pas de HTML) ; validation côté serveur ;
  en-tête Content-Security-Policy ; à terme, jeton en cookie `HttpOnly`.

## V6 — Secret de signature des jetons écrit dans le code

- **Emplacement** : `backend/src/config.js` (valeur par défaut de `JWT_SECRET`), aussi visible dans
  l'historique Git. Le mot de passe de développement de la base est également dans
  `docker-compose.yml`.
- **Cause** : secret codé en dur et versionné avec le code.
- **Impact** : toute personne qui lit le dépôt peut fabriquer un jeton administrateur valide sans
  mot de passe.
- **Démonstration** : signer `{"sub":9999,"role":"admin"}` en HS256 avec le secret du dépôt, puis
  appeler `GET /api/admin/customers` : la liste complète des clients est renvoyée.
- **Correction prévue** : **révoquer d'abord** (nouveau secret, ce qui invalide tous les jetons émis),
  **purger ensuite** l'historique Git ; secret fourni à l'exécution par un Secret Kubernetes ; le
  serveur refuse de démarrer sans secret ; Gitleaks bloque tout nouveau secret dans le pipeline.
- **Statut : corrigée** (3 novembre 2026). Secrets révoqués puis fournis à l'exécution en fichiers ;
  plus aucune valeur dans le code ; l'API refuse de démarrer sans secret. Détail, preuves et purge de
  l'historique : `docs/secrets.md`.

## V7 — Dépendance vulnérable

- **Emplacement** : `backend/package.json` (`"lodash": "4.17.11"`, version figée), utilisée dans
  `PATCH /api/users/me` (`backend/src/routes/users.js`) avec le corps de la requête.
- **Cause** : version ancienne connue comme vulnérable (CVE-2019-10744, pollution de prototype dans
  `defaultsDeep`) ; `npm audit` la signale en **critique**.
- **Impact** : un corps JSON contenant `constructor.prototype` peut modifier `Object.prototype` pour tout
  le processus (contournement de logique, plantage).
- **Démonstration** : `npm audit` et Trivy signalent la faille ; la charge
  `{"constructor":{"prototype":{"polluted":true}}}` envoyée à `PATCH /api/users/me` pollue le processus.
- **Correction prévue** : mise à jour de lodash (ou suppression : un simple objet suffit) ; liste blanche
  des champs modifiables ; analyse des dépendances bloquante dans le pipeline.

## V8 — Mauvaise configuration

- **Emplacement** : `backend/src/app.js`.
- **Cause** :
  - le gestionnaire d'erreurs renvoie le message, le détail et la pile d'appels, y compris les erreurs
    SQL brutes ;
  - CORS accepte toutes les origines (`Access-Control-Allow-Origin: *`) ;
  - aucun en-tête de sécurité (CSP, HSTS, X-Content-Type-Options…) et `X-Powered-By: Express` est
    envoyé.
- **Impact** : aide directe à l'attaquant (structure SQL, chemins de fichiers, versions) ; pages tierces
  autorisées à appeler l'API ; aucune défense en profondeur contre V5.
- **Démonstration** : `GET /api/products?search='` renvoie `syntax error at or near …` et la pile
  d'appels.
- **Correction prévue** : message générique au client, détail uniquement dans les journaux (avec un
  identifiant de corrélation) ; CORS limité à l'origine du site ; en-têtes de sécurité (helmet) ;
  `X-Powered-By` désactivé.

---

## Suivi des failles

| # | Détectée par l'analyse statique (CI) | Confirmée à l'exécution par ZAP (`docs/dast.md`) | Statut |
|---|---|---|---|
| V1 | Semgrep (règle d'équipe) | **oui** — SQL Injection, risque High | ouverte |
| V2 | non | non (logique métier) | ouverte |
| V3 | non | non (contrôle d'accès, demande deux comptes) | ouverte |
| V4 | Semgrep (règle d'équipe) | non | ouverte |
| V5 | Semgrep (règle d'équipe) | **oui** — XSS persistant dans une réponse JSON | ouverte |
| V6 | Gitleaks, Semgrep | — (corrigée avant le scan) | **corrigée** (`docs/secrets.md`) |
| V7 | Trivy (dépendances et image) | non | ouverte |
| V8 | Semgrep (2 avertissements) | **oui** — CORS ouvert, en-têtes absents, `X-Powered-By` | ouverte |

---

## Lacune connue, traitée dans la phase observabilité

Aucune journalisation de sécurité : une connexion échouée, une erreur SQL ou un accès refusé ne laisse
aucune trace exploitable (OWASP A09:2025 Security Logging and Alerting Failures). Les journaux
structurés, les métriques et la détection seront ajoutés à l'étape 4.7.
