# ZALYATSU AI — déploiement GitHub et Render

## 1. GitHub
Créez votre compte GitHub et terminez la validation de votre adresse email.
Créez un dépôt privé nommé `zalyatsu-ai`, puis décompressez le ZIP.
Importez le CONTENU du dossier `zalyatsu-ai` dans le dépôt (pas le ZIP).
`package.json`, `server.js`, `package-lock.json`, `render.yaml` et `public/`
doivent être à la racine du dépôt. Aucun `.env` réel ne doit être importé.

## 2. Render
Créez un compte Render et connectez le dépôt GitHub, en limitant l'autorisation
au seul dépôt de cette application. Choisissez New > Web Service, branche main.
Runtime : Node. Build : `npm ci --omit=dev`. Start : `npm start`.
Health Check : `/healthz`. Root Directory : vide si le dépôt suit l'étape 1.
Le fichier render.yaml permet aussi une création via Blueprint.

Dans Environment, renseignez uniquement sur Render :
- HF_API_KEY : clé complète copiée depuis le compte Higgsfield, sans préfixe `Key`.
  Si votre console fournit deux champs, utilisez `KEY_ID:KEY_SECRET`.
- APP_USERNAME : votre identifiant privé (sans deux-points).
- APP_PASSWORD : mot de passe unique, aléatoire, 16 caractères minimum.
- NODE_ENV : production.

Lancez le déploiement. Ouvrez l'URL HTTPS affichée par Render, puis saisissez
APP_USERNAME et APP_PASSWORD lorsque le navigateur les demande.
Sur iPhone : Safari > Partager > Sur l'écran d'accueil.

## Validation et limites
Les routes Wan 2.7 et Seedance 2.0, l'authentification et le cycle submit/status/cancel
ont été comparés à la documentation officielle le 13 octobre 2026.
Un test réel nécessite votre clé valide, les crédits et les autorisations des modèles.
La présence d'une clé affiche « API configurée » ; elle ne prouve pas sa validité.
Pour le premier essai, sélectionnez une vidéo de 5 secondes et vérifiez le résultat.
Les crédits de génération sont facturés par Higgsfield.
Cette version propose deux modèles texte-vers-vidéo, sans images ni motion control.
L'accès est privé par authentification HTTP Basic sur HTTPS : une personne qui
obtient vos identifiants peut utiliser vos crédits. Ne partagez pas le mot de passe.
Les sessions et l'historique sont en mémoire : redémarrage ou mise en veille peut
perdre leur suivi. Consultez Higgsfield pour retrouver une génération déjà lancée ;
ne relancez pas immédiatement après une erreur réseau.
La disponibilité et les limites du plan gratuit Render sont à vérifier à la création.

## Lancement local
Node 20+ : `npm ci`, définir les variables d'environnement, puis `npm start`.
Le fichier `.env.example` est un modèle uniquement ; `.env` n'est pas chargé automatiquement.
Ne mettez jamais une vraie clé dans public/, le README ou un commit Git.
