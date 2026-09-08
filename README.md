# JCPMF — Frontend

Interface web de **Je cours pour ma forme**. Le projet utilise du HTML, du CSS et du JavaScript natif. Il peut aussi être installé sur un téléphone comme une application.

## Utiliser l'application

1. Créer un compte, se connecter ou choisir le mode démo.
2. Ouvrir une séance depuis l'accueil et suivre les étapes du chrono.
3. Remplir le petit bilan à la fin de la séance.
4. Utiliser **Parcours** pour préparer une sortie libre avec la carte et le GPS.
5. Ouvrir **Profil** pour choisir un avatar, compléter ses objectifs et régler l'apparence ou les rappels.
6. Sur mobile, accepter la proposition d'installation ou utiliser « Ajouter à l'écran d'accueil » dans le navigateur.

Le mode démo et plusieurs préférences restent enregistrés uniquement sur l'appareil. Un vrai compte est nécessaire pour conserver la progression dans la base MySQL.

## Organisation des fichiers

- `index.html` et `js/dashboard.js` : accueil et programme.
- `session.html` et `js/session.js` : séance, chrono et bilan.
- `routes.html` et `js/routes.js` : parcours, carte et suivi GPS.
- `profile.html` et `js/profile.js` : profil et paramètres.
- `js/api.js` : échanges avec le backend.
- `js/config.js` : choix de l'adresse du backend.
- `css/styles.css` : styles communs à toutes les pages.
- `sw.js` et `manifest.webmanifest` : installation et cache de la PWA.

## Déployer sur Vercel

1. Importer uniquement le dépôt frontend.
2. Ne pas définir de **Root Directory**.
3. Ajouter `BACKEND_API_URL` dans les variables d'environnement de production.
4. Lancer un nouveau déploiement.
5. Vérifier `/api/config`, puis tester la création d'un vrai compte.

## Lancer le projet

Depuis le dossier `jcpmf-frontend` :

```bash
npm run dev
```

Ouvrir ensuite :

```text
http://127.0.0.1:3000
```

Le mode démo fonctionne sans backend. Pour créer un vrai compte et enregistrer la progression en base de données, lancer également `jcpmf-backend` sur le port `4000`.

## Où se trouve l'URL du backend ?

Le fichier `.env` contient uniquement l'URL publique du backend :

```env
BACKEND_API_URL=https://jcpmf-backend.vercel.app/
```

- En local, le serveur lit `.env` au lancement.
- Sans cette variable, il utilise l'IP de l'ordinateur avec le port `4000`.
- En ligne, [api/config.js](api/config.js) lit la variable `BACKEND_API_URL` configurée dans Vercel.

Dans le projet **frontend** sur Vercel, ajouter :

```text
BACKEND_API_URL=https://jcpmf-backend.vercel.app/
```

Puis redéployer le frontend. Pour vérifier la valeur réellement utilisée en ligne, ouvrir :

```text
https://jcpmf-frontend.vercel.app/api/config
```

Cette page doit renvoyer une adresse qui se termine par `/api`. Les identifiants de la base de données restent uniquement dans le projet backend.

## Tester sur un téléphone

1. Connecter le téléphone et l'ordinateur au même Wi-Fi.
2. Trouver l'adresse IP locale de l'ordinateur.
3. Pour utiliser le backend local, mettre temporairement `BACKEND_API_URL=http://IP_DE_L_ORDINATEUR:4000` dans `.env`.
4. Lancer le backend sur le port `4000`.
5. Lancer le frontend avec `npm run dev`.
6. Ouvrir `http://IP_DE_L_ORDINATEUR:3000` sur le téléphone.

Pour ce test, le backend doit accepter les adresses du réseau local avec `ALLOW_LAN_ORIGINS=true` dans son propre fichier `.env`.
