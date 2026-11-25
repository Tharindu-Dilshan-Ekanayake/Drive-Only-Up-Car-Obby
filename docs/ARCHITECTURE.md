# Up We Drive: architecture

An original car obby: drive up a harbour of cranes and containers (the **Sky Docks**
theme) through checkpoints, dodging obstacles, collecting coins and spinning for cars.
Two maps - Sky Docks and the Grand Tour (Neon City, Snowy Mountain, Tropical Island and
Desert Canyon zones in one long map; see "Maps" below) - share one lobby, Pier Zero, linked by
a drive-in portal.
Built on the Bloxity R3F + Colyseus template.

## Layers

| Layer | Where | What |
|---|---|---|
| Shared data | `shared/track.js`, `shared/stages/*.js`, `shared/lobby.js`, `shared/cars.js` | Deterministic stage builder (boxes, path, checkpoints, coins, items, obstacles, triggers), the map registry (`shared/stages/index.js`), lobby layout, car catalog. No three.js; the server imports it. |
| Rules (authority) | `shared/balance.js`, `shared/logic.js`, `shared/session.js` | Profile, rewards, spins, validation. Runs in the Colyseus room and in the offline stand-in (`client/src/net/localServer.js`). |
| Server | `server/src` | Rooms, persistence, Bloxity auth, leaderboards. |
| Physics | `client/src/game/physics` | Custom arcade car physics: raycast suspension + sphere-vs-OBB contacts against a spatial hash of static boxes and kinematic obstacles. No physics library. |
| Rendering | `client/src/game/**` | Merged per-section track meshes, instanced scenery/coins/obstacles, procedural car models. |
| UI | `client/src/ui/**` | HUD (DOM, written by a rAF loop from `runtime`), panels, touch controls. |

## Contracts

### Profile (authority -> client, `'profile'` event)
```
{ id, name, version: 2, coins, pearlBank, cars: string[], car, slots (1-3), paints, paint, nitros, nitro,
  maps: { [stageId]: { checkpoint, best: { checkpoint, altitude, finishMs }, splits: { [cp]: ms }, pearls } },
  stats: { totalCoins, finishes, tricks, spins, falls, playtime },
  pity, settings: { music, sfx, ghost, sunset }, createdAt, lastSeen }
```
Sky Pearls are spendable as well as collectable: `pearlBank` (whole, >= 0) gains 1 whenever a pearl is
found for the first time (`logic.collectPearl`, next to its `PEARL_COINS`), and the Store spends it. A
save without the field (every older save, online or offline) starts with a bank equal to the pearls
already found on all maps (`normalizeProfile`); once it exists it is kept, and it is never allowed above
the pearls found, which bounds a tampered offline save.

Progress is per map (`maps[stageId]`, made on the first visit: `logic.progressFor(profile, stage)`;
read-only `progressOf(profile, id)`); coins, cars, cosmetics, slots, stats and settings are global.
No version bump: a save without `maps` (the pre-maps layout) has its top-level
`checkpoint / best / splits / pearls`, which are Sky Docks progress; `normalizeProfile` moves them
into `maps['sky-docks']` (merging with an existing entry, bests never lost). Every save written
(`logic.toSaveData`, db.js and the offline save) mirrors Sky Docks progress back at the top level,
so an older server or client still reads the right Sky Docks progress during a rolling deploy.

### Messages (client -> authority, `client/src/net/actions.js`)
| type | payload | rule |
|---|---|---|
| `checkpoint` | `{ index, splitMs }` | position within 30 m of that gate; `index <= checkpoint + 1`; pays `CHECKPOINT_COINS(index)` the first time this run |
| `coin` | `{ id }` | within 8 m of that coin; once per run; rate-limited |
| `trick` | `{ kind, score }` | coins = score / 100, capped per minute |
| `fell` | - | stats |
| `restart` | - | run back to checkpoint 0, coins re-collectable |
| `spin` | - | costs `SPIN_COST`, rarity by weight with pity |
| `equipCar` | `{ id }` | must own it |
| `unlockSlot` | - | `SLOT_COSTS[slots]` |
| `setting` | `{ key, value }` | `music` / `sfx` booleans |
| `purchase` | `{ productId }` | `PRODUCTS` entry; `kind: 'coins'` costs coins (Mega Spin), `kind: 'pearls'` costs pearls from `pearlBank` (coin packs, item slot); checked and charged in one step (`logic.buyProduct`) |
| `pos` | `{ x, y, z, qx, qy, qz, qw, car, b }` | room only; speed-checked (faster allowed for 2.5 s after a bump) |
| `bump` | `{ to, x, y, z, v }` | room only: our car rammed player `to`'s; see "Car-to-car" below |

### Events (authority -> client)
`profile {profile}`, `reward {coins, reason}`, `pearl {index, found, total, coins, complete, bank}`, `purchased {productId, name, pearls, coins, slots?}` (a pearl-priced product bought), `checkpoint {index, coins, splitMs, best, finish, totalMs?}`,
`spin {carId, rarity, isNew, refund}`, `error {text}`, `leaderboards {...}`, `bump {from, x, y, z}` (room only: another player's ram, already validated) (+ template plumbing events).

### Rooms and other players' cars
One room type, `game`, with a `stage` create/join option (a map id; default Sky Docks), and the
matchmaker filters on it (`defineRoom(GameRoom).filterBy(['stage'])` in server/src/server.js):
`joinOrCreate('game', { stage })` only lands in a room of that map, so players on different maps
are in different rooms (50 each). The room keeps `stageId`, puts it in its state (`stage`), listing
metadata and the `spawn` message, and checks moves (`movement.js limitsFor(stage)`: MAX_Y, respawn
points), bumps (safe zones) and checkpoints/coins/pearls (its sessions) against its own stage. The
server builds every map at startup (`loadAllStages`). Private rooms are created on the creator's map;
joining one by its code puts you on its map (the client follows `spawn.stage`). Leaving a room to
change maps saves first; the next room's join waits for that save (`registry.pendingSaves`).
Leaderboards: the global boards (altitude = best on any map, coins, finishes, playtime) go to every
room; the split boards are per map (`splits` rows keyed by player, stage and checkpoint; rows from
before maps migrate to Sky Docks on open) and each room gets its own map's (`leaderboards.stage`).

Up to 50 players per room (`ROOM_CAPACITY` in `shared/poseCodec.js`). The synced state carries only
who is there (`name, uid, slot, car, cp, look`); car poses go as one binary `P` message per client
per server tick (15 Hz, `GameRoom.relayPoses`): 14 bytes per car that moved (slot + boost, int24
position at 1/64 m, smallest-three quaternion), cars within 70 m every tick, to 180 m at 5 Hz,
beyond at 2.5 Hz. ~6 KB/s per client with 49 cars all close, ~1.7 KB/s spread over the stage.
Client side (`net/remotePlayers.js`, `game/remote/RemoteCars.jsx`): the nearest `fullCars`
(preset: 8 / 14 / 24) are real cars, the rest within view distance one instanced proxy draw,
names capped at the preset's `nameplates`; CPU racers give way one per other player.

### Car-to-car: safe zones and bumps
- **Safe zones** (`shared/safeZones.js`, `inSafeZone(stage, x, y, z)`): the lobby pier (`inLobby`) and
  every checkpoint plaza, sized from the checkpoint's own `length`/`width`/`yaw` (or `forward`), +2 m
  margin, 3 m below to 10 m above the deck. If either car is in one, cars pass through each other
  (the other car's collision body is `ghost`).
- **Bodies** (`game/physics/carBody.js`): other players' cars and CPU racers near you are car-sized
  dynamic OBBs turned with the car (`car: true`: not raycast by wheels). Remote ones: nearest 6 within
  25 m; bots: within 25 m.
- **Bumps** (`shared/bump.js`, `physics/car.js carContact`): closing speed >= 2.5 m/s, the car driving
  into the other harder is the rammer. The car hit gets `push = min(28, 2 + 0.8 * closing)` m/s away
  from the rammer (40 % towards the rammer's heading) and `lift = min(11, (closing - 6) * 0.4)` m/s up,
  times its own `knockScale` (weight); the rammer loses 35 % of the closing speed. One bump per pair per
  0.5 s. Each client only moves cars it simulates: a CPU racer is thrown locally (shoved across the road
  if the throw has no lift and < 9 m/s, else it flies and lands back on the road or respawns at its
  checkpoint); another player's car is drawn kicked at once and the throw goes to the room as `bump`.
  The room (`GameRoom.handleBump`) checks both are there, <= 15 m apart by their last accepted poses,
  neither in a safe zone, the pair's 0.5 s cooldown, <= 3 bumps/s landing on one player; clamps the throw
  to what both cars' recent speeds (+8 m/s) could do and turns it away from the sender; then forwards
  it to the target, whose client applies it to its own car (ignored with a Bubble Shield, 40 % with the
  Anchor, never in a safe zone; airtime from a bump scores no tricks). A player rammed by another only
  gets a <= 4 m/s nudge from the contact itself: the throw comes from the message (never twice).

### Runtime (`client/src/game/runtime.js`)
Per-frame mutable state: `runtime.car` (speedKmh, altitude, nitro, boosting, safe...), `runtime.input` (incl. `bump` from the network),
`runtime.race`, `runtime.racers`. Never put per-frame values in zustand.

### HUD (`client/src/ui/hud`)
DOM over the canvas; per-frame values are written by one shared rAF writer loop (`useLive.js`), never React state.
Layout (positions in `index.css`, sized by `--px` = one 1920x1080 reference pixel; `--bu` is the same floored on phones):
top left an empty gap for the host site's logo, coins + pearls, then the menu dock (2-wide grid, `MenuBar.jsx`);
top centre the compact timer plate (`CheckpointCard.jsx`, split card under it); top right the name tag (`NameTag.jsx`,
opens the garage), the altitude card and the altitude rail (`AltitudeRail.jsx`); bottom centre the nitro bar over the
item slots; bottom right the speedometer (`SpeedGauge.jsx`; on touch left of the BRAKE/GAS cluster).
Keys (`hotkeys.js`; hints hidden on touch): G garage, P spin, B store, K boards, M settings, L lobby (twice),
Q/E/F (or 1/2/3) items; driving keys (WASD/arrows, Shift nitro, Space, H horn, R respawn) in `game/player/keyboard.js`.

### Audio (`client/src/audio/sfx.js`)
`sfx.click/coin/checkpoint/finish/spinTick/spinWin(rarity)/buy/error/item/itemUse/boostPad/bounce/crash(0-1)/splash/trick/land/horn/respawn/countdown/nitroStart/nitroStop`,
obstacle cues `sfx.piston/bridge/shutter/forklift/hammer` (fired from `entry.cue` in `Stage.jsx`'s tick),
`engine.start()/set(speed01, throttle01, boosting)/stop()`, `skid.set(0-1)`, plus `installAudioUnlock`, `prepareAudio`, mute helpers.

### Car models (`client/src/game/cars/carModels.js`)
`getCarModel(carId, paintId?) -> { geometry, lodGeometry, wheels: { radius, width, positions: [[x,y,z] x4], front }, size: [w,h,l], exhausts: [[x,y,z]], electric, lights, rim }`
Local frame: faces -Z, origin at the wheel-centre height in the middle of the wheelbase.
`WHEEL_GEOMETRY` (~320 tris: tyre with sidewalls and shoulders, rim flange, dark barrel, brake
disc behind five concave spokes) is shared and unit-sized (radius 1, width 1), scaled per car;
`WHEEL_LOD_GEOMETRY` (~96 tris) and `CALIPER_GEOMETRY` (posed with the steer, never the spin).
`carIcons.js`: `getCarIcon(carId) -> dataURL | null`, `queueCarIcons()`, `useCarIcon(carId)` (full-detail bodies).

**The kit** (`cars/carKit.js`): the original chunky primitives (chamfered / tapered boxes,
cylinders, gems, fans and the `lamps`/`lens`/`grille`/`mirrors`/... helpers the Heat Run police
fleet uses) plus the sculpting tools: `shell(spec)` - a smooth lofted body (rounded-rectangle
cross-sections with tumblehome, tuck-under and a crowned / dished top swept through monotone
profile curves `top`/`bottom`/`width`, wheel-arch cut-outs, shut-line `grooves`, per-panel
`paint(q)` colours, offset / mirrored `cx`/`pair` shells for fenders and pods) with surface
queries (`xAt`, `topAt`, `frontZ`, `rearZ`); `decal(shell, face, ...)` - patches that follow a
shell (lamps, light bars, grilles, intakes, stripes, trims, handles); `extrude` (aerofoil wings,
splitters, fins), `lathe` (domes, tyres, exhaust tips), `sweep`/`tube` (roll cages, rails,
tentacles); and car-level helpers: `roadBody` (shell + dark wheel wells + `greenhouse` cabin:
glass, roof panel, A/B/C pillars), `lampPair`, `noseGrille`, `sideMirrors`, `rearWing`,
`tailpipes`, `roundLamp`, `plateOn`, `handles`, `archBand`, `roundel`, `torus`, `tyre`, `bar`.
`createKit(lo)` with `lo` builds the level-of-detail body from the same builder (coarser
shells, lathes and decals; `k.fine(fn)` details skipped).

38 cars (shared/cars.js; 9 common, 8 rare, 9 epic, 6 legendary, 6 mythic): the garage's
original 30 in `carBuilders.js` / `carBuilders2.js` / `carBuilders3.js`, the sports-car wave
(Squall Hatch, Thunderhead, Tidecutter, Spindrift, Meridian GT, Razorline, Aetherwing, Lumen -
original designs, no real makes, badges or names) in `sportsCars.js`. Spins pick a rarity by
weight, then a car uniformly within it, so more cars per rarity only spread the odds. Adding a
car: an entry in shared/cars.js (append - ids are saved; stats inside its rarity's range, the
server test checks the new wave) and a builder for its `kind`, ~2,000-3,500 body triangles
(LOD ~800-1,400), `head`/`tail`/`exhausts` in the same format (night lights, nitro flames;
`electric: true` and no exhausts for an EV), a declared `size` close to the body's bounding
box (physics spheres; collision box and remote-car proxy use the bbox), wheel arches higher
than the tyre (bonnet / fender top over each axle >= radius + ~0.15 m) and the physics roof
sphere under 2.6 m over the road (container gates): `scripts/check-cars.mjs` checks all of it.
Model build (full + LOD) ~7 ms warm, ~20 ms on a cold JIT, lazily on first use.

**Level of detail** (`cars/CarRig.js`): a rig draws `lodGeometry` past the quality preset's
`carLod` distance from the camera (LOW 18 m, MEDIUM 45 m, HIGH 60 m) or once the frame's
`carFull` full-detail cars are used up (LOW 2, MEDIUM 12, HIGH 30; your own car is always
full: `rig.lod = 'full'`). `wheelBatch` (one shared batch, three instanced draws for every car's
wheels) puts far wheels in the `WHEEL_LOD_GEOMETRY` mesh and gives near ones a brake calliper
(`push(matrix, rim, fixed?, low?)`: `fixed` = the wheel's matrix without its spin). The lobby's
parked cars use the LOD bodies and far wheels on LOW (7 of the 11); Heat Run traffic always.
Review models in the Car Lab (dev server, `/carlab.html`: `?id=`, `?ids=a,b&cols=4`, `?view=rear|side|top`
or `?yaw=&pitch=&dist=`, `?lod=1` for the LOD bodies and far wheels, `?steer=`).

## Performance

See the perf contract in `~/.claude/rules/performance.md`: quality presets in
`client/src/store/quality.js`, everything instanced/merged, no textures above 512 px
(the world uses vertex colours and procedural shaders), no GLBs; each map's stage data, the
stage world and each scenery module are lazy chunks, only the current map is built.

### No first-sight stalls, lobby first (`game/prep/*`, `game/StageWarmup.jsx`, `game/gpuWarm.js`, `ui/RasterWarmup.jsx`)

The first time anything is drawn the browser links its shader program, ANGLE builds the
program's draw-time vertex / pixel variants (on the GPU thread: the frame stalls with the main
thread idle) and buffers / textures upload; on a cold browser that was 50-400 ms per new thing.
Building a map's geometry costs 100-1300 ms per module on the main thread. So:
- **Loading screen = the lobby only** (time to playable): the pier's shaders (ShaderWarmup) and
  first frame, `LobbyWarmup` (the audio engine; what that frame drew counts as warm) and the
  start of the HUD's first raster (App mounts it 1% opaque above the screen once the pier is
  drawn and waits at most `HUD_SETTLE_MS`, 250 ms, for it) - then the screen goes.
- **The HUD draws flat** (`ui/hud/hudFlat.css`, `ui/flatFill.js` `FlatFill` context: StrokeText,
  TickNumber, ChunkyButton, menu faces, the gauge SVG): solid fills, hard offset / spread
  shadows and the hazard stripes - no smooth gradients, blurred shadows, filters or idle
  animations on first paint. Each distinct kind of paint is a GPU shader Chrome compiles the
  first time; the rich HUD cost ~2.3 s of GPU time on a cold browser (measured), the flat one
  ~0.5 s. Panels (store, garage...) keep their gradients - they open later. Keep new HUD
  styling to these kinds. Icons are also rasterised to bitmaps at start-up
  (`ui/icons.js prerasterIcons`; an icon asked for before it's ready is the SVG).
- **The map is prepared in the background** once the screen is gone (`playable`), while you drive round the pier, behind the shut
  Start gate (`startBarrier` + the `StartGateBar` boom), the timer plate saying
  "PREPARING TRACK n%" (`store.trackPrep`):
  1. `stageRuntime.loadCurrentStage`: the stage data is built in the prep worker
     (`prep/prepWorker.js`; `shared/stages setStageLoader` makes every `loadStage` use it -
     the offline server too) and arrives in slices; then `prep/prepClient.js prebuildMap` runs
     every heavy builder (track sections, track-side city, Neon / Snow zones, Heat Run's city)
     in the worker with the exact arguments the modules will use, and files the results
     (`prep/prebuilt.js`): each builder starts with `takePrebuilt(...)`. Then every car model,
     a few per frame. Then the stage is published.
  2. `StageWorld` (and the Grand Tour's zones) mount a part per frame (`<Stagger>`).
  3. `StageWarmup`: everything not warmed yet (the stage world, and the lobby's hidden effects)
     is kept on a layer the camera doesn't draw (`hideUnwarmed`) until `gradualWarm` gets to it:
     compileAsync a few objects per frame, wait for the programs, then each frame a batch of two
     objects drawn alone into the corner pixel.
  4. `stageWarm` is set: the gate opens (the boom lifts), "TRACK READY".
  Every Suspense under the stage world has `<WarmHold />` as its fallback (`warmHolds.add()`
  for anything else async). A scenery builder that isn't prebuilt still works - it just runs
  on the main thread (a long frame in the lobby): new heavy builders should start with
  `takePrebuilt` and get a job in `prepClient.mapJobs`.
- **Travel**: a short screen (old stage out, connection switched), then the new map's lobby;
  its track is prepared the same way. The exit portal is on the track, so it waits too.
- `splitSharedMaterials` (run by both warm-ups) gives a material shared by objects of different
  program variants (the world material on merged AND instanced meshes, the car paint on bodies
  and instanced wheels) a twin per variant (same patch, uniforms and program): three otherwise
  re-looks-up the program on every switch, every frame (~2.5 MB/s of garbage).
- Never change program variants at runtime: no lights added/removed (the night SpotLight stays
  at intensity 0 by day), no `material.needsUpdate`/define changes, and instanced meshes that
  will get colours create `instanceColor` up front.
- The HUD's pop-ups' first-use costs are Chrome's raster/compositor shaders: `RasterWarmup` draws
  samples of the animated pop-ups (coin flip and "+N", toasts, speed lines, nitro bar states,
  gauge ring, wallet) through a 4 px peephole above the loading screen. Avoid CSS filters on
  a parent of animated elements (`.hud-wallet` used to have one: a 350 ms freeze at the first coin).
- Measure with a cold profile: the puppeteer scripts record every frame > 33 ms with the GL calls,
  new programs / geometries and objects first drawn in it (renderer.info, `onBeforeRender`).
  Car portraits (each a GPU readback) are drawn only once `game/iconGate.js` is open - a few
  seconds after the track is ready, after compileAsync of the icon rig for its render target.

## Maps

**Registry** (`shared/stages/index.js`): `STAGES` lists one entry per map, each in its own
`shared/stages/<map>.meta.js`: `{ id, name, short, tagline, color, theme: { sky, track, scenery,
ground }, zones?, load }`. `loadStage(id)` (async, cached) imports the map's stage module - its own lazy
chunk in the client build - and builds it; then `getStage(id)` returns it synchronously.
`DEFAULT_STAGE` is `'sky-docks'` (`shared/stages/stage1.js`, `STAGE1` export kept). The other is the
**Grand Tour** (`grand-tour`, below), which replaced the four separate maps (Neon Night City and
the Snowy Mountain / Tropical Island / Desert Canyon placeholders). `normalizeProfile` keeps only
registered ids in `profile.maps`, so progress saved on a removed map is dropped on load.
`shared/stages/pieces.js` has the obstacle helpers (bollard fields, drone rows, wind zones,
sliding containers, crossings, laser gates).

**Client** (`client/src/game/stageRuntime.js`): the store holds `stageId` (the map you're on;
`?map=<id>` starts elsewhere) and `stage` (its built stage, null while loading). Non-React code
reads `currentStage()` (null = only the pier exists), components `useCurrentStage()`,
`useStageInfo()`, `useMapProgress()`. GameScene's `StageLoader` prepares the current map in the
background once the lobby is up (see "No first-sight stalls, lobby first"); `StageWorld` (lazy chunk, keyed by stage id) mounts the track (Stage), its best-time
boards, the CPU racers and the map's scenery (`world/scenery/index.js`, by `theme.scenery`).
`travelTo(id)` (the portal; `__pp.travel(id)` in debug): loading screen (App `TravelScreen`), run
reset (`restart` to the old map), old stage unmounted (it disposes its meshes, textures and physics
bodies), connection switched (online: leave and matchmake a room of the new map; offline:
`localServer.switchStage` moves the same PlayerSession with `session.setStage`), new stage loaded,
screen gone as soon as the new map's lobby is there; its track is prepared in the background.

**Lobby portals** (`shared/lobby.js PORTAL / PORTALS`, `portalAt`): two big drive-in gates standing in a
row with the Start gate across the pier's north end (x = -18.5 and 18.5, z = -33.5; pad 8 m deep along z x
8.4 m wide, arch 9 m high), both facing south into the lobby. Slot 0 (west) and slot 1 (east) lead to the
maps other than the current one, in registry order (`game/portals.js`; from Sky Docks: the Grand Tour and
Heat Run). Slot 0 leads to the first map other than the current one
(`game/portals.js`): the Grand Tour from Sky Docks, Sky Docks from the Grand Tour. Parked on the
pad, the ticker sets `store.pad = 'portal:<id>'` and PadPrompt asks "TRAVEL TO ...?" (Enter /
tap; for a map of zones it lists them in their colours). The arch is part of the merged pier
mesh, its board ("GRAND TOUR - PORTAL - DRIVE IN" / "SKY DOCKS ...") part of the lobby sign
atlas; the swirl and pad are one extra mesh (one draw call) whose shader blends the four zone
colours when the destination has `zones`. The Start sign names the current map.

**Chapters** (`shared/chapters.js`, registry `chapter` / `unlock` / `next` / `goal`): Sky Docks is
CHAPTER 1, the Grand Tour CHAPTER 2; Heat Run is a mode (no chapter, always open). The map name
reads "CHAPTER 1 · SKY DOCKS" on the timer plate (lobby state: chapter chip + map name), the name
tag, the travel prompt, the loading screen, the arrival toast and the Start sign (`chapterTitle`).
- **Lock rule** (`shared/logic.js isStageUnlocked(profile, id)`, pure): a map with
  `unlock: { finish: 'sky-docks' }` (the Grand Tour) is open once `profile.maps['sky-docks'].best.finishMs
  > 0` (also a finish of an older, shorter Sky Docks) or its id is in `profile.unlocks` (recorded for
  good by `reachCheckpoint` at the finish, which also returns `unlocked: [ids newly opened]` in the
  'checkpoint' event). Every other map is always open.
- **Enforcement**: `GameRoom.onJoin` -> `checkUnlocked` throws `ServerError(STAGE_LOCKED = 4403,
  lockedMessage)` (before evicting another window, using its live profile, else after loading the
  save) - public joins and private codes alike. Offline, `localServer` refuses `goTo` with a 'locked'
  event. The client (`stageRuntime.travelTo`) refuses locked travel with a toast; `stageRefused` shows
  the server's message and puts you on Sky Docks; `connection.js lockedJoin` retries a refusal 3 x
  1.5 s when our own (server-sent) profile says unlocked (a save still landing), else falls back.
- **Lobby portal**: `portals.js lockedPortalKey` -> Lobby rebuilds the sign ("GRAND TOUR · LOCKED")
  and the swirl geometry with a `locked` vertex attribute (`world/portalFx.js`: drained, dim, slow
  bars; same single mesh/draw call); PadPrompt shows "LOCKED" + how to unlock + "Sky Docks:
  Checkpoint n / 29", no travel.
- **Summit portal**: `addExitPortal(stage, meta.next)` (stage1.js) puts `stage.exitPortal` on the
  finish plaza's left side (where other plazas have the pit garage) facing the centre line, with two
  'portalPost' colliders; the arch is drawn into the finish section mesh (buildTrack.js
  `addExitPortal`), the board in the stage sign atlas, the swirl/pad by `track/ExitPortal.jsx` (one
  mesh, 4 tris, culled beyond 350 m). The ticker sets pad `'exit:<id>'`; stageRuntime travels as
  soon as the profile (server-confirmed) says unlocked. The finish card celebrates a first unlock
  (`finishResult.unlock`, read before the finish is reported) with "GO TO CHAPTER 2" / Enter
  (`travelWhenUnlocked`: waits up to 6 s for the server's confirmation).
- Debug: `?debug` -> `__pp.unlockAll()` opens every chapter in the OFFLINE save only (false online).

**Themes**: `theme.sky` picks a `SKY_THEMES` entry (`client/src/game/palette.js`: `golden` / `midday`
for Sky Docks via Settings > Golden hour; `night`, `snow`, `tropic`, `canyon` for the Grand Tour's
zones). `theme.track` overrides road colours (PALETTE keys `asphalt, asphaltLine, kerb, kerbLeft,
kerbGlow, steel, steelDark, plaza, hazardYellow, gateOrange`; `buildTrack.js applyTrackPalette`).
`theme.scenery` picks the scenery module; `theme.ground` is data (only the sea is drawn).

### Night lights (`world/nightLight.js`, `fx/carLights.js`, `fx/NightLights.jsx`)

Every `SKY_THEMES` entry has a `darkness` (0-1: night 1, Heat Run dusk 0.7, canyon sunset 0.35,
golden hour 0.15, midday / snow / tropic 0). The sky blend (Environment.jsx) blends it with the
colours and hands it to `nightLight.setDarkness` every frame, so lights fade with a zone
change and snap on spawn / teleport / travel. `night.lamps` = smoothstep(0.28 -> 0.62) of it.
- **Lamp faces**: `finishPaint` marks self-lit parts in the exact head / tail lamp colours as
  `PATTERN.HEADLAMP` / `TAILLAMP` (render/worldMaterial.js): lit like a lens by day, glowing
  brighter as the shared `uLamps` uniform comes up. Police light-bar lenses are
  `SIREN_RED` / `SIREN_BLUE`: they flash on the shader clock (`sirenOn(t, blue)` mirrors it).
- **Fake lights** (`carLights`): three instanced additive draws for everything - `beams` (a
  flattened cone in front of each car; MEDIUM/HIGH only), `pools` (light on the road: headlights,
  police strobes, the helicopter's spot, street lights), `glows` (camera-facing flares with a
  minimum on-screen size: head lamps, red tail lamps - brighter while braking, police strobes).
  Batched like the wheels: `carLights.begin()` in FrameStart, `CarRig.pose` pushes every rig
  (`rig.lights`, `rig.brake`, `rig.player`), Lobby pushes the parked cars, Heat Run its police
  and traffic. Nothing is pushed in daylight (brake glows excepted). Fogged out, culled past
  150 m (glows 320 m), no allocation per frame.
- **Real headlight**: on MEDIUM/HIGH, on a map whose skies get dark enough (`darkEnough`:
  the Grand Tour, Heat Run), ONE SpotLight (no shadows) follows your car at intensity
  `night.lamps x 38`. It stays in the scene at 0 by day (adding/removing a light recompiles
  every lit program); it only comes or goes with a travel or a preset change. None on LOW.

### Heat Run pursuit (`world/heat/policeSim.js`, `traffic.js`, `radio.js`, `ui/hud/HeatHud.jsx`)

- **Light bars**: flashing lenses (above), red / blue flares seen from far off, and after dark a
  coloured pool on the road beside each flash. The helicopter's searchlight: a cone (MEDIUM+)
  and a spot on the road that trails you (LOW: the spot only).
- **Sight / evade**: a unit sees you within 130 m unless the road bends > 0.6 rad between you or
  one of you is under a roof the other isn't (tunnels, the car park); always within 22 m. The
  helicopter loses you under any cover (tunnels, alleys, car park) and finds you again in the
  open within 42 m. Unseen for 4 + 1.25 x (level - 1) s: evaded (heat down a level, bounty);
  meanwhile units search at 72 % pace, no ramming, no gadgets.
- **AI**: moving obstacles (enabled kinematic bodies standing on the road, and traffic) are
  projected onto the path each frame; a unit steers to the nearer clear side or brakes short.
  From heat 3 with 3+ units on a road >= 12 m: a rolling block (the fastest unit overtakes and
  brakes 15 m ahead, 5 s, 12 s cooldown) and a box (two units on your flanks 3.1 m out, 6 s).
  Chasers take the inside of bends. PIT from heat 2 above 14 m/s: a unit 0.5-4.5 m behind your
  middle, 1.2-3.2 m to the side lines up for 0.75 s (HUD chip, radio), then taps you if still
  there (`car.applyHazard('pit', side)`: -18 % speed, a 4 rad/s yaw kick, loose grip 0.6 s);
  9 s between PITs, 14 s per unit. Boxed at speed fills BUSTED in 3.2 s (slow: 2 s / 1.3 s).
- **Roadblocks**: from heat 3 a 7.6 m gap with a 3 m spike strip across its inner side (4.6 m
  clear at the edge); once you're 6 m past (or slow within 14 m) its cars pull out and chase.
- **Traffic**: civilian cars (hatch / van / pickup, one instanced draw per model) on every
  stretch >= 17.5 m wide (Boulevard, Interchange, Harbour Run), same direction, 38-54 km/h,
  spawned past the fog's near edge; LOW 2, MEDIUM 4, HIGH 6. Units that hit one hard wreck.
- **Budget**: <= 30 enabled moving bodies at all times, counted live every frame; over it the
  farthest traffic, then roadblock cars, then pursuers lose their bodies.
- **Bounty** (points, 100 = 1 coin): 6/s x level in a seen pursuit; x level per close call (30),
  PIT dodged (60), takedown (80; a unit crashing into traffic 40), roadblock passed (100), evade
  (150), gadget dodged (15). Banked at each checkpoint plaza and the finish through the existing
  `trick` message (server caps: 5,000 points / message, 60 trick coins / minute), lost when BUSTED;
  the run's banked total is on the finish card.
- **HUD**: dispatch radio line, radar (units red, searching units blue, roadblock amber, heli
  ring, traffic white; red rim while seen), heat stars, bounty, BUSTED meter, EVADING countdown,
  chips (incl. PIT INCOMING!). **Sound**: the siren is Doppler-shifted by closing speed and
  muffled with distance; a radio chirp before each line; a tyre screech on a PIT.

### The Grand Tour (`shared/stages/grandTour.js`, `grandTour.meta.js`)

One map, four zones in driving order, climbing all the way (sea level -> 1,135 m at the finish):
**Neon City** (night) -> **Snowy Mountain** (early morning) -> **Tropical Island** (midday) ->
**Desert Canyon** (sunset, the finish). Max 31 roads (pearl bits); the plan is ~7 per zone.

- **Zones** (`GRAND_TOUR_ZONES` in the meta: `{ id, name, color, sky, scenery, track }`): every
  section of the stage has `section.zone`; `stage.zones` = `[{ id, from, to }]` section ranges
  (the zone-boundary checkpoint's plaza is the next zone's first section); `stage.decor[zone]` =
  the zone's set pieces (path-index ranges). Each zone's roads are one module,
  `shared/stages/grandTour/<zone>.js`, `export function <zone>Zone(b, cp, next)`: lay roads on the
  shared builder `b` (`cp()` names checkpoints), end with `b.checkpoint(cp(), next)` (the last
  zone: `b.finish(...)`), return the decor object. `grandTour.js` strings them together and stamps
  the zones. All four are built, 7 roads each (28 roads; the summit is section 28).
- **Sky** (`world/Environment.jsx`, "The sky in use"): one preallocated set of sky colours
  (`blend.cur`) is written each frame into the sky dome, sea, fog, clear colour, lights and car
  paint reflection; it eases (smoothstep, 3.5 s) towards the zone sky of the car's current
  section when that changes, and snaps on spawn, respawn/teleport (a > 40 m jump or
  `runtime.camera.snap`), travel or a settings change. No allocation or setState per frame.
- **Road colours**: `buildStageGeometry(stage, theme.track, info.zones)` paints each section with
  its zone's `track` palette (kerbs, lane lines, steel, plazas, gates).
- **Scenery** (`world/scenery/grandTour.jsx`): one lazy sub-module per zone
  (`world/scenery/grandTour/<zone>Zone.jsx`, props `{ stage, info, zone }`), each building only
  round its own sections (`world/zoneView.js zoneView(stage, id)`: the whole stage - so nothing is
  built through another zone's road - plus `zone` and `decor`), chunked, distance-culled,
  preset-aware, disposed on unmount. Neon: `world/neon/*` (city ground clipped short of the
  mountains, Sky Bridge pylons). Snow: `world/snow/snowGeometry.js` + `snowZone.jsx`. Tropic:
  `world/tropic/tropicGeometry.js` (+ `tropicWater.js`, the water/lava shader and the far volcano)
  + `tropicZone.jsx`. Canyon: `world/canyon/canyonGeometry.js` (terrain + set pieces) +
  `canyonProps.js` (looks, cacti, rocks) + `canyonZone.jsx`.
- **Ice**: road pieces with `{ kind: 'ice', style: 'ice' }` (snow.js `ICE`) are collider kind
  `ice`: `physics/world.js KIND_GRIP.ice = ICE_GRIP (0.3)`; in `car.js drive()` a ground grip
  under ~0.55 also cuts drive/braking (x0.75 on ice) and steering (x0.85). Drawn with
  `PATTERN.ICE`; packed-snow kickers use `style: 'snow'` (`PATTERN.SNOW`).
- **Sand**: road pieces with `{ kind: 'sand', style: 'sand' }` (tropic.js `SAND`) are collider kind
  `sand`: `KIND_GRIP.sand = SAND_GRIP (0.7)` - only lateral grip drops (drifts a little wide), drive,
  braking and steering stay full. Drawn sand-coloured with `PATTERN.SNOW`'s speckle.
- **Obstacle looks** (`look` on an obstacle spec, same physics): drawn by the stage's meshes
  (obstacleSim/propGeometry/Stage.jsx kind table): `buoys` + `heavy` + `look: 'snowball'`, `hammer` +
  `look: 'icicle' | 'log'` (timber gantry), `sweeper` + `look: 'plough'`. Later zones' looks are
  listed in `obstacleSim SEPARATE_LOOKS` (geometry: `propGeometry LOOK_KINDS`): the real sim leaves
  their parts out and the zone's scenery draws them from a draw-only copy of the sim on the same
  clock (`createObstacles(stage, new PhysicsWorld(), { looks: true })`, see tropicZone.jsx) - so a
  zone adds looks without touching Stage.jsx. Tropic: `buoys` + `look: 'coconut'` (light, `knock`,
  one-sided `lanes` - a `buoys` spec may give its own lane shares), `buoys` + `heavy` + `look:
  'boulder'`, `hammer` + `look: 'palmlog'` (bamboo gantry), `sweeper` + `look: 'crab'` (each crab
  patrols one half of the road, `lane`). Spike strips and bounce pads take a `look` too (track.js
  passes it to the trigger; buildTrack.js draws `spikes` + `'coral'`, `bounce` + `'spring'`).
  Canyon (geometry `world/canyon/canyonProps.js CANYON_LOOKS`, not LOOK_KINDS): `buoys` + `look:
  'tumbleweed'` (light), `buoys` + `heavy` + `look: 'sandstone'`, `hammer` + `look: 'bucket'` (ore
  bucket on a timber mine crane), `traffic` + `look: 'minecart'` (carts out of mine adits, rails
  drawn by the scenery); `spikes` + `'cactus'`, `bounce` + `'timber'`, `wind` + `'dust'` (buildTrack.js).
- **Terrain falls**: a scenery module that draws ground without colliders sets
  `world/groundHeight.js ground.at(x, z)`; PlayerCar counts sinking 1.5 m below it as a fall. The
  tropic zone's is the larger of its own (ground, or a lagoon's surface: driving into the water
  is a fall) and whatever was set before (the snow mountain's), re-wrapped each frame if another
  zone sets `ground.at` after it. A second re-wrapping zone would make the tropic drop the snow
  mountain from its chain, so the canyon adds its `heightAt` to `ground.layers` instead (deleted on
  unmount); PlayerCar falls against `groundUnder(x, z)`, the highest of `ground.at` and the layers.

**Snowy Mountain zone** (sections 7-13): Ski Village (first ice patch, snowploughs, snow ramp),
Pine Switchbacks (three hairpins, ice-spike strips, a 4.2 m ridge), Icicle Gorge (swinging
icicles between frozen waterfalls, an icy gorge floor), Frozen Lake (a 184 m ice crossing with
snowploughs), Avalanche Chute (giant snowballs down a steep chute), Ice Cave (barriered cave with
ice and spikes, two single-lane ridges), Summit Ridge (swinging logs, two snow kicker jumps, the
observatory plaza where the Tropical Island starts). Scenery: a capped heightfield mountain
(snow / rock by slope), instanced snow-capped pines (only those near the car), chalets of the
ski village and along the road, a cable car (pylons, cables, moving gondolas), frozen waterfalls,
the ice cave's arch (icicles, glowing crystals), the frozen lake, the summit observatory, and
snowfall points on MEDIUM/HIGH while in the zone.

**Tropical Island zone** (sections 14-20, ~4.9 km, 760 -> 911 m; narrow island roads: 9.5 m,
wide bits 10-12 m, single-lane 4.2 m): Lagoon Causeway (a causeway low over the first lagoon, a
boost, a sand bar, coconuts rolling down an island between sea walls, a boardwalk, a rope bridge),
Palm Hop (two palm-spring jumps over channels, a crab sandbar, a rope bridge), Reef Lighthouse
(coral spike strips, a 150 deg banked bend round the lighthouse islet, three crabs, the dock's
rope bridge), Waterfall Gap (swinging palm logs between sea walls, coral, a palm-spring jump
across the chasm beside the waterfall, landing in a gap of the cliff), Jungle Tunnel (a boardwalk
on the upper lagoon, the barriered vine tunnel with coconuts, a rope bridge), Shell Bay (boosts,
a loop between the valves of a giant clam shell, crabs, coral), Volcano Climb (two hairpins up the
volcano's flank, lava boulders down the leg between, a single-lane girder ridge, the shoulder
plaza where the Desert Canyon starts). Lagoons are per road (`decor.lagoons`, each `depth` m under
its road's lowest point: 756 / 763 / 767 / 804 m) - terraces with reef bars between; no lagoon
water is ever drawn over a road lower than it. Scenery: a capped heightfield (beaches, green hills,
rock, the volcano's ash and basalt), the water (one draw: depth-tinted lagoons with ripples and sun
glitter, the waterfall curtain, flowing lava streams low on the volcano), palms (instanced, near
the car) and jungle trees (MEDIUM+), beach huts / tiki bars with fictional names (one sign-atlas
draw), boardwalk rails and stilts, rope bridges, the seaplane dock and seaplane, the reef
lighthouse, the waterfall cliff, the vine tunnel, the clam shell, the crater glow and smoke, and
the volcano on the horizon (drawn inside the far plane, hazed, while the real cone is out of view).

**Desert Canyon zone** (sections 21-27 + the summit 28, ~4.9 km, 911 -> 1,135 m; the hardest zone;
narrow dusty roads: 9.2 m, wide bits 10-12 m, single-lane 4.2 m; golden-red sunset sky `canyon`,
`darkness` 0.35 so lamps fade on): Mesa Road (tumbleweeds, cactus caltrops on a cliff-edge ledge,
the first rock arch), Dry Riverbed (a sandy wash beside a sand stretch, sandstone boulders, a timber
trestle, the second arch), Ghost Town (main street of Buzzard Gulch - false-front saloons with
fictional names - tumbleweeds, a banked bend round the water tower, caltrops), Old Mine (two
mine-cart crossings on rails, ore buckets on mine cranes, the barriered timbered mine tunnel, a rail
trestle), Dust Storm (gusts from alternate sides on a ridge dropping away both sides, the fog closes
in, blowing dust on MEDIUM/HIGH, a single-lane ledge), Canyon Jump (caltrops, a boost, a timber
trampoline over Devil's Gorge, boulders under the third arch), Sunset Climb (three hairpins up the
tallest mesa, boulders, an ore bucket, caltrops, a single-lane ledge) and the finish plaza Sunset Mesa
under a great sandstone arch spanning the plaza, with flags in the four zones' colours. Set pieces are
`decor.canyon` ranges (arches, ledges, rivers, trestles, towns, mines, tunnels, storms, gorges, mesas,
finish). Scenery: a capped 16 m heightfield built only within 640 m of the zone's roads (terraced
sandstone walls banded like strata, a dusty floor, mesas and buttes further out, shaped by the set
pieces; kept under the Tropical Island's volcano; nothing near the finish higher than it), cacti
(instanced, near the car) and rocks (MEDIUM+), one sign-atlas draw. Measured: LOW <= 45 calls /
71k tris, HIGH <= 74 calls / 109k tris in the zone (every 40 m, both directions).

## Verification scripts

Every stage script takes `STAGE=<map id>` (default `sky-docks`), e.g.
`STAGE=grand-tour node scripts/check-track.mjs`.

| Command | What it checks |
|---|---|
| `node scripts/check-track.mjs` | Stage stats; road passing over itself without headroom, or through a glass tube; any other road through a checkpoint plaza or a round platform (footprints from `stageFootprints`), or two of those overlapping |
| `cd client && node --import ./scripts/node-loader.mjs scripts/check-holes.mjs` | Road-vs-collider check: rays down every metre across every drawn road (ribbon) report places with no solid floor (holes you'd fall through), floors at the wrong height, curb colliders inside the lane, and sharp slope kinks. Must report no NO FLOOR spots and no kinks outside the loops. Also checks every moving pontoon is a flush floor at rest, lists the intentional plank gaps under the path (none wider than a stride), and probes the round platforms' drawn surfaces (Stunt Bowl floor, quarter-pipe facets along their normals, deck ring; sweeper deck floor) for a collider at the right height. |
| `cd client && node --import ./scripts/node-loader.mjs scripts/check-zfight.mjs [--all]` | Z-fighting check: builds the stage, pier, harbour and track-city geometry and lists every pair of same-facing coplanar triangles (within 1.5 cm) that overlap with different colours/patterns. Must report 0 spots. `--all` also lists same-colour overlaps (invisible). |
| `cd client && node --import ./scripts/node-loader.mjs scripts/sim-drive.mjs <carId> [seconds]` | Headless playtest: an autopilot drives the real physics + obstacles through every checkpoint and reports falls per section (it lines up with container gates, takes girders steadily, and waits at the sweeper deck's edge until the arm will miss it). It times hammers, crane booms, laser gates and sliding containers like a player (holds back until its run past will miss them), rides buoy ramps steadily and allows for the car's own size with `MODEL=1`. Env: `SEED=n` (which cargo doors open), `TRACE=<section>` (per-frame log incl. nearby pipes/forklifts/drones/balls), `VERBOSE=1` (falls), `SKIP=1` (give up a road after 26 falls and carry on from the next checkpoint: a survey of every road) |
| `cd client && node --import ./scripts/node-loader.mjs scripts/count-bodies.mjs` | Worst-case moving physics bodies per section |
| `cd client && node --import ./scripts/node-loader.mjs scripts/check-cars.mjs` | Every car model: body and LOD triangles, wheel / far wheel budgets, attributes, glowing lamps, lights/exhausts listed (none on electric cars), body (and LOD) vs declared size, container-gate clearance (WARN). `MODEL=1` on sim-drive / loop-test tunes from the car's own model (as the game does) instead of default wheels and size |
| `cd server && npm test` | Authority rules (spins, checkpoints, coins, slots, position checks), map registry, per-map progress, v2 save migration, per-map split boards (`test/maps.test.js`) |
| `?debug` / `?perf` in the URL (dev) | `window.__pp` (incl. `__pp.teleport(n)`, `__pp.travel(mapId)`), `window.__ppPerf` renderer stats, r3f-perf overlay; `?map=<id>` starts on that map |

## Stage 1 layout and saves

29 roads (sections 0-28) plus the summit (section 29): ~16.9 km of path, climbing from y 2 to
~1,350 m (the builder's `stretch` option, 1.25 in Stage 1, makes every straight and bend - bar
`fixed` pads and deck run-ins - that much longer and higher at the same slopes; gaps, loops,
plazas and round decks keep their size). The last eight roads - Cargo Ladder (steep 24% rungs and hairpins), Wind Ridge,
Lighthouse Spiral (two turns, booms and drone pairs), Skyline Highway (boosts, a stunt run, two
trampoline jumps), Sway Bridge (swaying plank spans), Lantern Gauntlet (hammers and drones),
Storm Gate (three sweeper decks) and Summit Rush (loop, buoy climb, drone gate, boulevard) - were
added in front of the finish, so sections 0-20 and checkpoints 0-21 never changed number; only the
finish moved from checkpoint 21 to 29 (`LAST_CHECKPOINT` derives from the stage). Sky Pearls are one
bit per section (`1 << section`), so the section count must stay <= 31; 29 pearls use bits 0-28.
Server `MAX_Y` (highest path point + 150) and the pose codec (i24 at 1/64 m: +-131 km) follow the
stage data. Shape rules that keep the checks clean: a taper (not a width step) into any narrower
piece, a curve right after a flat piece rises <= ~5% (curves have no slope blend), approaches to a
round deck need a long flat run-in, and each road needs a 40+ m obstacle-free stretch for its
pearl and chest.

Road width: the builder's `widthScale` option (createTrackBuilder; default 1, as specified;
`b.setWidthScale(k)` from the next piece on, for one zone of a multi-zone map) lays every road
`scaledWidth(w, k)` wide: the default width and every explicit piece width - straights, bends,
tapers, hills, stunt runs, squeeze ends, pontoon bridges, gaps - and moves coin lines across the
road (`coins.lane` / `weave` / `arc`) in to match, but never touches single-lane widths
(<= `SINGLE_LANE`, 4.2 m), checkpoint plazas, the round decks (Stunt Bowl, sweeper deck), loops or
glass tubes. A piece with `rawWidth: true` keeps its widths as given; `rawWidth: 'start'` / `'end'`
keeps one end of a taper (a road meeting a loop, a tube or a deck run-in at its own width). Sky
Docks uses 0.78 (`WIDTH_SCALE` in stage1.js: 12 m -> 9.36, 16 -> 12.5, 14 -> 10.9, 11 -> 8.6,
9 -> 7); so do the Grand Tour's Neon City and Snowy Mountain zones (neon.js / snow.js set it and
restore it). Specs read at the old widths; obstacle helpers that lay things out across the road take
the width as built (`W(spec)`), lateral offsets `X(spec)`. Exceptions kept wider so the obstacles
stay fair: the cargo-door roads (16 m: three doors >= 4.2 m), the turntable's gap (12 m: its deck
bridges it), sweeper-deck run-ins and run-outs (the deck road's 12 m), Neon's three-lane laser
tunnel (15 m), the container / plough roads (10.9 m, so the widest car fits beside one passing the
middle) and the buoy / ballast / snowball ramps (9.36 m). Obstacle options for narrow roads:
`spread` on `buoys` (lanes pushed out towards the kerbs, the ball overhanging the edge), `lanes` on
`buoys` (the spec's own lane shares), `half` on `boom` (bar half length); stage1.js `droneRow` is a
single drone strafing the middle on roads under 9 m; adventure.js stands a stunt kicker against the
kerb on stunt runs under 16 m.

Piece options added with the extension: `spikes: [{ at, side, cover }]` (spike strips: a trigger
`spikes` with `lane`/`span`, always >= 4.5 m open; `physics/car.js` cuts the speed to 40%, kicks a spin and
loosens grip for ~1 s, no launch; drawn by `buildTrack.js addSpikes` into the section mesh), `chord` on a
`curve` (shorter slabs for tight banked hairpins), `coins: { arc }` (a racing line through a bend) and
`beacon: true` (a lighthouse in the middle of a spiral, `stage.beacons`). About two thirds of the roads
have a single-lane (4.2 m) stretch - open girder bridge, plank catwalk, grating ramp, container gate
(`slot`) or bollard gate (`bollardGate` in stage1.js) - so cars race for the gap and can shove each other there.

Track-side scenery: about one tower in five (nearly one in two within 90 m of a checkpoint plaza) is a
neon resort tower (`building()` option `resort`): cream facade, floor bands, white cornice, 1-3 glowing
rings (teal / gold / coral, pulsing on the middle one) a little proud of the facade, a rooftop sign painted
in the small `resort` banner atlas (render/banners.js `RESORT_ARTS`, one extra draw call), roof tank and AC
units and, on MEDIUM+ (`detail`), two palms. LOW keeps one ring, the sign and no palms.

## Stage 1 obstacles (`client/src/game/track/obstacleSim.js`)

Kinematic bodies driven by the clock (pure functions of time, pooled where they repeat):
bollard, sweeper, boom, buoys, post, lift, fan, piston, drawbridge, turntable, plus
- **hammer** (Hammer Alley, Container Shuffle, Crane Climb): a giant mallet on a gantry
  swinging across the road like a pendulum (box collider turning with it; `HAMMER`,
  `hammerAngle` in obstacleSim). Low and fast mid-swing, up out of the way at either end.
- **doors** (Cargo Doors): a gantry of three roller doors; one is open, re-rolled every time
  the player leaves the gantry behind (passed, fell, respawned). Within 17 m the open door's
  lamp turns green (the others red) and its shutter lifts; shut doors are a soft stop
  (knock 0). `update(t, lo, hi, viewer)` takes the player's position for this.
  `track/doorState.js` publishes the open lane so the CPU racers use it.
- **traffic** (Forklift Crossing, Crane Climb): forklifts (or `vehicle: 'truck'` cargo
  trucks, from longer sheds) shuttle across the road between two sheds, `interval` s apart. One that has knocked you waits while you're in its way.
- **pipes** (Pipe Run): pipes roll down a walled chute, each blocking one side; one that
  hits you hops over you instead of bulldozing you down the ramp.
- **drone** (Hammer Alley, Loop the Dock, Drone Yard, Crane Climb): sphere colliders
  strafing (mirrored pairs) or circling at bumper height.

- **buoys** with `heavy: true` (Ballast Run): giant iron ballast balls (r 2.4, `IRONBALL_R`)
  rolling down a steep narrow ramp, always on one side (`IRONBALL_LANES`), harder knock;
  the same pooled sim as the buoys. Their hazard band runs round them like a tyre tread.
- **spinbar** (Warm-up, from the builder's `spinner()`): the sweeper deck - one long arm
  (`reach` 14.1 m) with a short counterweight tail turning about a hub in the middle of a
  round platform, at bumper height (0.55-1.45 m: too low to drive under, a Spring Jump
  clears it). One box collider turning about the hub (`SPINBAR`, `spinbarAngle`); low
  knock, no fling (it shoves; the deck's low wall keeps you on). A single arm, not a full
  bar, so both sides of the hub can be passed by timing it.
- **slot** (Bollard Slalom, Ballast Run): a container gate - two container stacks either
  side of a 4.2 m single-lane gap (centred on the obstacle, which the builder already put
  `lane` off the centre line) and one across the top. Static colliders
  (`obstacleStaticBoxes`), drawn with the instanced containers.
- **pontoon** (Driftwood Crossing, from the builder's `pontoons()`): the loose planks of a
  floating plank bridge. Each is a kinematic deck box that gives while the viewer is on it
  - `mode: 'tilt'` rolls it towards `side`, `'sink'` dips its near end (far end a third as
  much) - and floats back after (`PONTOON` in obstacleSim; state `entry.load`, like the
  doors'). The fixed planks are ordinary road slabs with a ribbon each, so the 0.72 m gaps
  between planks are real. Moving planks are dark with amber side lights.

Track pieces with `tube` (Glass Flume): a half-pipe whose walls curve up to 75 deg
(`TUBE`, `tubePoint`, `tubeFacets` in shared/track.js), one collision slab per profile
facet (kinds `tube`, and `glass` for the closed faceted arch overhead); `tube: { from, to }`
flares the open ends. `buildTrack.js addTube` draws the walls, racing light strips, ribs
and portals into the section mesh and the glass panels into a separate see-through mesh
per section (`buildStageGeometry().glass`, shown with its section in Stage.jsx). Loops
(`ribbon.glow`) get pulsing light strips on their walls and a chevron panel down the middle.

Round platforms (`ARENA`, `SPINNER`, `roundPiece` in shared/track.js; `stage.rounds`):
the road runs straight across an n-gon floor (one rectangle per sector, kind `disc`);
the open sectors are the ones the road passes through. The **Stunt Bowl** (Warm-up, right
after the pier) adds a quarter-pipe rim (one slab per facet per sector, kind `bowl`) up to
an exactly upright top facet (80-100 deg: launches go straight up and come back down), a
deck ring, a low wall (`arenawall`), flat aprons where the road comes in and goes out, and
two kickers (`kicker`) either side of the road with star rings and the section's pearl over
the left one's flight. `buildTrack.js addRound` draws both (floors 5 cm under the road
ribbon that crosses them). Checkpoint plazas are 60 x 46 m (`PLAZA`; the finish 90 x 70);
each checkpoint stores its own `length` / `width`, which safe zones, boards and drawing read.

Single-lane spots (one car at a time): `squeeze(len, rise, { narrow: 4.2, open: true })`
girder bridges (Hammer Alley, Forklift Crossing; no curbs anywhere on them, girders drawn
underneath) and the container gates. Taper curbs follow the drawn edge line (no stair of
curb ends), and curbs stop short of the joint where a curbed piece meets an open-edged one.

The car physics has an "unperch" assist (`Car.unperch`): hung up on an edge with 1-2
wheels down, nearly still, while the driver presses gas or brake, it hops towards its
grounded wheels (or the driving direction when an axle hangs over a plank gap).

Hammers, drones and vehicles are **fling** bodies (`body.fling` = the road's right axis,
`physics/car.js` `onContact`): a hit throws the car sideways off the road, the way the
obstacle was moving across it (or away from it if it barely was), and up. Roads have
only the low curbs (the builder's `barrier` option for tall crash barriers is unused).
