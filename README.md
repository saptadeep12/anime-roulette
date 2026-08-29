# AI Anime Prompt Roulette

Small MVP webapp for hosting a live anime prompt guessing game with around 100 members.

## Stack

- Node.js built-in HTTP server
- Vanilla HTML, CSS, and JavaScript
- JSON file persistence in `data/store.json`

## Features

- Players join with a display name
- Host opens a round with a prompt, optional image URL, and hidden answers
- Each player gets 3 guesses
- Auto scoring:
  - 1 point for a correct character
  - 1 bonus point if the anime is also correct
- Live leaderboard via polling
- Round archive
- One-click reset for rehearsal or a fresh game

## Run

```bash
npm start
```

Then open `http://localhost:3000`.

## Host access

The default admin code is `host123`.

You can override it:

```bash
ADMIN_CODE=my-secret-code npm start
```

## Deploy to Vercel

Vercel functions do not retain files between requests, so the deployed app stores game state in Upstash Redis instead of `data/store.json`.

1. Push this folder to a GitHub repository, then import that repository in Vercel.
2. In the Vercel project, open **Storage** and add the **Upstash Redis** integration. This injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` into the project automatically.
3. In **Settings > Environment Variables**, add `ADMIN_CODE` with a strong host-only code.
4. Deploy. Vercel serves the frontend from `public/` and the game API from `api/[...path].js`.

For local development, do not set the `KV_REST_API_*` variables. The app will keep using `data/store.json`.

## Notes

- This is an MVP optimized for fast delivery, simple hosting, and one shared game session.
- On Vercel, the Upstash Redis integration is required so all players see the same scores and rounds.
