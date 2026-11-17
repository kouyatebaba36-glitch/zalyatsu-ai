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

## Modèles disponibles (v0.2)
Le studio propose 27 modèles, répartis en 5 onglets :
- **Texte → Image** : SOUL V2, SOUL Cinema, SOUL, Qwen Image 3, Z-Image Turbo, Recraft V4.1, Ideogram 4.0, Grok Image 2.0
- **Image → Image** : Qwen Image 3 Édition, Grok Image 2.0 Édition, Ideogram 4.0 Remix, SOUL avec image de référence
- **Vidéo** : Seedance 2.5 et Seedance 2.0 (texte, image, références), Wan 2.7 (texte, image), Kling 3.0 Pro image → vidéo
- **Genjutsu** : transfert de mouvement, remplacement d'élément, Restyle (avec choix du style)
- **Motion Control** : Kling 3.0 Pro et Standard, Kling 2.6 Pro

Les endpoints et paramètres viennent de `catalog.json`, généré depuis la documentation
officielle (docs.higgsfield.ai) par `npm run catalog`. Pour ajouter un modèle, ajoutez une
ligne dans `scripts/update-catalog.mjs`, relancez `npm run catalog`, puis committez `catalog.json`.
Le serveur valide chaque requête contre ce catalogue avant de l'envoyer à Higgsfield.

L'accès réel à chaque modèle dépend de votre clé et de vos crédits : un modèle non autorisé
renvoie « Ta clé n'a pas accès à ce modèle ».
Formats de fichiers acceptés par Higgsfield : JPG, PNG, WebP, GIF, MP4 et WAV (pas de MOV).
