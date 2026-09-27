/**
 * server/db.js — SQLite initialisation, migration, and typed query helpers
 * ─────────────────────────────────────────────────────────────────────────────
 * Uses better-sqlite3 (synchronous API) so all helpers below are sync-safe
 * and can be called directly inside Express route handlers.
 *
 * On first startup (empty telemetry table), existing JSON files are migrated
 * into SQLite. The JSON files are preserved as backups but are no longer the
 * live data store after migration.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const DB_PATH              = path.join(__dirname, 'data', 'poko.db');
const TELEMETRY_JSON       = path.join(__dirname, 'data', 'sanitized_telemetry_with_sensor_gap_analysis.json');
const EXTERNAL_FACTORS_JSON = path.join(__dirname, 'data', 'external_factors.json');
const SICK_DAYS_JSON        = path.join(__dirname, 'data', 'sick_days.json');

// ─── Open / initialise database ───────────────────────────────────────────────

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// ─── Schema ───────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS telemetry (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    Day                         TEXT,
    Date                        TEXT NOT NULL UNIQUE,
    Sleep_Score                 REAL,
    Sleep_RHR                   REAL,
    Body_Battery                REAL,
    Pulse_Ox                    REAL,
    Respiration                 REAL,
    Sleep_HRV_Status            REAL,
    Sleep_Quality               TEXT,
    Sleep_Duration_Minutes      REAL,
    Sleep_Need_Minutes          REAL,
    Bedtime_Decimal             REAL,
    Wake_Time_Decimal           REAL,
    Overnight_HRV_ms            REAL,
    "7d_Avg_HRV_ms"             REAL,
    Baseline_Low_ms             REAL,
    Baseline_High_ms            REAL,
    Resting_HR_bpm              REAL,
    High_HR_bpm                 REAL,
    Avg_Stress                  REAL,
    Stress_Rest_Minutes         REAL,
    Stress_Low_Minutes          REAL,
    Stress_Medium_Minutes       REAL,
    Stress_High_Minutes         REAL,
    Time_In_Bed_Minutes         REAL,
    Unrecorded_Gaps_Minutes     REAL,
    Sensor_Gap_Flag             INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS external_factors (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    date        TEXT NOT NULL,
    factors     TEXT NOT NULL,
    submittedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sick_days (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    date      TEXT NOT NULL UNIQUE,
    loggedAt  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS daily_advice (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    date          TEXT NOT NULL,
    slot          TEXT NOT NULL,
    text          TEXT NOT NULL,
    triggerMetric TEXT,
    triggerValue  TEXT,
    category      TEXT,
    createdAt     TEXT NOT NULL,
    UNIQUE(date, slot)
  );
`);

// ─── Migration — run once on first startup ────────────────────────────────────

function migrateIfNeeded() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM telemetry').get().n;
  if (count > 0) return; // Already migrated

  if (process.env.POKO_SEED_DEMO_DATA !== 'true') {
    console.log('[db] Empty database ready — demo seed migration is disabled.');
    return;
  }

  console.log('[db] Empty telemetry table — running one-time JSON → SQLite migration…');

  // --- Telemetry ---
  try {
    const rows = JSON.parse(fs.readFileSync(TELEMETRY_JSON, 'utf-8'));
    const insert = db.prepare(`
      INSERT OR IGNORE INTO telemetry (
        Day, Date, Sleep_Score, Sleep_RHR, Body_Battery, Pulse_Ox, Respiration,
        Sleep_HRV_Status, Sleep_Quality, Sleep_Duration_Minutes, Sleep_Need_Minutes,
        Bedtime_Decimal, Wake_Time_Decimal, Overnight_HRV_ms, "7d_Avg_HRV_ms",
        Baseline_Low_ms, Baseline_High_ms, Resting_HR_bpm, High_HR_bpm, Avg_Stress,
        Stress_Rest_Minutes, Stress_Low_Minutes, Stress_Medium_Minutes,
        Stress_High_Minutes, Time_In_Bed_Minutes, Unrecorded_Gaps_Minutes, Sensor_Gap_Flag
      ) VALUES (
        @Day, @Date, @Sleep_Score, @Sleep_RHR, @Body_Battery, @Pulse_Ox, @Respiration,
        @Sleep_HRV_Status, @Sleep_Quality, @Sleep_Duration_Minutes, @Sleep_Need_Minutes,
        @Bedtime_Decimal, @Wake_Time_Decimal, @Overnight_HRV_ms, @avg_hrv,
        @Baseline_Low_ms, @Baseline_High_ms, @Resting_HR_bpm, @High_HR_bpm, @Avg_Stress,
        @Stress_Rest_Minutes, @Stress_Low_Minutes, @Stress_Medium_Minutes,
        @Stress_High_Minutes, @Time_In_Bed_Minutes, @Unrecorded_Gaps_Minutes, @Sensor_Gap_Flag
      )
    `);
    const migrateMany = db.transaction((items) => {
      for (const r of items) {
        insert.run({
          ...r,
          avg_hrv: r['7d_Avg_HRV_ms'],
          Sensor_Gap_Flag: r.Sensor_Gap_Flag ? 1 : 0,
        });
      }
    });
    migrateMany(rows);
    console.log(`[db] Migrated ${rows.length} telemetry records.`);
  } catch (err) {
    console.error('[db] Telemetry migration failed:', err.message);
  }

  // --- External Factors ---
  try {
    const rows = JSON.parse(fs.readFileSync(EXTERNAL_FACTORS_JSON, 'utf-8'));
    const insert = db.prepare(
      'INSERT OR IGNORE INTO external_factors (date, factors, submittedAt) VALUES (@date, @factors, @submittedAt)'
    );
    const migrateMany = db.transaction((items) => {
      for (const r of items) {
        insert.run({ date: r.date, factors: JSON.stringify(r.factors), submittedAt: r.submittedAt });
      }
    });
    migrateMany(rows);
    console.log(`[db] Migrated ${rows.length} external factor entries.`);
  } catch {
    // file may be empty — not an error
  }

  // --- Sick Days ---
  try {
    const rows = JSON.parse(fs.readFileSync(SICK_DAYS_JSON, 'utf-8'));
    if (rows.length > 0) {
      const insert = db.prepare(
        'INSERT OR IGNORE INTO sick_days (date, loggedAt) VALUES (@date, @loggedAt)'
      );
      const migrateMany = db.transaction((items) => {
        for (const r of items) insert.run(r);
      });
      migrateMany(rows);
      console.log(`[db] Migrated ${rows.length} sick day entries.`);
    }
  } catch {
    // file may be empty — not an error
  }
}

migrateIfNeeded();

// ─── Telemetry helpers ────────────────────────────────────────────────────────

/**
 * Returns all telemetry rows ordered newest-first (mirrors original JSON storage order).
 * @returns {object[]}
 */
export function getTelemetry() {
  return db.prepare("SELECT * FROM telemetry ORDER BY Date DESC").all().map(hydrateTelemetry);
}

/**
 * Returns the N most-recent telemetry rows ordered oldest-first.
 * Useful for trend analysis windows.
 * @param {number} limit
 * @returns {object[]}
 */
export function getTelemetryChronological(limit = 30) {
  return db.prepare("SELECT * FROM telemetry ORDER BY Date DESC LIMIT ?").all(limit)
    .reverse()
    .map(hydrateTelemetry);
}

/**
 * Returns a single telemetry row by date string.
 * @param {string} date  YYYY-MM-DD
 * @returns {object|null}
 */
export function getTelemetryByDate(date) {
  const row = db.prepare("SELECT * FROM telemetry WHERE Date = ?").get(date);
  return row ? hydrateTelemetry(row) : null;
}

/**
 * Inserts or replaces a telemetry row.
 * @param {object} entry
 */
export function insertTelemetry(entry) {
  db.prepare(`
    INSERT OR REPLACE INTO telemetry (
      Day, Date, Sleep_Score, Sleep_RHR, Body_Battery, Pulse_Ox, Respiration,
      Sleep_HRV_Status, Sleep_Quality, Sleep_Duration_Minutes, Sleep_Need_Minutes,
      Bedtime_Decimal, Wake_Time_Decimal, Overnight_HRV_ms, "7d_Avg_HRV_ms",
      Baseline_Low_ms, Baseline_High_ms, Resting_HR_bpm, High_HR_bpm, Avg_Stress,
      Stress_Rest_Minutes, Stress_Low_Minutes, Stress_Medium_Minutes,
      Stress_High_Minutes, Time_In_Bed_Minutes, Unrecorded_Gaps_Minutes, Sensor_Gap_Flag
    ) VALUES (
      @Day, @Date, @Sleep_Score, @Sleep_RHR, @Body_Battery, @Pulse_Ox, @Respiration,
      @Sleep_HRV_Status, @Sleep_Quality, @Sleep_Duration_Minutes, @Sleep_Need_Minutes,
      @Bedtime_Decimal, @Wake_Time_Decimal, @Overnight_HRV_ms, @avg_hrv,
      @Baseline_Low_ms, @Baseline_High_ms, @Resting_HR_bpm, @High_HR_bpm, @Avg_Stress,
      @Stress_Rest_Minutes, @Stress_Low_Minutes, @Stress_Medium_Minutes,
      @Stress_High_Minutes, @Time_In_Bed_Minutes, @Unrecorded_Gaps_Minutes, @Sensor_Gap_Flag
    )
  `).run({
    Day:                     null,
    Date:                    null,
    Sleep_Score:             null,
    Sleep_RHR:               null,
    Body_Battery:            null,
    Pulse_Ox:                null,
    Respiration:             null,
    Sleep_HRV_Status:        null,
    Sleep_Quality:           null,
    Sleep_Duration_Minutes:  null,
    Sleep_Need_Minutes:      null,
    Bedtime_Decimal:         null,
    Wake_Time_Decimal:       null,
    Overnight_HRV_ms:        null,
    Baseline_Low_ms:         null,
    Baseline_High_ms:        null,
    Resting_HR_bpm:          null,
    High_HR_bpm:             null,
    Avg_Stress:              null,
    Stress_Rest_Minutes:     null,
    Stress_Low_Minutes:      null,
    Stress_Medium_Minutes:   null,
    Stress_High_Minutes:     null,
    Time_In_Bed_Minutes:     null,
    Unrecorded_Gaps_Minutes: null,
    Sensor_Gap_Flag:         0,
    ...entry,
    avg_hrv: entry['7d_Avg_HRV_ms'] ?? null,
    Sensor_Gap_Flag: entry.Sensor_Gap_Flag ? 1 : 0,
  });
}

/** Converts SQLite integer booleans and stringified fields back to JS types. */
function hydrateTelemetry(row) {
  return {
    ...row,
    '7d_Avg_HRV_ms': row['7d_Avg_HRV_ms'],
    Sensor_Gap_Flag: row.Sensor_Gap_Flag === 1,
  };
}

// ─── External Factors helpers ─────────────────────────────────────────────────

/**
 * Returns all external factor entries ordered newest-first.
 * @returns {object[]}
 */
export function getFactors() {
  return db.prepare("SELECT * FROM external_factors ORDER BY submittedAt DESC").all()
    .map((r) => ({ ...r, factors: JSON.parse(r.factors) }));
}

/**
 * Returns the most-recent external factors entry for a given date, or null.
 * @param {string} date  YYYY-MM-DD
 * @returns {object|null}
 */
export function getFactorsForDate(date) {
  const row = db.prepare(
    "SELECT * FROM external_factors WHERE date = ? ORDER BY submittedAt DESC LIMIT 1"
  ).get(date);
  return row ? { ...row, factors: JSON.parse(row.factors) } : null;
}

/**
 * Inserts a new external factors entry.
 * @param {string} date
 * @param {object} factors
 * @param {string} submittedAt  ISO timestamp
 */
export function insertFactor(date, factors, submittedAt) {
  db.prepare(
    "INSERT INTO external_factors (date, factors, submittedAt) VALUES (?, ?, ?)"
  ).run(date, JSON.stringify(factors), submittedAt);
}

// ─── Sick Days helpers ────────────────────────────────────────────────────────

/**
 * Returns all sick day entries.
 * @returns {object[]}
 */
export function getSickDays() {
  return db.prepare("SELECT * FROM sick_days ORDER BY date DESC").all();
}

/**
 * Returns true if the given date is logged as a sick day.
 * @param {string} date  YYYY-MM-DD
 * @returns {boolean}
 */
export function isSickDay(date) {
  return !!db.prepare("SELECT 1 FROM sick_days WHERE date = ?").get(date);
}

/**
 * Inserts a sick day entry. Returns false if already exists.
 * @param {string} date
 * @param {string} loggedAt  ISO timestamp
 * @returns {boolean}
 */
export function insertSickDay(date, loggedAt) {
  try {
    db.prepare("INSERT INTO sick_days (date, loggedAt) VALUES (?, ?)").run(date, loggedAt);
    return true;
  } catch {
    return false; // UNIQUE constraint — already exists
  }
}

/**
 * Removes a sick day entry. Returns false if it did not exist.
 * @param {string} date  YYYY-MM-DD
 * @returns {boolean}
 */
export function deleteSickDay(date) {
  const result = db.prepare("DELETE FROM sick_days WHERE date = ?").run(date);
  return result.changes > 0;
}

// ─── Daily Advice helpers ─────────────────────────────────────────────────────

/**
 * Returns all advice records for a given date.
 * @param {string} date  YYYY-MM-DD
 * @returns {object[]}
 */
export function getAdviceByDate(date) {
  return db.prepare("SELECT * FROM daily_advice WHERE date = ? ORDER BY slot").all(date);
}

/**
 * Inserts or replaces a daily advice record.
 * @param {object} entry  { date, slot, text, triggerMetric, triggerValue, category }
 */
export function insertAdvice(entry) {
  db.prepare(`
    INSERT OR REPLACE INTO daily_advice (date, slot, text, triggerMetric, triggerValue, category, createdAt)
    VALUES (@date, @slot, @text, @triggerMetric, @triggerValue, @category, @createdAt)
  `).run({
    ...entry,
    createdAt: new Date().toISOString(),
  });
}

export default db;
