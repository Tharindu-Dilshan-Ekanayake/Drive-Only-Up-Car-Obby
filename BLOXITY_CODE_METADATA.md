---
canDie: false
hasScore: true
---

# Drive Only Up Car Obby (Up We Drive): Boxity integration

A car obby: drive up long roads through checkpoints, dodging hammers, drones, sliding
containers, rolling buoys and more. Three maps: Sky Docks (30 checkpoints; finishing it opens
the next chapter), the Grand Tour (neon city, snow, tropics and canyon in one long road) and
Heat Run (a police chase). The player cannot die: falling or leaving the road respawns you at
your last checkpoint, and there is no game-over screen. Coins come from track coins,
checkpoints, the summit and tricks; they buy car spins (44 cars, Common to Mythic), paints
and item slots. Sky Pearls hidden on every road are a second, spendable currency.

Hosting: see docs/HOSTING.md (game id `drive-only-up-car-obby`).

## Leaderboards

Scores are reported by the **game server**, never by the client
(`server/src/bloxityLeaderboards.js`, `BLOXITY_LEADERBOARDS`). Every ~20 s and when a
player leaves, each pod sends the changed scores of its verified players to
`POST {api}/v1/leaderboards/hosted/{BLOXITY_GAME_ID}/report` as `legion_<userId>`.

| Board      | Label                | Score                                  | Format  |
|------------|----------------------|----------------------------------------|---------|
| `altitude` | Highest Altitude (m) | `floor(profile.best.altitude)`         | number  |
| `coins`    | Coins Collected      | `profile.stats.totalCoins`             | compact |
| `finishes` | Summits Reached      | `profile.stats.finishes`               | number  |
| `playtime` | Minutes Played       | `floor(profile.stats.playtime / 60)`   | number  |

All four are `order: desc`, `mode: best`, `reset: none`.

## Gems

The game no longer sells anything for Boxity Gems: the store's coin packs and item slot
cost Sky Pearls, paid in-game (`shared/balance.js` PRODUCTS, `kind: 'pearls'`). Don't
configure Gems products for this game on the platform. If one is configured anyway,
`POST /api/gems/webhook` still exists but only answers 410, so Boxity refunds the buyer.

## Rewarded ads

Placement `free-spin` gives one free car spin, at most once every 5 minutes. The client
sends `adReward { placement, rewardToken }`; the server verifies the token with
`POST {api}/v1/ads/reward/verify` before granting anything.

## Open Rooms

Each pod reports its rooms every 2 s to `POST {MATCHMAKER_REPORT_URL}/{BLOXITY_GAME_ID}/rooms`
(`server/src/legionRoomReporter.js`, installed after `listen()`), so they show under
"Open Rooms" on the game page. The client joins `?roomId=` at launch and falls back to
normal matchmaking if that room is gone or full.

## Server environment

| Variable                | Purpose                                                       |
|-------------------------|---------------------------------------------------------------|
| `BLOXITY_REPORT_TOKEN`  | Token for leaderboard and room reports (none set = no reports) |
| `MATCHMAKER_REPORT_URL` | Where the Open Rooms reporter posts (injected by Boxity hosting) |
| `BLOXITY_GAME_ID`       | Hosted game id for reports (default `drive-only-up-car-obby`)             |
| `MONGODB_URI`           | Shared database for profiles (SQLite without)                  |
| `BLOXITY_API_URL` etc.  | Platform URLs; production defaults (`server/src/bloxityEnv.js`) |
