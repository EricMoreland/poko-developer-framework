import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { calculatePoKoScore, analyzeTrend, getSurveyQuestions } from './pokoScoring.js';
import { classifyCognitiveWeight } from './codeGuardian.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const DATA_FILE           = path.join(__dirname, 'data', 'sanitized_telemetry_with_sensor_gap_analysis.json');
const EXTERNAL_FACTORS_FILE = path.join(__dirname, 'data', 'external_factors.json');

// ─── Telemetry helpers ────────────────────────────────────────────────────────

function readTelemetryData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch (err) {
    console.error('Error reading telemetry JSON file:', err);
    return [];
  }
}

function writeTelemetryData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error writing telemetry JSON file:', err);
    return false;
  }
}

// ─── External factors helpers ─────────────────────────────────────────────────

function readExternalFactors() {
  try {
    return JSON.parse(fs.readFileSync(EXTERNAL_FACTORS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function writeExternalFactors(data) {
  try {
    fs.writeFileSync(EXTERNAL_FACTORS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error writing external factors file:', err);
    return false;
  }
}

/**
 * Returns the most-recent external factors entry for a given ISO date string,
 * or null if none exists.
 */
function getExternalFactorsForDate(dateStr) {
  const all = readExternalFactors();
  // Search newest-first so the latest submission for a date wins
  return all.slice().reverse().find((e) => e.date === dateStr) || null;
}

// ─── REST API ENDPOINTS ───────────────────────────────────────────────────────

// 1. Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    system: 'Po-Ko Local Engine',
    recordsLoaded: readTelemetryData().length,
    timestamp: new Date().toISOString()
  });
});

// 2. GET Historical Biometric Telemetry
// Usage: GET /api/telemetry or GET /api/telemetry?limit=30
app.get('/api/telemetry', (req, res) => {
  const rawHistory = readTelemetryData();
  const limit = parseInt(req.query.limit, 10);

  // Reverse so index 0 = oldest, last index = most recent
  const history = [...rawHistory].reverse();

  const scoredHistory = history.map((dayData, index) => {

    let trendWarning = false;
    let trendDetails = {};

    if (index >= 2) {
      const last3Days = [
        history[index - 2],
        history[index - 1],
        history[index]
      ];
      const trendResult = analyzeTrend(last3Days);
      trendWarning = trendResult.impendingSicknessWarning;
      trendDetails = trendResult;
    }

    // Look up any stored external factors for this day
    const externalEntry = getExternalFactorsForDate(dayData.Date);
    const externalFactors = externalEntry ? externalEntry.factors : null;

    const scoringResult = calculatePoKoScore(
      { ...dayData, trendWarning },
      externalFactors
    );

    return {
      ...dayData,
      poko_score:              scoringResult.score,
      poko_risk_level:         scoringResult.riskLevel,
      poko_components:         scoringResult.components,
      poko_trend_boosted:      scoringResult.trendBoosted,
      poko_trend_details:      trendDetails,
      poko_external_factors:   scoringResult.externalFactorResult,
      poko_external_applied:   scoringResult.externalFactorsApplied,
    };
  });

  const resultToSend = scoredHistory.reverse();

  if (!isNaN(limit) && limit > 0) {
    return res.json(resultToSend.slice(0, limit));
  }

  res.json(resultToSend);
});

// 3. POST New Daily Biometric Entry (Manual / AI Log)
app.post('/api/telemetry', (req, res) => {
  const newEntry = req.body;
  if (!newEntry || !newEntry.Date) {
    return res.status(400).json({ error: 'Missing required telemetry fields (e.g., Date).' });
  }

  const history = readTelemetryData();

  if (newEntry.Bedtime_Decimal && newEntry.Wake_Time_Decimal && newEntry.Sleep_Duration_Minutes) {
    const bt = parseFloat(newEntry.Bedtime_Decimal);
    const wt = parseFloat(newEntry.Wake_Time_Decimal);
    const inBedHrs = bt > wt ? (24.0 - bt) + wt : wt - bt;
    const inBedMins = Math.round(inBedHrs * 60 * 10) / 10;
    const gapMins = Math.round((inBedMins - parseFloat(newEntry.Sleep_Duration_Minutes)) * 10) / 10;

    newEntry.Time_In_Bed_Minutes = inBedMins;
    newEntry.Unrecorded_Gaps_Minutes = gapMins;
    newEntry.Sensor_Gap_Flag = gapMins > 60.0;
  } else {
    newEntry.Time_In_Bed_Minutes = newEntry.Time_In_Bed_Minutes || null;
    newEntry.Unrecorded_Gaps_Minutes = newEntry.Unrecorded_Gaps_Minutes || null;
    newEntry.Sensor_Gap_Flag = newEntry.Sensor_Gap_Flag || false;
  }

  const nextDayNum = history.length + 1;
  newEntry.Day = newEntry.Day || `Day_${String(nextDayNum).padStart(2, '0')}`;

  history.unshift(newEntry);

  if (writeTelemetryData(history)) {
    res.status(201).json({
      message: 'Daily telemetry recorded successfully',
      entry: newEntry,
      totalRecords: history.length
    });
  } else {
    res.status(500).json({ error: 'Failed to write telemetry entry to disk.' });
  }
});

// 4. POST Cognitive Weight Classification (Code Guardian)
app.post('/api/guardian/classify', (req, res) => {
  const { taskDescription, filesChanged, isCompromised: isCompromisedPayload } = req.body;

  if (typeof taskDescription !== 'string' || taskDescription.trim() === '') {
    return res.status(400).json({ error: 'taskDescription is required and must be a non-empty string.' });
  }

  if (filesChanged === undefined || isNaN(Number(filesChanged))) {
    return res.status(400).json({ error: 'filesChanged is required and must be a number.' });
  }

  let isCompromised;

  if (typeof isCompromisedPayload === 'boolean') {
    isCompromised = isCompromisedPayload;
  } else {
    const history = readTelemetryData();
    const latestEntry = history[0];

    if (latestEntry) {
      const todayDate = latestEntry.Date;
      const externalEntry = getExternalFactorsForDate(todayDate);
      const externalFactors = externalEntry ? externalEntry.factors : null;
      const { score, riskLevel } = calculatePoKoScore(latestEntry, externalFactors);
      isCompromised = score >= 8 || riskLevel === 'HIGH' || riskLevel === 'CRITICAL';
    } else {
      isCompromised = false;
    }
  }

  const result = classifyCognitiveWeight(
    taskDescription,
    Number(filesChanged),
    isCompromised
  );

  res.json({ ...result, isCompromised });
});

// ─── Survey Endpoints ─────────────────────────────────────────────────────────

/**
 * 5. GET Smart Survey Questions
 * Returns 0–2 intelligently selected micro-survey questions based on today's
 * most recent biometric telemetry entry.
 *
 * Response:
 *   { date: string, questions: Array<{ id: string, question: string }>, alreadyAnswered: boolean }
 */
app.get('/api/survey/questions', (req, res) => {
  const history = readTelemetryData();
  const latestEntry = history[0]; // newest-first storage

  if (!latestEntry) {
    return res.json({ date: null, questions: [], alreadyAnswered: false });
  }

  const todayDate = latestEntry.Date;
  const existing = getExternalFactorsForDate(todayDate);

  if (existing) {
    // Survey already answered for today — return empty set so the UI won't prompt again
    return res.json({ date: todayDate, questions: [], alreadyAnswered: true });
  }

  const questions = getSurveyQuestions(latestEntry);
  res.json({ date: todayDate, questions, alreadyAnswered: false });
});

/**
 * 6. POST Survey Answers (submit external factors)
 * Payload: { date: string, factors: { [factorId]: boolean } }
 *
 * Saves the answers keyed to the date so they are fused into the Po-Ko score
 * whenever that date's telemetry is queried.
 */
app.post('/api/survey/submit', (req, res) => {
  const { date, factors } = req.body;

  if (!date || typeof date !== 'string') {
    return res.status(400).json({ error: 'date is required (ISO string, e.g. "2026-09-24").' });
  }

  if (!factors || typeof factors !== 'object' || Array.isArray(factors)) {
    return res.status(400).json({ error: 'factors must be an object of boolean values.' });
  }

  // Validate: all values must be booleans
  for (const [key, val] of Object.entries(factors)) {
    if (typeof val !== 'boolean') {
      return res.status(400).json({ error: `Factor "${key}" must be a boolean.` });
    }
  }

  const all = readExternalFactors();

  const entry = {
    date,
    factors,
    submittedAt: new Date().toISOString(),
  };

  // Append — newest entry for a date wins in getExternalFactorsForDate
  all.push(entry);

  if (!writeExternalFactors(all)) {
    return res.status(500).json({ error: 'Failed to persist survey data.' });
  }

  // Return the updated Po-Ko score incorporating the new factors
  const history = readTelemetryData();
  const dayData = history.find((d) => d.Date === date);

  let updatedScore = null;
  if (dayData) {
    const scoringResult = calculatePoKoScore(dayData, factors);
    updatedScore = {
      score:              scoringResult.score,
      riskLevel:          scoringResult.riskLevel,
      externalFactors:    scoringResult.externalFactorResult,
    };
  }

  res.status(201).json({
    message: 'Survey answers saved successfully.',
    entry,
    updatedScore,
  });
});

/**
 * 7. GET External Factor History
 * Returns all persisted external factor entries, newest first.
 * Optional query param: ?date=YYYY-MM-DD to filter to a specific day.
 */
app.get('/api/survey/history', (req, res) => {
  const { date } = req.query;
  let all = readExternalFactors().slice().reverse(); // newest first

  if (date) {
    all = all.filter((e) => e.date === date);
  }

  res.json(all);
});

app.listen(PORT, () => {
  console.log(`Po-Ko Express Engine listening on http://localhost:${PORT}`);
});
