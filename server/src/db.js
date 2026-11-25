import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { bestAltitude, normalizeProfile, toSaveData } from '../../shared/logic.js'
import { DEFAULT_STAGE } from '../../shared/stages/index.js'

/**
 * Persistence, behind one small async API with two backends:
 *
 * - MongoDB when MONGODB_URI is set: Bloxity Legion gives every game (and channel) its
 *   own managed database, shared by all of the game's pods.
 * - Otherwise one SQLite file through Node's built-in driver, for local development.
 *
 * Profiles are stored whole as JSON (logic.toSaveData: Sky Docks progress mirrored at
 * the top level for older readers), with the leaderboard numbers copied alongside so
 * the boards are plain indexed queries. Best splits go to their own table/collection,
 * one row per player, map (`stage`) and checkpoint; rows from before maps existed are
 * Sky Docks ones (migrated on open).
 *
 * Saves are owned. Loading a profile claims it for the session that loaded it
 * (`owner`), and a save from any other owner is dropped: when a player refreshes, or
 * is moved to another pod, the session they left can never write stale progress over
 * the one they're playing in now.
 *
 * A guest save copied into an account (`carriedTo`) is marked so it is copied once only,
 * and drops off the in-game boards (the account has it now).
 *
 * (Boxity Gems purchases used to be recorded here too, in `gem_grants`. Gems are gone;
 * an existing `gem_grants` table or collection is simply left alone.)
 */

const DB_PATH = process.env.DB_PATH || fileURLToPath(new URL('../data/up-we-drive.db', import.meta.url))

/** Board id -> the leaderboard field copied alongside each profile (Mongo). */
const BOARDS = { altitude: 'bestAltitude', coins: 'totalCoins', finishes: 'finishes', playtime: 'playtimeMinutes' }

/** The numbers the boards sort by, copied out of the profile on every save. */
const leaderboardFields = (profile) => ({
  name: profile.name,
  // The highest climb on any map.
  bestAltitude: Math.floor(bestAltitude(profile)),
  totalCoins: profile.stats.totalCoins,
  finishes: profile.stats.finishes,
  playtimeMinutes: Math.floor(profile.stats.playtime / 60),
  updatedAt: profile.lastSeen,
})

/** Your best split per map and checkpoint, as `[stage, checkpoint, ms]` (for the checkpoint boards). */
const splitEntries = (profile) =>
  Object.entries(profile.maps || {}).flatMap(([stage, progress]) =>
    Object.entries(progress?.splits || {})
      .map(([cp, ms]) => [stage, Number(cp), Math.round(ms)])
      .filter(([, cp, ms]) => Number.isInteger(cp) && cp > 0 && Number.isFinite(ms) && ms > 0),
  )

/** Mongo split doc id: Sky Docks keeps the pre-maps `<pid>:<cp>` (so old docs are updated, not duplicated). */
const splitId = (pid, stage, cp) => (stage === DEFAULT_STAGE ? `${pid}:${cp}` : `${pid}:${stage}:${cp}`)

/** A guest's saved profile (JSON), re-keyed as account `accountId`'s, under its name. */
function rehome(data, accountId, name) {
  let raw = null
  try {
    raw = JSON.parse(data)
  } catch {
    // A corrupt guest save carries nothing; the account starts fresh.
  }
  const profile = normalizeProfile(raw, accountId, name)
  profile.lastSeen = Date.now()
  return profile
}

async function openMongo(uri) {
  const { MongoClient } = await import('mongodb')
  const client = new MongoClient(uri, { maxPoolSize: 10 })
  await client.connect()
  // The database named in the URI: the one Legion scoped to this game.
  const db = client.db()
  const profiles = db.collection('profiles')
  const splits = db.collection('splits')
  /** Copies a profile's best splits into the splits collection (one doc per map and checkpoint). */
  const writeSplits = async (profile) => {
    const entries = splitEntries(profile)
    if (!entries.length) return
    await splits.bulkWrite(
      entries.map(([stage, cp, ms]) => ({
        updateOne: { filter: { _id: splitId(profile.id, stage, cp) }, update: { $set: { pid: profile.id, stage, cp, ms, name: profile.name } }, upsert: true },
      })),
      { ordered: false },
    )
  }
  // Splits from before maps existed are Sky Docks times.
  await splits.updateMany({ stage: { $exists: false } }, { $set: { stage: DEFAULT_STAGE } })
  await Promise.all([
    splits.createIndex({ stage: 1, cp: 1, ms: 1 }),
    splits.createIndex({ pid: 1 }),
    ...Object.values(BOARDS).map((field) => profiles.createIndex({ [field]: -1 })),
  ])

  return {
    async load(id, owner) {
      const doc = await profiles.findOneAndUpdate({ _id: id }, { $set: { owner } }, { returnDocument: 'after' })
      return doc ? doc.data : null
    },
    async save(profile, owner) {
      try {
        // Matches only while `owner` still owns it; if someone else took it over the
        // upsert collides on _id instead of overwriting their progress.
        await profiles.updateOne(
          { _id: profile.id, owner },
          { $set: { owner, data: JSON.stringify(toSaveData(profile)), ...leaderboardFields(profile) } },
          { upsert: true },
        )
        await writeSplits(profile)
        return true
      } catch (err) {
        if (err?.code === 11000) return false
        throw err
      }
    },
    async topSplits(limit, stage, count) {
      const out = {}
      for (let cp = 1; cp <= count; cp += 1) {
        const docs = await splits.find({ stage, cp }, { projection: { name: 1, ms: 1 } }).sort({ ms: 1 }).limit(limit).toArray()
        out[cp] = docs.map((d) => ({ name: d.name, ms: d.ms }))
      }
      return out
    },
    async top(limit) {
      const out = {}
      for (const [board, field] of Object.entries(BOARDS)) {
        const docs = await profiles
          .find({ carriedTo: null }, { projection: { name: 1, [field]: 1 } })
          .sort({ [field]: -1 })
          .limit(limit)
          .toArray()
        out[board] = docs.map((d) => ({ name: d.name, score: d[field] ?? 0 }))
      }
      return out
    },
    async carry(accountId, guestId, name) {
      if (await profiles.findOne({ _id: accountId }, { projection: { _id: 1 } })) return false
      // Claim the guest save first: whatever happens next, it can't be copied twice.
      const guest = await profiles.findOneAndUpdate(
        { _id: guestId, carriedTo: null },
        { $set: { carriedTo: accountId, carriedAt: Date.now() } },
        { returnDocument: 'after' },
      )
      if (!guest) return false
      const profile = rehome(guest.data, accountId, name)
      try {
        await profiles.insertOne({ _id: accountId, owner: null, data: JSON.stringify(toSaveData(profile)), ...leaderboardFields(profile) })
        // The guest's times move with the save.
        await splits.deleteMany({ pid: guestId })
        await writeSplits(profile)
        return true
      } catch (err) {
        // The account got a save of its own meanwhile: leave the guest save unused.
        await profiles.updateOne({ _id: guestId, carriedTo: accountId }, { $unset: { carriedTo: '', carriedAt: '' } })
        if (err?.code === 11000) return false
        throw err
      }
    },
    close: () => client.close(),
  }
}

async function openSqlite(path) {
  const { DatabaseSync } = await import('node:sqlite')
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      data TEXT NOT NULL,
      best_altitude INTEGER NOT NULL DEFAULT 0,
      total_coins INTEGER NOT NULL DEFAULT 0,
      finishes INTEGER NOT NULL DEFAULT 0,
      playtime_minutes INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      carried_to TEXT
    );
    CREATE INDEX IF NOT EXISTS profiles_altitude ON profiles (best_altitude DESC);
    CREATE INDEX IF NOT EXISTS profiles_coins ON profiles (total_coins DESC);
    CREATE INDEX IF NOT EXISTS profiles_finishes ON profiles (finishes DESC);
    CREATE INDEX IF NOT EXISTS profiles_playtime ON profiles (playtime_minutes DESC);
  `)
  // Splits per map. A table from before maps (no `stage` column, keyed by player and
  // checkpoint) is rebuilt with every row as a Sky Docks time.
  const splitCols = db.prepare('PRAGMA table_info(splits)').all().map((c) => c.name)
  if (splitCols.length && !splitCols.includes('stage')) {
    db.exec(`
      BEGIN;
      ALTER TABLE splits RENAME TO splits_v1;
      DROP INDEX IF EXISTS splits_time;
      CREATE TABLE splits (pid TEXT NOT NULL, stage TEXT NOT NULL, cp INTEGER NOT NULL, ms INTEGER NOT NULL, name TEXT NOT NULL, PRIMARY KEY (pid, stage, cp));
      INSERT INTO splits (pid, stage, cp, ms, name) SELECT pid, '${DEFAULT_STAGE}', cp, ms, name FROM splits_v1;
      DROP TABLE splits_v1;
      COMMIT;
    `)
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS splits (
      pid TEXT NOT NULL,
      stage TEXT NOT NULL,
      cp INTEGER NOT NULL,
      ms INTEGER NOT NULL,
      name TEXT NOT NULL,
      PRIMARY KEY (pid, stage, cp)
    );
    CREATE INDEX IF NOT EXISTS splits_stage_time ON splits (stage, cp, ms);
  `)
  const upsertSplit = db.prepare(
    `INSERT INTO splits (pid, stage, cp, ms, name) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(pid, stage, cp) DO UPDATE SET ms = excluded.ms, name = excluded.name`,
  )
  const writeSplits = (profile) => {
    for (const [stage, cp, ms] of splitEntries(profile)) upsertSplit.run(profile.id, stage, cp, ms, profile.name)
  }
  const topSplit = db.prepare('SELECT name, ms FROM splits WHERE stage = ? AND cp = ? ORDER BY ms ASC LIMIT ?')
  /** Board id -> its column. */
  const columns = { altitude: 'best_altitude', coins: 'total_coins', finishes: 'finishes', playtime: 'playtime_minutes' }
  const insert = db.prepare(
    `INSERT INTO profiles (id, name, data, best_altitude, total_coins, finishes, playtime_minutes, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const upsert = db.prepare(
    `INSERT INTO profiles (id, name, data, best_altitude, total_coins, finishes, playtime_minutes, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, data = excluded.data, best_altitude = excluded.best_altitude,
       total_coins = excluded.total_coins, finishes = excluded.finishes,
       playtime_minutes = excluded.playtime_minutes, updated_at = excluded.updated_at`,
  )
  /** A profile as the column values of `insert` / `upsert`. */
  const row = (profile) => {
    const f = leaderboardFields(profile)
    return [profile.id, f.name, JSON.stringify(toSaveData(profile)), f.bestAltitude, f.totalCoins, f.finishes, f.playtimeMinutes, f.updatedAt]
  }

  // One process owns this file, so `owner` has nothing to guard against here.
  return {
    async load(id) {
      return db.prepare('SELECT data FROM profiles WHERE id = ?').get(id)?.data ?? null
    },
    async save(profile) {
      upsert.run(...row(profile))
      writeSplits(profile)
      return true
    },
    async topSplits(limit, stage, count) {
      const out = {}
      for (let cp = 1; cp <= count; cp += 1) out[cp] = topSplit.all(stage, cp, limit).map((r) => ({ name: r.name, ms: r.ms }))
      return out
    },
    async top(limit) {
      const out = {}
      for (const [board, column] of Object.entries(columns)) {
        out[board] = db
          .prepare(`SELECT name, ${column} AS value FROM profiles WHERE carried_to IS NULL ORDER BY ${column} DESC LIMIT ?`)
          .all(limit)
          .map((r) => ({ name: r.name, score: r.value }))
      }
      return out
    },
    async carry(accountId, guestId, name) {
      if (db.prepare('SELECT 1 FROM profiles WHERE id = ?').get(accountId)) return false
      const guest = db.prepare('SELECT data FROM profiles WHERE id = ? AND carried_to IS NULL').get(guestId)
      if (!guest) return false
      const profile = rehome(guest.data, accountId, name)
      // Synchronous, so nothing can come between the checks above and these two writes.
      db.prepare('UPDATE profiles SET carried_to = ? WHERE id = ?').run(accountId, guestId)
      insert.run(...row(profile))
      db.prepare('DELETE FROM splits WHERE pid = ?').run(guestId)
      writeSplits(profile)
      return true
    },
    close: async () => db.close(),
  }
}

let store = null

/** Opens the database: MongoDB if MONGODB_URI is set, else the local SQLite file. */
export async function openStorage({ mongoUri = process.env.MONGODB_URI, path = DB_PATH } = {}) {
  store = mongoUri ? await openMongo(mongoUri) : await openSqlite(path)
  console.log(`[db] using ${mongoUri ? 'MongoDB' : `SQLite at ${path}`}`)
}

export async function closeStorage() {
  await store?.close()
  store = null
}

/** Loads (or creates) the profile for `id`, normalised, and claims it for `owner`. */
export async function loadProfile(id, name, owner) {
  const data = await store.load(id, owner)
  let raw = null
  if (data) {
    try {
      raw = JSON.parse(data)
    } catch {
      console.warn(`[db] corrupt profile for ${id}, starting fresh`)
    }
  }
  return normalizeProfile(raw, id, name)
}

/**
 * Saves a profile if `owner` still owns it. Resolves false when it was dropped (owned
 * by a newer session) or failed; never throws, so a save can't break a leave.
 */
export async function saveProfile(profile, owner) {
  profile.lastSeen = Date.now()
  try {
    return await store.save(profile, owner)
  } catch (err) {
    console.error(`[db] save failed for ${profile.id}`, err)
    return false
  }
}

/**
 * Guest progress carry-over: when account `accountId` has no save yet, copies the
 * first of `guestIds` (the guest ids Boxity says this account played as) that has a
 * save not yet carried anywhere. The guest save is marked as carried, so it can never
 * be copied again. Resolves the guest id copied, or null.
 *
 * A guest's save is keyed by the id they played under; on Boxity hosting that is the
 * id with 'guest-' in front when it didn't start with it already (bloxityApi.js), so
 * both spellings are tried.
 */
export async function carryOverGuest(accountId, guestIds, name) {
  const candidates = [...new Set(guestIds.flatMap((id) => (id.startsWith('guest-') ? [id] : [id, `guest-${id}`])))]
  for (const guestId of candidates) {
    if (guestId === accountId) continue
    try {
      if (await store.carry(accountId, guestId, name)) return guestId
    } catch (err) {
      console.error(`[db] carrying ${guestId} into ${accountId} failed`, err)
      return null
    }
  }
  return null
}

/** Top `limit` players per board: `{ altitude: [{ name, score }], coins, finishes, playtime }`. */
export const topPlayers = (limit = 10) => store.top(limit)

/** Fastest `limit` best splits on map `stage` at each checkpoint 1..count: `{ [cp]: [{ name, ms }] }`. */
export const topSplits = (limit, stage, count) => store.topSplits(limit, stage, count)
