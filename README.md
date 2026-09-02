# JCPMF — Frontend

PWA *Je cours pour ma forme*, écrite en HTML, CSS et JavaScript Vanilla.

## Démarrer en local

```bash
npm run dev
```

Ouvrir ensuite `http://127.0.0.1:3000`.

Pour faire fonctionner la connexion, démarrer aussi le dépôt `jcpmf-backend` sur le port `4000`.

## Déploiement Vercel

Importer ce dépôt seul dans Vercel, sans définir de **Root Directory**.

Ajouter la variable d’environnement suivante dans Vercel :

```text
BACKEND_API_URL=https://adresse-de-ton-backend.vercel.app
```

Le petit endpoint `/api/config` fournit cette adresse au JavaScript du frontend. Ne jamais placer une URL `localhost` dans cette variable de production.
