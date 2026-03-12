# depouillement

Webapp tres legere pour compter les voix pendant un depouillement avec mise a jour en direct.

## Fonctionnalites

- 2 listes configurables (noms modifiables a chaud)
- Compteurs +1 / -1 pour chaque liste
- Compteurs +1 / -1 pour les bulletins blancs et nuls
- Actions rapides mobile: +1 par touche pour un depouillement simple et fiable
- Statistiques instantanees: total bulletins, exprimes, blancs, nuls, pourcentage, tete, ecart
- Champ "inscrits" avec calcul automatique du taux de participation
- Calcul des elus sur 19 sieges (prime majoritaire + proportionnelle)
- Mode simulation detaille des elus (19 sieges) avec les noms reels des listes
- Mode partage colistiers: PIN de saisie (lecture seule sans PIN)
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
- `GET /api/access` - indique si la saisie est protegee par PIN et si la session admin est active
- `POST /api/access/verify` - verifie un PIN de saisie et ouvre une session admin (`{ "pin": "1234" }`)
- `POST /api/access/logout` - ferme la session admin en cours
- `GET /api/events` - flux temps reel (Server-Sent Events)
- `POST /api/vote` - ajoute/retire une voix (`{ "listId": "liste-1", "delta": 1 }`)
  - `delta` accepte `1`, `-1`
- `POST /api/special-vote` - ajoute/retire un blanc ou nul (`{ "kind": "blank", "delta": 1 }`)
  - `delta` accepte `1`, `-1`
- `POST /api/config` - renomme les listes et met a jour les inscrits (`{ "names": ["Liste A", "Liste B"], "registeredVoters": 1200 }`)
- `POST /api/set-totals` - saisie manuelle des totaux (`{ "listVotes": [100, 90], "blankVotes": 5, "nullVotes": 2 }`)
- `POST /api/reset` - remet les compteurs a zero
- `POST /api/undo` - annule la derniere action

## Partage lecture seule / saisie

- Configure un PIN serveur via la variable d'environnement `WRITE_PIN`.
- Les colistiers arrivent par defaut en mode lecteur.
- Le mode admin (saisie) s'active depuis le bouton **Menu admin**.
- Avec PIN, le mode admin demande un code avant de deverrouiller la saisie.
- Une fois valide, la session admin est conservee apres rechargement (cookie HTTP-only).

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
