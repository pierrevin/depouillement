# depouillement

Webapp tres legere pour compter les voix pendant un depouillement avec mise a jour en direct.

## Fonctionnalites

- 2 listes configurables (noms modifiables a chaud)
- 2 tables de depouillement (table-1 / table-2) avec fusion automatique en temps reel
- Compteurs +1 / -1 pour chaque liste (par table)
- Compteurs +1 / -1 pour les bulletins blancs et nuls (par table)
- Actions rapides mobile: +1 par touche pour un depouillement simple et fiable
- Statistiques instantanees: total bulletins, exprimes, blancs, nuls, pourcentage, tete, ecart
- Champ "inscrits" avec calcul automatique du taux de participation
- Calcul des elus sur 19 sieges (prime majoritaire + proportionnelle)
- Mode simulation detaille des elus (19 sieges) avec les noms reels des listes
- Mode partage colistiers: compte admin (ou PIN en mode legacy), lecture seule par defaut
- Historique recent des actions
- Annulation de la derniere action de la table active uniquement
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
- `GET /api/access` - indique si la saisie est protegee, le mode (`none|pin|account`) et si la session admin est active
- `POST /api/access/login` - connexion admin par identifiant/mot de passe (`{ "username": "admin", "password": "secret" }`)
- `POST /api/access/verify` - verifie un PIN de saisie (uniquement si mode PIN) (`{ "pin": "1234" }`)
- `POST /api/access/logout` - ferme la session admin en cours
- `GET /api/events` - flux temps reel (Server-Sent Events)
- `POST /api/vote` - ajoute/retire une voix (`{ "tableId": "table-1", "listId": "liste-1", "delta": 1 }`)
  - `delta` accepte `1`, `-1`
- `POST /api/special-vote` - ajoute/retire un blanc ou nul (`{ "tableId": "table-1", "kind": "blank", "delta": 1 }`)
  - `delta` accepte `1`, `-1`
- `POST /api/config` - renomme les listes et met a jour les inscrits (`{ "names": ["Liste A", "Liste B"], "registeredVoters": 1200 }`)
- `POST /api/set-totals` - saisie manuelle des totaux fusionnes (`{ "listVotes": [100, 90], "blankVotes": 5, "nullVotes": 2 }`)
- `POST /api/reset` - remet les compteurs a zero
- `POST /api/undo` - annule la derniere action de la table (`{ "tableId": "table-1" }`)

## Partage lecture seule / saisie

- Recommande: configure un compte admin via `ADMIN_USERNAME` et `ADMIN_PASSWORD`.
- Option legacy: si aucun compte admin n'est defini, tu peux utiliser `WRITE_PIN`.
- Optionnel: `ADMIN_SESSION_TTL_SEC` (duree de session, defaut `43200` = 12h).
- Optionnel: `ADMIN_SESSION_SECRET` (secret de signature des sessions).
- Les colistiers arrivent par defaut en mode lecteur.
- Le mode admin (saisie) s'active depuis le bouton **Menu admin**.
- Avec compte admin, le mode admin demande identifiant + mot de passe.
- Avec PIN (legacy), le mode admin demande un code.
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
