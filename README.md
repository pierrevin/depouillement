# depouillement

Webapp tres legere pour compter les voix pendant un depouillement avec mise a jour en direct.

## Fonctionnalites

- 2 listes configurables (noms modifiables a chaud)
- Compteurs +1 / -1 pour chaque liste
- Compteurs +1 / -1 pour les bulletins blancs et nuls
- Actions rapides mobile: +1 par touche pour un depouillement simple et fiable
- Statistiques instantanees: total bulletins, exprimes, blancs, nuls, pourcentage, tete, ecart
- Calcul des elus sur 21 sieges (prime majoritaire + proportionnelle)
- Mode simulation detaille des elus (21 sieges) avec les noms reels des listes
- Historique recent des actions
- Annulation de la derniere action
- Remise a zero globale
- Synchronisation temps reel entre onglets/appareils via SSE
- Persistance locale du comptage dans `data/state.json`

## Lancer l'application

```bash
npm start
```

Puis ouvrir:

```text
http://localhost:3000
```

## API rapide

- `GET /api/state` - etat courant
- `GET /api/events` - flux temps reel (Server-Sent Events)
- `POST /api/vote` - ajoute/retire une voix (`{ "listId": "liste-1", "delta": 1 }`)
  - `delta` accepte `1`, `-1`
- `POST /api/special-vote` - ajoute/retire un blanc ou nul (`{ "kind": "blank", "delta": 1 }`)
  - `delta` accepte `1`, `-1`
- `POST /api/config` - renomme les listes (`{ "names": ["Liste A", "Liste B"] }`)
- `POST /api/reset` - remet les compteurs a zero
- `POST /api/undo` - annule la derniere action

## Deploiement Render (recommande pour URL publique)

Le repo contient un `render.yaml` pour un deploiement rapide.

### Methode rapide (Blueprint)

1. Va sur Render > **New** > **Blueprint**
2. Connecte ton repo GitHub
3. Render detecte automatiquement `render.yaml`
4. Clique **Apply**
5. Une URL publique sera generee (ex: `https://...onrender.com`)

### Points importants

- L'application lit/stocke l'etat dans `data/state.json`.
- Sur Render, ce stockage est adapte a un usage ponctuel, mais peut etre perdu en cas de redemarrage/redeploy.
- Pour un usage recurrent, il faudra migrer vers une base persistante (ex: Postgres, Supabase, Redis, etc.).
