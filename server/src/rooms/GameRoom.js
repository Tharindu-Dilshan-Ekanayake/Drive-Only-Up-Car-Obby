import { Room, ServerError } from '@colyseus/core'

import { AD_REWARDS } from '../../../shared/balance.js'
import { lockedMessage, STAGE_LOCKED } from '../../../shared/chapters.js'
import { isStageUnlocked } from '../../../shared/logic.js'
import { BUMP_COOLDOWN_MS, clampBump, maxLiftFor, maxPushFor, respawnGhost, startRespawnGhost, TELEPORT_JUMP } from '../../../shared/bump.js'
import { SPAWN } from '../../../shared/lobby.js'
import { MISSILE_COOLDOWN_MS, MISSILE_HIT_WINDOW_MS, MISSILE_RANGE, MISSILE_SHOW_RANGE, MISSILE_SPEED, MISSILE_TARGET_COOLDOWN_MS } from '../../../shared/missile.js'
import { MAX_SLOTS, POSE_BYTES, ROOM_CAPACITY, writePose } from '../../../shared/poseCodec.js'
import { inSafeZone, pvpEnabled } from '../../../shared/safeZones.js'
import { PlayerSession } from '../../../shared/session.js'
import { DEFAULT_STAGE, getStage, isStageId, validStageId } from '../../../shared/stages/index.js'
import { resolveIdentity, verifyAdReward } from '../bloxityApi.js'
import { reportLeaver } from '../bloxityLeaderboards.js'
import { carryOverGuest, loadProfile, saveProfile } from '../db.js'
import { getLeaderboards } from '../leaderboards.js'
import { acceptMove, BUMP_EXTRA_SPEED, BUMP_GRACE_MS, clampY, MAX_CAR_SPEED } from '../movement.js'
import { activePlayers, liveRooms, pendingSaves } from '../registry.js'
import { GameState, PlayerState } from './schema.js'

/** Players per room. Each needs a pose slot (6 bits in shared/poseCodec.js). */
export const MAX_CLIENTS = ROOM_CAPACITY
if (MAX_CLIENTS > MAX_SLOTS) throw new Error('MAX_CLIENTS exceeds the pose slots')
const RECONNECT_SECONDS = 20
const AUTOSAVE_MS = 30_000
/** State patches to clients, and session ticks (playtime, rate limits), per second. */
const PATCH_HZ = 15
const SIM_HZ = 10
/**
 * Pose relay ticks per second (relayPoses). Cars report at 10 Hz; relaying at 15 means
 * a report waits at most ~67 ms, and each one is still sent once per receiver.
 */
export const POSE_HZ = 15
/**
 * Interest management: cars nearer than POSE_NEAR metres to you are relayed every tick
 * they've moved; up to POSE_MID every POSE_MID_EVERY ticks (5 Hz); beyond that every
 * POSE_FAR_EVERY ticks (2.5 Hz). Far cars are drawn as simple proxies or culled anyway.
 */
export const POSE_NEAR = 70
export const POSE_MID = 180
export const POSE_MID_EVERY = 3
export const POSE_FAR_EVERY = 6
/** Close code used when the same player joins somewhere else (4000-4010 are Colyseus's own). */
const DUPLICATE_LOGIN = 4100
/** Names this server process in save ownership; Legion sets POD_NAME per pod. */
const POD = process.env.POD_NAME || `local-${process.pid}`

/**
 * 'bump' checks (handleBump). Two cars' last accepted poses at most BUMP_RANGE m apart
 * (each client sees the other ~0.1-0.3 s late, so a few car lengths of slack); the
 * closing speed a throw implies at most both cars' recent speeds plus
 * BUMP_SPEED_SLACK; one bump per pair per BUMP_COOLDOWN_MS; at most
 * BUMP_TARGET_PER_SEC bumps landing on one player per second (a pack can't juggle them).
 */
export const BUMP_RANGE = 15
export const BUMP_SPEED_SLACK = 8
export const BUMP_TARGET_PER_SEC = 3

/** Unambiguous characters for lobby codes people read out to each other. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const makeCode = (length = 5) =>
  Array.from({ length }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('')

const cleanName = (name) =>
  String(name || 'Player')
    .replace(/[^\p{L}\p{N} _.-]/gu, '')
    .trim()
    .slice(0, 20) || 'Player'

/**
 * One lobby on one map: up to MAX_CLIENTS (50) players sharing a world. All game rules
 * run in each player's PlayerSession; the room handles networking, position validation,
 * persistence and the small shared state other players render from.
 *
 * Maps: one room type ('game') with a `stage` option (a map id, shared/stages/index.js;
 * default Sky Docks), and the matchmaker filters on it (server.js `filterBy(['stage'])`),
 * so `joinOrCreate('game', { stage })` only ever lands in a room of that map. Private
 * rooms are created with the creator's map; joining one by its code puts you on its map
 * (the client follows `spawn.stage`). Movement, bumps and checkpoints are checked against
 * the room's stage. A locked chapter's room (the Grand Tour before Sky Docks is finished)
 * refuses the join (checkUnlocked).
 */
export class GameRoom extends Room {
  maxClients = MAX_CLIENTS
  autoDispose = true
  /** This room's map (set from the create options in onCreate). */
  stageId = DEFAULT_STAGE

  /** The room's built stage (the server loads every map at startup: loadAllStages). */
  get stage() {
    const stage = getStage(this.stageId)
    if (!stage) throw new Error(`Map ${this.stageId} is not loaded`)
    return stage
  }

  /**
   * sessionId -> { session, playerId, verified, owner, client, slot, pose, sent,
   *                lastPos, lastPosAt, kicked?, reconnection?, adPending? }
   * `owner` claims the player's save for this session (see db.js); `verified` says
   * Boxity vouched for the id (see bloxityApi.js). `pose` is the last accepted car
   * pose `{ x, y, z, qx, qy, qz, qw, b, seq }` and `sent[slot]` the pose seq of each
   * other car last relayed to this player (relayPoses).
   */
  members = new Map()
  /** members' values as an array, for the relay loop (rebuilt on join/leave). */
  memberList = []
  /** Bumped by every accepted pose report: a pose's identity in `sent`. */
  poseSeq = 0
  relayTick = 0
  /** Next pose slot to try: handed out round-robin, so a freed slot isn't reused at once. */
  nextSlot = 0
  /** One relay message, reused (the transport copies it on send). */
  poseBuffer = new Uint8Array(MAX_SLOTS * POSE_BYTES)
  poseView = new DataView(this.poseBuffer.buffer)

  onCreate(options = {}) {
    this.stageId = validStageId(options.stage)
    this.setState(new GameState())
    this.state.stage = this.stageId
    if (options.private) {
      // A short code friends can type instead of the long generated room id.
      this.roomId = makeCode()
      this.state.code = this.roomId
      this.state.isPrivate = true
      this.setPrivate(true)
    }
    this.setPatchRate(1000 / PATCH_HZ)
    this.setSimulationInterval((dt) => this.tick(dt / 1000), 1000 / SIM_HZ)
    // A real timer: the room clock only advances with the 10 Hz simulation tick.
    this.relay = setInterval(() => this.relayPoses(), 1000 / POSE_HZ)
    this.updateListing()
    liveRooms.add(this)

    // Everything the client can ask for goes through the player's session.
    this.onMessage('*', (client, type, payload) => {
      if (type === 'pos') return this.handlePosition(client, payload)
      if (type === 'look') return this.handleLook(client, payload)
      if (type === 'bump') return this.handleBump(client, payload)
      if (type === 'missile') return this.handleMissile(client, payload)
      if (type === 'missileHit') return this.handleMissileHit(client, payload)
      if (type === 'missileAck') return this.handleMissileAck(client, payload)
      // Boxity rewards: checked with Boxity by the server, never granted on the client's word.
      if (type === 'adReward') return this.handleAdReward(client, payload)
      const member = this.members.get(client.sessionId)
      if (!member) return
      member.session.handle(String(type), payload || {}, Date.now())
      this.syncPlayer(client.sessionId)
    })

    this.autosave = setInterval(() => this.saveAll(), AUTOSAVE_MS)
  }

  /**
   * Who is joining. Join options are `{ playerId, name, token, gameSlug }`, `token`
   * being the Boxity SDK's game token (null for guests). A token is verified with
   * Boxity and its account id becomes the save key; without one the player is a guest.
   * See resolveIdentity for the details. Throwing refuses the join.
   */
  async onAuth(_client, options) {
    // The matchmaker only offers rooms of the asked-for map; a stale room id can't
    // smuggle a client onto another map's room without it knowing (spawn.stage says).
    if (options?.stage !== undefined && !isStageId(options.stage)) throw new Error('Unknown map')
    const identity = await resolveIdentity(options)
    return { ...identity, name: cleanName(identity.name || options?.name) }
  }

  async onJoin(client, _options, auth) {
    const { playerId, name, verified = false, carriedFrom = [] } = client.auth || auth

    // Same account joining again (a refresh, a new tab, a reconnect the old session
    // hasn't noticed yet): the newest connection wins. The old one is saved and removed
    // at once, even when it's only a seat held open for a reconnect - otherwise a
    // frozen copy of the player would stand in the lobby until that ran out.
    const existing = activePlayers.get(playerId)
    // A locked chapter is refused before anything else happens (playing elsewhere, your
    // live profile there is the newest word on what you've unlocked).
    const live = existing?.room.members.get(existing.client.sessionId)?.session.profile
    if (live) this.checkUnlocked(live)
    if (existing) await existing.room.evict(existing.client, 'You joined from another window.')

    const now = Date.now()
    const owner = `${POD}:${client.sessionId}`
    // An account's first visit brings along what it played as a guest (once only).
    if (verified && carriedFrom.length) {
      const from = await carryOverGuest(playerId, carriedFrom, name)
      if (from) console.log(`[room] carried guest ${from} into ${playerId}`)
    }
    // Just left another room (a map change)? Its save lands first.
    await pendingSaves.get(playerId)
    const profile = await loadProfile(playerId, name, owner)
    this.checkUnlocked(profile)

    const slot = this.freeSlot()
    if (slot < 0) throw new Error('Room is full')

    const player = new PlayerState()
    // Spread out a little so cars joining together don't spawn inside each other.
    const spawn = { x: SPAWN.x + (Math.random() - 0.5) * 10, y: SPAWN.y + 1, z: SPAWN.z + (Math.random() - 0.5) * 6 }
    // `uid` lets clients match Boxity chat to players; only a verified id is shown.
    Object.assign(player, { name, uid: verified ? playerId : '', slot })
    this.state.players.set(client.sessionId, player)

    const pose = { ...spawn, qx: 0, qy: 0, qz: 0, qw: 1, b: false, seq: ++this.poseSeq }
    const session = new PlayerSession(profile, {
      now,
      emit: (type, payload) => client.send(type, payload),
      getPosition: () => pose,
      stage: this.stage,
    })

    this.members.set(client.sessionId, {
      session,
      playerId,
      verified,
      owner,
      client,
      slot,
      pose,
      sent: new Uint32Array(MAX_SLOTS),
      lastPos: { ...spawn },
      lastPosAt: now,
      /** Recent speed from accepted poses (m/s, peak-held), the cap on bumps it sends/takes. */
      speed: 0,
      /** sessionId -> when this player last bumped them (ms). */
      bumpAt: new Map(),
      /** A bump threw this car: its moves get BUMP_EXTRA_SPEED until then (ms). */
      bumpedUntil: 0,
      bumpWindowAt: 0,
      bumpCount: 0,
      /** Rocket Missile (handleMissile): when this player last fired, that shot, when they were last burned (ms). */
      missileAt: 0,
      missile: null,
      burnedAt: 0,
      burnFrom: null,
    })
    this.memberList = [...this.members.values()]
    activePlayers.set(playerId, { room: this, client })

    session.sendProfile()
    // `stage`: the map this room plays (a code or invite may lead to another one).
    client.send('spawn', { ...spawn, stage: this.stageId })
    client.send('leaderboards', getLeaderboards(this.stageId))
    this.syncPlayer(client.sessionId)
    this.updateListing()
  }

  /** Dropped without saying goodbye (mobile network blip): hold the seat. */
  async onDrop(client) {
    const member = this.members.get(client.sessionId)
    if (!member || member.kicked) return
    member.reconnection = this.allowReconnection(client, RECONNECT_SECONDS)
    try {
      await member.reconnection
    } catch {
      // Window expired, or the player came back as a new session (evict); onLeave
      // cleans up.
    } finally {
      member.reconnection = null
    }
  }

  onReconnect(client) {
    const member = this.members.get(client.sessionId)
    if (!member) return
    activePlayers.set(member.playerId, { room: this, client })
    member.client = client
    // It may have missed relays while away: send it every car again.
    member.sent.fill(0)
    member.session.emit = (type, payload) => client.send(type, payload)
    member.session.sendProfile()
  }

  async onLeave(client) {
    const member = this.members.get(client.sessionId)
    this.state.players.delete(client.sessionId)
    if (member) {
      this.members.delete(client.sessionId)
      this.memberList = [...this.members.values()]
      for (const m of this.memberList) m.bumpAt?.delete(client.sessionId)
      if (activePlayers.get(member.playerId)?.client === client) activePlayers.delete(member.playerId)
      if (!member.kicked) {
        if (member.verified) reportLeaver(member.playerId, member.session.profile)
        // Travelling to another map leaves this room and joins another at once: that
        // join waits for this save (pendingSaves) before loading the profile.
        const saving = saveProfile(member.session.profile, member.owner)
        pendingSaves.set(member.playerId, saving)
        await saving
        if (pendingSaves.get(member.playerId) === saving) pendingSaves.delete(member.playerId)
      }
    }
    this.updateListing()
  }

  /**
   * The pod is going away (a deploy, or scaling in): save everyone, then close with
   * SERVER_SHUTDOWN, which sends each client back through the matchmaker to a pod
   * that's staying.
   */
  async onBeforeShutdown() {
    await this.saveAll()
    super.onBeforeShutdown()
  }

  async onDispose() {
    clearInterval(this.autosave)
    clearInterval(this.relay)
    liveRooms.delete(this)
    await this.saveAll()
  }

  // --- Helpers -----------------------------------------------------------------------

  /**
   * Refuses the join (throws) if `profile` hasn't unlocked this room's map: the Grand
   * Tour opens once Sky Docks is finished (shared/logic.js isStageUnlocked). A
   * private-lobby code or invite to such a room is refused the same way. The client
   * gets a ServerError with code STAGE_LOCKED and a message to show (shared/chapters.js),
   * and goes back to a map it may play.
   */
  checkUnlocked(profile) {
    if (!isStageUnlocked(profile, this.stageId)) throw new ServerError(STAGE_LOCKED, lockedMessage(this.stageId))
  }

  /**
   * Saves and removes a player who has joined again elsewhere: gone from everyone's
   * view at once, and a seat held for their reconnect let go rather than left to run
   * out.
   */
  async evict(client, reason) {
    const member = this.members.get(client.sessionId)
    this.state.players.delete(client.sessionId)
    if (member && !member.kicked) {
      member.kicked = true
      await saveProfile(member.session.profile, member.owner)
      member.reconnection?.reject(new Error('replaced by a new session'))
    }
    try {
      client.send('kicked', { reason })
      client.leave(DUPLICATE_LOGIN)
    } catch {
      // Already disconnected (the held-seat case).
    }
  }

  saveAll() {
    return Promise.all([...this.members.values()].map((m) => (m.kicked ? null : saveProfile(m.session.profile, m.owner))))
  }

  /** A pose slot no member holds (round-robin from the last one given), or -1. */
  freeSlot() {
    for (let k = 0; k < MAX_SLOTS; k += 1) {
      const slot = (this.nextSlot + k) % MAX_SLOTS
      if (this.memberList.some((m) => m.slot === slot)) continue
      this.nextSlot = (slot + 1) % MAX_SLOTS
      return slot
    }
    return -1
  }

  updateListing() {
    this.setMetadata({
      players: this.clients.length,
      isPrivate: Boolean(this.state.isPrivate),
      stage: this.stageId,
      region: process.env.REGION || 'default',
    })
  }

  /** Copies the public bits of a profile into the synced state (only what changed). */
  syncPlayer(sessionId) {
    const member = this.members.get(sessionId)
    const player = this.state.players.get(sessionId)
    if (!member || !player) return
    const p = member.session.profile
    if (player.car !== p.car) player.car = p.car
    if (player.paint !== p.paint) player.paint = p.paint
    if (player.nitro !== p.nitro) player.nitro = p.nitro
    const cp = member.session.progress.checkpoint
    if (player.cp !== cp) player.cp = cp
  }

  /**
   * Position reports, ~10 Hz from each client: `{ x, y, z, qx, qy, qz, qw, b }`.
   * Accepted if a car could have made the move since the last accepted one, or it is a
   * respawn (movement.js); otherwise the client is snapped back. The car shown is the
   * one the profile has equipped, never one the message names.
   */
  handlePosition(client, msg) {
    const member = this.members.get(client.sessionId)
    const player = this.state.players.get(client.sessionId)
    if (!member || !player || !msg) return
    const x = Number(msg.x)
    const stage = this.stage
    const y = clampY(Number(msg.y), stage)
    const z = Number(msg.z)
    if (![x, y, z].every(Number.isFinite)) return

    const now = Date.now()
    const dt = Math.max(0.05, (now - member.lastPosAt) / 1000)
    const next = { x, y, z }
    // Thrown by a bump lately: it may be going faster than it could drive (bounded).
    const extra = now < (member.bumpedUntil || 0) ? BUMP_EXTRA_SPEED : 0
    if (!acceptMove(member.lastPos, next, dt, stage, extra)) {
      client.send('correct', { ...member.lastPos })
      return
    }
    const moved = Math.hypot(x - member.lastPos.x, y - member.lastPos.y, z - member.lastPos.z) / dt
    // Peak-held, so report jitter can't make a fast car look slow for a bump.
    member.speed = Math.min(MAX_CAR_SPEED, Math.max(moved, (member.speed || 0) * 0.6))
    // A respawn (a jump no car could drive): no bumps for a moment (shared/bump.js).
    member.protect ||= { pending: false, until: 0 }
    if (Math.hypot(x - member.lastPos.x, y - member.lastPos.y, z - member.lastPos.z) > TELEPORT_JUMP) startRespawnGhost(member.protect, now)
    if (member.protect.pending) respawnGhost(member.protect, inSafeZone(stage, x, y, z), now)
    member.lastPos = next
    member.lastPosAt = now
    const pose = member.pose
    pose.x = x
    pose.y = y
    pose.z = z
    const qx = Number(msg.qx)
    const qy = Number(msg.qy)
    const qz = Number(msg.qz)
    const qw = Number(msg.qw)
    const qLen = Math.hypot(qx, qy, qz, qw)
    if (Number.isFinite(qLen) && qLen > 0.5 && qLen < 1.5) {
      pose.qx = qx / qLen
      pose.qy = qy / qLen
      pose.qz = qz / qLen
      pose.qw = qw / qLen
    }
    pose.b = msg.b === true
    pose.seq = ++this.poseSeq
  }

  /**
   * Sends each player, as one binary 'P' message (shared/poseCodec.js), the cars that
   * have moved since it last heard of them - near ones every tick, far ones only every
   * few (POSE_NEAR / POSE_MID). Each pose goes to each player at most once, so a client
   * gets at most 10 Hz (the report rate) per car: 14 bytes x 49 cars x 10 Hz ~ 7 KB/s
   * with everyone close, much less when spread over the stage. O(n^2) distance checks,
   * ~2500 at 50 players.
   */
  relayPoses() {
    const tick = (this.relayTick = (this.relayTick + 1) % 0x40000000)
    const list = this.memberList
    const view = this.poseView
    const near2 = POSE_NEAR * POSE_NEAR
    const mid2 = POSE_MID * POSE_MID
    for (let i = 0; i < list.length; i += 1) {
      const to = list[i]
      if (to.kicked || to.reconnection) continue
      const at = to.pose
      let bytes = 0
      for (let j = 0; j < list.length; j += 1) {
        const from = list[j]
        const p = from.pose
        if (from === to || from.kicked || to.sent[from.slot] === p.seq) continue
        const dx = p.x - at.x
        const dy = p.y - at.y
        const dz = p.z - at.z
        const d2 = dx * dx + dy * dy + dz * dz
        if (d2 > near2) {
          const every = d2 > mid2 ? POSE_FAR_EVERY : POSE_MID_EVERY
          // Offset by slot, so far cars are spread over the ticks rather than bunched.
          if ((tick + from.slot) % every) continue
        }
        writePose(view, bytes, from.slot, p.b, p.x, p.y, p.z, p.qx, p.qy, p.qz, p.qw)
        bytes += POSE_BYTES
        to.sent[from.slot] = p.seq
      }
      if (bytes) to.client.sendBytes('P', this.poseBuffer.subarray(0, bytes))
    }
  }

  /**
   * 'bump' `{ to, x, y, z, v }`: this player's car rammed player `to`'s (sessionId) on
   * the road, and `(x, y, z)` is the throw for theirs (m/s, shared/bump.js). The
   * sender's numbers aren't trusted: both must be here, close by their last accepted
   * poses, neither in a safe zone (shared/safeZones.js), not too often (per pair and
   * per target); the throw is clamped to what the two cars' recent speeds could do,
   * and turned to point away from the sender. Then it goes to `to`'s client (which
   * applies it to its own car) as 'bump' `{ from, x, y, z }`, and `to`'s moves are
   * allowed to be faster for a moment (movement.js). Returns what happened (tests).
   * On a map with `pvp: false` (shared/safeZones.js pvpEnabled) every bump is refused.
   * @returns {'ok' | 'unknown' | 'nopvp' | 'rate' | 'far' | 'safe' | 'invalid'}
   */
  handleBump(client, msg, now = Date.now()) {
    const from = this.members.get(client.sessionId)
    const toId = String(msg?.to ?? '')
    const to = this.members.get(toId)
    if (!from || !to || from === to || from.kicked || to.kicked || to.reconnection) return 'unknown'
    // A map without player-vs-player bumps (Heat Run): everyone is a ghost to everyone.
    if (!pvpEnabled(this.stage)) return 'nopvp'
    from.bumpAt ||= new Map()
    if (now - (from.bumpAt.get(toId) ?? -Infinity) < BUMP_COOLDOWN_MS) return 'rate'
    const a = from.pose
    const b = to.pose
    const dx = b.x - a.x
    const dz = b.z - a.z
    if (Math.hypot(dx, b.y - a.y, dz) > BUMP_RANGE) return 'far'
    const stage = this.stage
    if (inSafeZone(stage, a.x, a.y, a.z) || inSafeZone(stage, b.x, b.y, b.z)) return 'safe'
    if (from.protect && respawnGhost(from.protect, false, now)) return 'protected'
    if (to.protect && respawnGhost(to.protect, false, now)) return 'protected'
    if (now - (to.bumpWindowAt || 0) >= 1000) {
      to.bumpWindowAt = now
      to.bumpCount = 0
    }
    if ((to.bumpCount || 0) >= BUMP_TARGET_PER_SEC) return 'rate'
    const imp = { x: msg.x, y: msg.y, z: msg.z }
    const closing = (from.speed || 0) + (to.speed || 0) + BUMP_SPEED_SLACK
    if (!clampBump(imp, maxPushFor(closing))) return 'invalid'
    imp.y = Math.min(imp.y, maxLiftFor(closing))
    // Away from the sender: a "bump" can't pull someone towards you.
    const h = Math.hypot(imp.x, imp.z)
    const d = Math.hypot(dx, dz)
    if (h > 0 && d > 0.5 && imp.x * dx + imp.z * dz < 0) {
      imp.x = (dx / d) * h
      imp.z = (dz / d) * h
    }
    from.bumpAt.set(toId, now)
    to.bumpCount = (to.bumpCount || 0) + 1
    to.bumpedUntil = now + BUMP_GRACE_MS
    const r2 = (v) => Math.round(v * 100) / 100
    to.client.send('bump', { from: client.sessionId, x: r2(imp.x), y: r2(imp.y), z: r2(imp.z) })
    return 'ok'
  }

  /**
   * 'missile' `{ to }`: this player fired a Rocket Missile (shared/missile.js), homing on
   * player `to` ('' for none). Refused on a map without player-vs-player, from a safe zone
   * or just after a respawn, and more than once per MISSILE_COOLDOWN_MS. Accepted, it is
   * remembered (the only shot a later 'missileHit' can claim) and the cars within
   * MISSILE_SHOW_RANGE are told ('shot' `{ from, to, you }`) so they can draw it. A target
   * that isn't here or is out of range is dropped: the missile just flies straight.
   * @returns {'ok' | 'unknown' | 'nopvp' | 'rate' | 'safe' | 'protected'}
   */
  handleMissile(client, msg, now = Date.now()) {
    const from = this.members.get(client.sessionId)
    if (!from || from.kicked || from.reconnection) return 'unknown'
    const stage = this.stage
    if (!pvpEnabled(stage)) return 'nopvp'
    if (now - (from.missileAt ?? -Infinity) < MISSILE_COOLDOWN_MS) return 'rate'
    const a = from.pose
    if (inSafeZone(stage, a.x, a.y, a.z)) return 'safe'
    if (from.protect && respawnGhost(from.protect, false, now)) return 'protected'
    from.missileAt = now
    const toId = String(msg?.to ?? '')
    const to = this.members.get(toId)
    const d = to ? Math.hypot(to.pose.x - a.x, to.pose.y - a.y, to.pose.z - a.z) : Infinity
    const target = to && to !== from && !to.kicked && !to.reconnection && d <= MISSILE_RANGE ? toId : ''
    from.missile = { to: target, at: now, d: target ? d : 0, used: false }
    for (const m of this.memberList) {
      if (m === from || m.kicked || m.reconnection) continue
      if (Math.hypot(m.pose.x - a.x, m.pose.y - a.y, m.pose.z - a.z) > MISSILE_SHOW_RANGE) continue
      m.client.send('shot', { from: client.sessionId, to: target, you: target === m.client.sessionId })
    }
    return 'ok'
  }

  /**
   * 'missileHit' `{ to }`: this player's missile reached player `to`. Counted only for
   * the shot 'missile' recorded (that target, once, within MISSILE_HIT_WINDOW_MS and not
   * sooner than the flight could take), with the two cars within MISSILE_RANGE by their
   * last poses, neither in a safe zone or protected after a respawn, and the target not
   * burned lately (MISSILE_TARGET_COOLDOWN_MS). Then 'burn' `{ from }` goes to the victim,
   * whose own client applies it (a Bubble Shield blocks it: 'missileAck') and its moves
   * may be faster for a moment (it is thrown, then respawned).
   * @returns {'ok' | 'unknown' | 'nopvp' | 'noshot' | 'early' | 'far' | 'safe' | 'protected' | 'rate'}
   */
  handleMissileHit(client, msg, now = Date.now()) {
    const from = this.members.get(client.sessionId)
    const toId = String(msg?.to ?? '')
    const to = this.members.get(toId)
    if (!from || !to || from === to || from.kicked || to.kicked || to.reconnection) return 'unknown'
    const stage = this.stage
    if (!pvpEnabled(stage)) return 'nopvp'
    const shot = from.missile
    if (!shot || shot.used || shot.to !== toId || now - shot.at > MISSILE_HIT_WINDOW_MS) return 'noshot'
    // One hit per shot, whatever follows.
    shot.used = true
    if (now - shot.at < (shot.d / MISSILE_SPEED) * 1000 * 0.6) return 'early'
    const a = from.pose
    const b = to.pose
    if (Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) > MISSILE_RANGE) return 'far'
    if (inSafeZone(stage, a.x, a.y, a.z) || inSafeZone(stage, b.x, b.y, b.z)) return 'safe'
    if (from.protect && respawnGhost(from.protect, false, now)) return 'protected'
    if (to.protect && respawnGhost(to.protect, false, now)) return 'protected'
    if (now - (to.burnedAt ?? -Infinity) < MISSILE_TARGET_COOLDOWN_MS) return 'rate'
    to.burnedAt = now
    to.burnFrom = { id: client.sessionId, at: now, acked: false }
    to.bumpedUntil = now + BUMP_GRACE_MS
    to.client.send('burn', { from: client.sessionId })
    return 'ok'
  }

  /**
   * 'missileAck' `{ from, ok }`: the victim's client answers a 'burn' (`ok`: it is burning,
   * false: its Bubble Shield blocked it). Passed to the shooter as 'missileResult'
   * `{ to, ok }` (the "HIT!" / "BLOCKED" toast), once per burn.
   * @returns {'ok' | 'unknown' | 'noburn'}
   */
  handleMissileAck(client, msg, now = Date.now()) {
    const victim = this.members.get(client.sessionId)
    const fromId = String(msg?.from ?? '')
    const shooter = this.members.get(fromId)
    if (!victim || !shooter || shooter.kicked || shooter.reconnection) return 'unknown'
    const burn = victim.burnFrom
    if (!burn || burn.acked || burn.id !== fromId || now - burn.at > 4000) return 'noburn'
    burn.acked = true
    shooter.client.send('missileResult', { to: client.sessionId, ok: msg?.ok === true })
    return 'ok'
  }

  /**
   * 'adReward' `{ placement, rewardToken }`: the client watched a rewarded ad. Paid
   * only once Boxity confirms the token, and only within the placement's cooldown
   * (applyAdReward); one check at a time per player.
   */
  async handleAdReward(client, msg) {
    const member = this.members.get(client.sessionId)
    const placement = String(msg?.placement || '')
    const rewardToken = msg?.rewardToken
    if (!member || member.adPending || !AD_REWARDS[placement]) return
    if (typeof rewardToken !== 'string' || !rewardToken || rewardToken.length > 4096) return
    member.adPending = true
    try {
      if (!(await verifyAdReward(rewardToken))) return
      // Still here after the wait?
      if (this.members.get(client.sessionId) !== member || member.kicked) return
      member.session.grantAdReward(placement, Date.now())
      this.syncPlayer(client.sessionId)
    } finally {
      member.adPending = false
    }
  }

  /**
   * What a player's avatar wears, so everyone else can dress them the same. Purely
   * cosmetic, so trusted as sent, but kept to a small object of short strings and
   * plain numbers.
   */
  handleLook(client, msg) {
    const player = this.state.players.get(client.sessionId)
    if (!player || !msg || typeof msg !== 'object') return
    const clean = (obj, keep) => {
      const out = {}
      if (!obj || typeof obj !== 'object') return out
      for (const [key, value] of Object.entries(obj).slice(0, 24)) {
        if (key.length > 24) continue
        if (keep(value)) out[key] = value
      }
      return out
    }
    const look = JSON.stringify({
      equipped: clean(msg.equipped, (v) => (typeof v === 'string' && v.length <= 40) || (Number.isFinite(v) && Math.abs(v) < 1e12)),
      // Boxity's ranges: legOffsetX -0.7 to 5, armLength from 0.05, the rest within 0.3 to 2.6.
      proportions: clean(msg.proportions, (v) => Number.isFinite(v) && v >= -1 && v <= 6),
    })
    if (look.length <= 2048 && look !== player.look) player.look = look
  }

  tick(dt) {
    const now = Date.now()
    for (const [sessionId, member] of this.members) {
      member.session.tick(dt, now)
      this.syncPlayer(sessionId)
    }
  }
}
