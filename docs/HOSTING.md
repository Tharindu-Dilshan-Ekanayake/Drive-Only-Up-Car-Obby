# Hosting on Boxity Legion

Game id **`drive-only-up-car-obby`** (display name "Drive Only Up Car Obby"). Everything below is
already wired in this repo; this page is what to do once, and what runs where.

| What | Where |
|---|---|
| Backend, prod / dev (HTTP only: auth, API, webhooks) | `https://drive-only-up-car-obby.host.bloxity.io` / `https://drive-only-up-car-obby.dev.host.bloxity.io` |
| Frontend, prod / dev | `https://drive-only-up-car-obby.play.bloxity.io` / `https://drive-only-up-car-obby.dev.play.bloxity.io` |
| Multiplayer socket | never the backend URL: the client asks Legion's matchmaker (`play.bloxity.io`) for a pod through `Legion.SDK.net.resolveEndpoint(gameId)` and joins the endpoint it returns (client/src/net/connection.js, the `matchmaker` branch, chosen by `VITE_LEGION_GAME_ID`). |

## One-time setup

1. On Boxity's **My Games** the game `drive-only-up-car-obby` exists and shows a deploy token.
2. In this GitHub repo: **Settings -> Secrets and variables -> Actions -> New repository secret**
   - `LEGION_DEPLOY_TOKEN` = the token from My Games (production platform).
   - `LEGION_DEPLOY_TOKEN_STAGE` = the stage platform's token (optional; without it staging is skipped).
   - **Never commit the token** (not in a file, a workflow or a commit message). If it was pasted anywhere public, rotate it on My Games.
3. Push to `dev` (dev channel) or `main` (prod channel). `.github/workflows/deploy.yml` builds the server
   image, pushes it to `ghcr.io/<owner>/drive-only-up-car-obby-server:<platform>-<channel>-<sha>`, tells Legion to roll it
   out with `seatCap` 50, then builds the client (`VITE_LEGION_GAME_ID` / `VITE_GAME_SLUG` = the game id) and uploads it as
   the frontend.
4. After the first push, make the ghcr.io package **public** (repo -> Packages -> drive-only-up-car-obby-server ->
   Package settings -> Change visibility) so Legion can pull it.

## What the server image needs (all true today)

- Listens on `PORT` (Legion injects 2567); `GET /health` answers 200 at once (`server/src/server.js`).
- Runs as the non-root `node` user (`server/Dockerfile`, build from the repo root: `docker build -f server/Dockerfile .`).
  The image holds only `shared/` and `server/` (the rules shared with the client are plain ESM).
- `MONGODB_URI` (injected, an isolated database for this game+channel) is the profile store; without it a scratch SQLite
  file in `/tmp` is used (lost when the pod goes).
- `CLIENT_ORIGIN` (injected) is allowed by CORS. `BLOXITY_GAME_ID` / `BLOXITY_CHANNEL` / `POD_NAME` are read for reports.
- SIGTERM (a deploy or scale-in) runs Colyseus' graceful shutdown: each room saves and hands its players to another pod
  (`GameRoom.onBeforeShutdown`); the client resolves again and rejoins.
- Optional reports: set `BLOXITY_REPORT_TOKEN` on the platform for leaderboards and the Open Rooms list
  (`BLOXITY_CODE_METADATA.md`).

## Capacity

One pod is 1 vCPU / 512 MB. A room holds 50 players (`shared/poseCodec.js` `ROOM_CAPACITY`), so `seatCap` is 50. Checked
by running the image's file layout in production mode and joining 34 simulated players across Sky Docks and Heat Run, all
sending position reports for 20 s: about 95 MB of memory and a few percent of one core. Grand Tour refuses a fresh
profile (it opens after a Sky Docks finish), as in the game.

## Deploy notes

- A rolling deploy that overlaps an old and a new server: profiles saved by the old server drop the `pearlBank` field and
  the new one re-derives it from the pearls found (a small one-time refill of spent pearls). Prefer one rollout.
- Gems are not sold any more (the store takes Sky Pearls); `POST /api/gems/webhook` only answers 410. Don't configure Gems
  products for this game on the platform.
