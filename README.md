# JCPMF — Frontend

PWA *Je cours pour ma forme*, écrite en HTML, CSS et JavaScript Vanilla.

## Démarrer en local

```bash
npm run dev
```

Ouvrir ensuite `http://127.0.0.1:3000`.

Pour faire fonctionner la connexion, démarrer aussi le dépôt `jcpmf-backend` sur le port `4000`.

## Tester depuis un mobile

Connecter le téléphone et l’ordinateur au même Wi-Fi, puis ouvrir `http://ADRESSE_IP_DU_MAC:3000` sur le téléphone. En accès HTTP local, le frontend utilise automatiquement `http://ADRESSE_IP_DU_MAC:4000/api`. L’API doit être démarrée avec `ALLOW_LAN_ORIGINS=true` dans son fichier `.env`.

## Déploiement Vercel

Importer ce dépôt seul dans Vercel, sans définir de **Root Directory**.

Ajouter la variable d’environnement suivante dans Vercel :

```text
BACKEND_API_URL=https://adresse-de-ton-backend.vercel.app
```

Le petit endpoint `/api/config` fournit cette adresse au JavaScript du frontend. Ne jamais placer une URL `localhost` dans cette variable de production.
