import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { calculatePoKoScore, analyzeTrend, getSurveyQuestions } from './pokoScoring.js';
import { classifyCognitiveWeight } from './codeGuardian.js';
import {
  getTelemetry,
  getTelemetryByDate,
  insertTelemetry,
  getFactors,
  getFactorsForDate,
  insertFactor,
  getSickDays,
  isSickDay,
  insertSickDay,
  deleteSickDay,
  getAdviceByDate,
  insertAdvice,
} from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ─── REST API ENDPOINTS ───────────────────────────────────────────────────────

// 1. Health Check
app.get('/api/health', (req, res) => {
  const history = getTelemetry();
  res.json({
    status: 'ok',
    system: 'Po-Ko Local Engine',
    recordsLoaded: history.length,
    timestamp: new Date().toISOString(),
  });
});

// 2. GET Historical Biometric Telemetry
// Usage: GET /api/telemetry or GET /api/telemetry?limit=30
app.get('/api/telemetry', (req, res) => {
  const rawHistory = getTelemetry();   // newest-first
  const limit = parseInt(req.query.limit, 10);
  const sickDayDates = new Set(getSickDays().map((e) => e.date));

  // Flip to oldest-first for the sliding 3-day trend window (index-2, index-1, index)
  const history = [...rawHistory].reverse();

  const scoredHistory = history.map((dayData, index) => {
    let trendWarning = false;
    let trendDetails = {};

    if (index >= 2) {
      const last3Days = [history[index - 2], history[index - 1], history[index]];
      const trendResult = analyzeTrend(last3Days);
      trendWarning = trendResult.impendingSicknessWarning;
      trendDetails = trendResult;
    }

    const externalEntry  = getFactorsForDate(dayData.Date);
    const externalFactors = externalEntry ? externalEntry.factors : null;

    const scoringResult = calculatePoKoScore({ ...dayData, trendWarning }, externalFactors);

    return {
      ...dayData,
      sick_day:              sickDayDates.has(dayData.Date),
      poko_score:            scoringResult.score,
      poko_risk_level:       scoringResult.riskLevel,
      poko_components:       scoringResult.components,
      poko_trend_boosted:    scoringResult.trendBoosted,
      poko_trend_details:    trendDetails,
      poko_external_factors: scoringResult.externalFactorResult,
      poko_external_applied: scoringResult.externalFactorsApplied,
    };
  });

  // Re-reverse to newest-first before slicing
  const resultToSend = scoredHistory.reverse();

  if (!isNaN(limit) && limit > 0) {
    return res.json(resultToSend.slice(0, limit));
  }
  res.json(resultToSend);
});

// 3. POST New Daily Biometric Entry
app.post('/api/telemetry', (req, res) => {
  const newEntry = req.body;
  if (!newEntry || !newEntry.Date) {
    return res.status(400).json({ error: 'Missing required telemetry fields (e.g., Date).' });
  }

  // Duplicate guard
  if (getTelemetryByDate(newEntry.Date)) {
    return res.status(409).json({ error: `Telemetry already logged for ${newEntry.Date}.` });
  }

  if (newEntry.Bedtime_Decimal && newEntry.Wake_Time_Decimal) {
    const bt = parseFloat(newEntry.Bedtime_Decimal);
    const wt = parseFloat(newEntry.Wake_Time_Decimal);
    const inBedHrs  = bt > wt ? (24.0 - bt) + wt : wt - bt;
    const inBedMins = Math.round(inBedHrs * 60 * 10) / 10;

    newEntry.Time_In_Bed_Minutes = inBedMins;

    if (newEntry.Sleep_Duration_Minutes) {
      const gapMins = Math.round((inBedMins - parseFloat(newEntry.Sleep_Duration_Minutes)) * 10) / 10;
      newEntry.Unrecorded_Gaps_Minutes = gapMins;
      newEntry.Sensor_Gap_Flag         = gapMins > 60.0;
    } else {
      newEntry.Unrecorded_Gaps_Minutes = newEntry.Unrecorded_Gaps_Minutes ?? 0;
      newEntry.Sensor_Gap_Flag         = newEntry.Sensor_Gap_Flag ?? false;
    }
  } else {
    newEntry.Time_In_Bed_Minutes     = newEntry.Time_In_Bed_Minutes     || null;
    newEntry.Unrecorded_Gaps_Minutes = newEntry.Unrecorded_Gaps_Minutes || null;
    newEntry.Sensor_Gap_Flag         = newEntry.Sensor_Gap_Flag         || false;
  }

  const totalRecords = getTelemetry().length;
  newEntry.Day = newEntry.Day || `Day_${String(totalRecords + 1).padStart(2, '0')}`;

  insertTelemetry(newEntry);

  res.status(201).json({
    message: 'Daily telemetry recorded successfully',
    entry: newEntry,
    totalRecords: totalRecords + 1,
  });
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
    const history = getTelemetry();
    const latestEntry = history[0];
    if (latestEntry) {
      const externalEntry  = getFactorsForDate(latestEntry.Date);
      const externalFactors = externalEntry ? externalEntry.factors : null;
      const { score, riskLevel } = calculatePoKoScore(latestEntry, externalFactors);
      isCompromised = score >= 8 || riskLevel === 'HIGH' || riskLevel === 'CRITICAL';
    } else {
      isCompromised = false;
    }
  }

  const result = classifyCognitiveWeight(taskDescription, Number(filesChanged), isCompromised);
  res.json({ ...result, isCompromised });
});

// ─── Survey Endpoints ─────────────────────────────────────────────────────────

app.get('/api/survey/questions', (req, res) => {
  const history = getTelemetry();
  const latestEntry = history[0];

  if (!latestEntry) {
    return res.json({ date: null, questions: [], alreadyAnswered: false });
  }

  const todayDate = latestEntry.Date;
  const existing  = getFactorsForDate(todayDate);

  if (existing) {
    return res.json({ date: todayDate, questions: [], alreadyAnswered: true });
  }

  const questions = getSurveyQuestions(latestEntry);

  // Append a reason string to each question so the UI can explain why it was triggered.
  const m = latestEntry;
  const baseline   = m['7d_Avg_HRV_ms'] || 1;
  const hrvDrop    = ((baseline - m.Overnight_HRV_ms) / baseline);
  const hrvDropPct = Math.round(hrvDrop * 100);

  const REASONS = {
    exposedToSickPerson:   `Your HRV dropped ${hrvDropPct}% overnight — checking for external illness exposure.`,
    alcoholLastNight:      `Your HRV is ${hrvDropPct}% below your 7-day baseline — alcohol is a common cause of this level of suppression.`,
    poorDietToday:         `Your Sleep Score is ${m.Sleep_Score} and Body Battery is ${m.Body_Battery} — poor nutrition often compounds both.`,
    travelOrJetLag:        `Your Sleep Score is ${m.Sleep_Score} and HRV is ${hrvDropPct}% below baseline — circadian disruption from travel shows this pattern.`,
    physicallyOverexerted: `Your HRV is ${hrvDropPct}% below your 7-day baseline — heavy training is a common benign explanation.`,
    emotionallyDrained:    `Your average stress was ${m.Avg_Stress} yesterday — above the moderate threshold that signals psychological load.`,
    highWorkloadDeadline:  `Your average stress was ${m.Avg_Stress} — above the low threshold where deadline pressure becomes a factor.`,
    severeAllergiesToday:  m.Respiration > 16
      ? `Your overnight respiration rate was ${m.Respiration} breaths/min — elevated respiration is a common allergy signal.`
      : `Your Sleep Score is ${m.Sleep_Score} — poor sleep combined with low scores often accompanies allergy episodes.`,
    missedMealToday:       `Your Body Battery is ${m.Body_Battery} and stress was ${m.Avg_Stress} — this combination is often linked to missed meals.`,
    medicationSideEffects: `Multiple signals are simultaneously poor — HRV ${hrvDropPct}% below baseline, Sleep Score ${m.Sleep_Score}, Stress ${m.Avg_Stress}.`,
    highCaffeineToday:     `Your stress was ${m.Avg_Stress} and Sleep Score was ${m.Sleep_Score} — high caffeine can contribute to both.`,
  };

  const questionsWithReasons = questions.map((q) => ({
    ...q,
    reason: REASONS[q.id] ?? null,
  }));

  res.json({ date: todayDate, questions: questionsWithReasons, alreadyAnswered: false });
});

app.post('/api/survey/submit', (req, res) => {
  const { date, factors } = req.body;

  if (!date || typeof date !== 'string') {
    return res.status(400).json({ error: 'date is required (ISO string, e.g. "2026-09-24").' });
  }

  if (!factors || typeof factors !== 'object' || Array.isArray(factors)) {
    return res.status(400).json({ error: 'factors must be an object of boolean values.' });
  }

  for (const [key, val] of Object.entries(factors)) {
    if (typeof val !== 'boolean') {
      return res.status(400).json({ error: `Factor "${key}" must be a boolean.` });
    }
  }

  const submittedAt = new Date().toISOString();
  insertFactor(date, factors, submittedAt);

  const dayData = getTelemetryByDate(date);
  let updatedScore = null;
  if (dayData) {
    const scoringResult = calculatePoKoScore(dayData, factors);
    updatedScore = {
      score:           scoringResult.score,
      riskLevel:       scoringResult.riskLevel,
      externalFactors: scoringResult.externalFactorResult,
    };
  }

  res.status(201).json({
    message: 'Survey answers saved successfully.',
    entry: { date, factors, submittedAt },
    updatedScore,
  });
});

app.get('/api/survey/history', (req, res) => {
  const { date } = req.query;
  let all = getFactors(); // already newest-first
  if (date) all = all.filter((e) => e.date === date);
  res.json(all);
});

// ─── Sick Day Endpoints ───────────────────────────────────────────────────────

app.post('/api/sick-day', (req, res) => {
  const date = req.body?.date || new Date().toISOString().slice(0, 10);

  const ok = insertSickDay(date, new Date().toISOString());
  if (!ok) {
    return res.status(409).json({ error: `Sick day already logged for ${date}.` });
  }

  res.status(201).json({ message: 'Sick day logged.', entry: { date } });
});

app.delete('/api/sick-day', (req, res) => {
  const date = req.body?.date || new Date().toISOString().slice(0, 10);

  const ok = deleteSickDay(date);
  if (!ok) {
    return res.status(404).json({ error: `No sick day found for ${date}.` });
  }

  res.json({ message: 'Sick day removed.', date });
});

app.get('/api/sick-day/today', (req, res) => {
  const date = new Date().toISOString().slice(0, 10);
  res.json({ isSick: isSickDay(date), date });
});

// ─── Learning Engine Endpoints ────────────────────────────────────────────────

app.post('/api/learning/run', async (req, res) => {
  try {
    const { runAnalysis } = await import('./learningEngine.js');
    const insights = await runAnalysis();
    res.json({ message: 'Analysis complete.', insights });
  } catch (err) {
    console.error('[learning] runAnalysis error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/learning/insights', (req, res) => {
  const INSIGHTS_FILE = path.join(__dirname, 'data', 'learning_insights.json');
  try {
    const raw = JSON.parse(fs.readFileSync(INSIGHTS_FILE, 'utf-8'));
    res.json(raw);
  } catch {
    res.json({ lastRun: null, detectedPatterns: [], thresholds: {} });
  }
});

// ─── Advice Endpoints ─────────────────────────────────────────────────────────

app.post('/api/advice/generate', async (req, res) => {
  const { date, slot } = req.body;
  if (!date || !slot) {
    return res.status(400).json({ error: 'date and slot are required.' });
  }

  try {
    const dayData = getTelemetryByDate(date);
    if (!dayData) {
      return res.status(404).json({ error: `No telemetry found for ${date}.` });
    }
    const externalEntry  = getFactorsForDate(date);
    const externalFactors = externalEntry ? externalEntry.factors : null;
    const sickDay        = isSickDay(date);

    const { generateAdvice } = await import('./adviceEngine.js');
    const advice = await generateAdvice(dayData, externalFactors, sickDay, slot);

    insertAdvice({ date, ...advice });
    res.status(201).json(advice);
  } catch (err) {
    console.error('[advice] generate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/advice/today', (req, res) => {
  const date = new Date().toISOString().slice(0, 10);
  res.json(getAdviceByDate(date));
});

// ─── Scheduled advice (node-cron) ────────────────────────────────────────────

async function scheduleAdvice() {
  try {
    const cron = (await import('node-cron')).default;

    async function triggerAdviceSlot(slot) {
      try {
        const date    = new Date().toISOString().slice(0, 10);
        const dayData = getTelemetryByDate(date);
        if (!dayData) return;

        const externalEntry  = getFactorsForDate(date);
        const externalFactors = externalEntry ? externalEntry.factors : null;
        const sickDay        = isSickDay(date);

        const { generateAdvice } = await import('./adviceEngine.js');
        const advice = await generateAdvice(dayData, externalFactors, sickDay, slot);
        insertAdvice({ date, ...advice });
        console.log(`[cron] ${slot} advice generated.`);
      } catch (err) {
        console.error(`[cron] ${slot} advice error:`, err.message);
      }
    }

    cron.schedule('0 8 * * *',  () => triggerAdviceSlot('morning'));
    cron.schedule('30 12 * * *', () => triggerAdviceSlot('midday'));
    cron.schedule('0 16 * * *', () => triggerAdviceSlot('afternoon'));

    console.log('[cron] Daily advice scheduler started (08:00, 12:30, 16:00).');
  } catch (err) {
    console.error('[cron] Failed to start scheduler:', err.message);
  }
}

scheduleAdvice();

// ─── Start server ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Po-Ko Express Engine listening on http://localhost:${PORT}`);
});
