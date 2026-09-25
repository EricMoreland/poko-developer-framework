import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { calculatePoKoScore } from './pokoScoring.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const DATA_FILE = path.join(__dirname, 'data', 'sanitized_telemetry_with_sensor_gap_analysis.json');

// Helper: Read JSON Telemetry Data
function readTelemetryData() {
  try {
    const rawData = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(rawData);
  } catch (err) {
    console.error('Error reading telemetry JSON file:', err);
    return [];
  }
}

// Helper: Persist JSON Telemetry Data
function writeTelemetryData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error writing telemetry JSON file:', err);
    return false;
  }
}

// --- REST API ENDPOINTS ---

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
  const history = readTelemetryData();
  const limit = parseInt(req.query.limit, 10);

  // Map over the history to inject the calculated Po-Ko score for each day
  const scoredHistory = history.map(dayData => {
    const scoringResult = calculatePoKoScore(dayData);
    return {
      ...dayData,
      poko_score: scoringResult.score,
      poko_risk_level: scoringResult.riskLevel,
      poko_components: scoringResult.components
    };
  });
  
  if (!isNaN(limit) && limit > 0) {
    return res.json(scoredHistory.slice(0, limit));
  }
  
  res.json(scoredHistory);
});

// 3. POST New Daily Biometric Entry (Manual / AI Log)
app.post('/api/telemetry', (req, res) => {
  const newEntry = req.body;
  if (!newEntry || !newEntry.Date) {
    return res.status(400).json({ error: 'Missing required telemetry fields (e.g., Date).' });
  }

  const history = readTelemetryData();

  // Auto-calculate Time In Bed & Sensor Gap Flag if bedtime/waketime supplied
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

  // Assign Day sequential identifier
  const nextDayNum = history.length + 1;
  newEntry.Day = newEntry.Day || `Day_${String(nextDayNum).padStart(2, '0')}`;

  // Prepend to top of array (newest record first)
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

app.listen(PORT, () => {
  console.log(`Po-Ko Express Engine listening on http://localhost:${PORT}`);
});