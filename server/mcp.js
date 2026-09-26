#!/usr/bin/env node
/**
 * server/mcp.js — Po-Ko IBM Bob MCP Server (stdio transport)
 * ─────────────────────────────────────────────────────────────────────────────
 * Exposes three tools to the IBM Bob IDE:
 *
 *   get_poko_status   — Today's Po-Ko score, risk level, active factors, sick
 *                       day flag, and survey completion status.
 *   submit_survey     — Submit daily external factor answers and get an updated
 *                       Po-Ko score.
 *   get_advice        — Get a specific, metric-grounded health advice message
 *                       for the current time slot (morning / midday / afternoon).
 *
 * This server is started as a separate process alongside the Express server.
 * ⚠️  Always use console.error for logging — stdout is the MCP protocol channel.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { getTodayTelemetry, submitSurveyFactors, getTodayAdvice, logDailyTelemetry } from './utils/pokoService.js';
import { generateAdvice } from './adviceEngine.js';
import { getTelemetryByDate, getFactorsForDate, isSickDay, insertAdvice } from './db.js';

// ─── Create server ────────────────────────────────────────────────────────────

const server = new McpServer({
  name:    'poko-developer-framework',
  version: '1.0.0',
});

// ─── Tool: get_poko_status ────────────────────────────────────────────────────

server.registerTool(
  'get_poko_status',
  {
    description:
      'Returns today\'s Po-Ko Developer Capacity score, risk level, active external factors, ' +
      'sick day flag, pattern warnings, and whether the daily survey has been answered. ' +
      'Use this to check the developer\'s current health and cognitive readiness.',
    inputSchema: z.object({}),
  },
  async () => {
    try {
      const today = getTodayTelemetry();

      if (!today) {
        return {
          content: [{
            type: 'text',
            text: 'No telemetry data available. Please log today\'s biometric data using the Po-Ko dashboard.',
          }],
        };
      }

      const activeFactors = today.poko_external_factors?.activeFactors ?? [];
      const patternWarnings = today.poko_pattern_warnings ?? [];

      const lines = [
        `📊 **Po-Ko Status — ${today.Date}**`,
        ``,
        `**Score:** ${today.poko_score}/10  |  **Risk Level:** ${today.poko_risk_level}`,
        `**Sick Day:** ${today.sick_day ? '🤒 Yes — logged as sick today' : 'No'}`,
        `**Survey Answered:** ${today.survey_answered ? '✓ Yes' : '✗ Not yet answered today'}`,
        ``,
        `**Biometrics:**`,
        `• Overnight HRV: ${today.Overnight_HRV_ms ?? 'N/A'} ms  (7-day baseline: ${today['7d_Avg_HRV_ms'] ?? 'N/A'} ms)`,
        `• Sleep Score: ${today.Sleep_Score ?? 'N/A'}/100`,
        `• Body Battery: ${today.Body_Battery ?? 'N/A'}`,
        `• Avg Stress: ${today.Avg_Stress ?? 'N/A'}/100`,
        ``,
        activeFactors.length > 0
          ? `**Active External Factors:** ${activeFactors.join(', ')} (+${today.poko_external_factors?.totalPenalty?.toFixed(1)} to score)`
          : `**External Factors:** None active`,
        ...(today.poko_trend_boosted ? [
          ``,
          `⚠️  **Sickness Pattern Alert:** ${today.poko_trend_details?.reason ?? 'Impending sickness pattern detected.'}`,
        ] : []),
        ...(patternWarnings.length > 0 ? [
          ``,
          `🔬 **Learning Engine Alerts:**`,
          ...patternWarnings.map((w) => `• ${w.name}: ${w.warningMessage}`),
        ] : []),
      ];

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    } catch (err) {
      console.error('[mcp] get_poko_status error:', err.message);
      return {
        content: [{ type: 'text', text: `Error retrieving status: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ─── Tool: submit_survey ──────────────────────────────────────────────────────

server.registerTool(
  'submit_survey',
  {
    description:
      'Submit daily external factor survey answers for a given date. ' +
      'Returns the updated Po-Ko score incorporating the new factors. ' +
      'Use this when the developer reports lifestyle context (e.g. alcohol last night, stress, illness exposure).',
    inputSchema: z.object({
      date: z.string()
        .describe('ISO date string (e.g. "2026-09-24"). Use today\'s date if unsure.'),
      factors: z.record(z.boolean())
        .describe(
          'Object mapping factor IDs to booleans. Valid factor IDs: ' +
          'exposedToSickPerson, severeAllergiesToday, highWorkloadDeadline, ' +
          'poorDietToday, alcoholLastNight, highCaffeineToday, missedMealToday, ' +
          'emotionallyDrained, travelOrJetLag, physicallyOverexerted, medicationSideEffects.'
        ),
    }),
  },
  async ({ date, factors }) => {
    try {
      const { updatedScore } = submitSurveyFactors(date, factors);

      if (!updatedScore) {
        return {
          content: [{
            type: 'text',
            text: `No telemetry found for ${date}. Survey answers saved but score cannot be computed.`,
          }],
        };
      }

      const activeFactors = Object.keys(factors).filter((k) => factors[k] === true);

      return {
        content: [{
          type: 'text',
          text: [
            `✓ Survey submitted for ${date}.`,
            ``,
            `**Updated Po-Ko Score:** ${updatedScore.score}/10  (${updatedScore.riskLevel})`,
            activeFactors.length > 0
              ? `**Active Factors Recorded:** ${activeFactors.join(', ')}`
              : `**No active factors recorded.**`,
          ].join('\n'),
        }],
      };
    } catch (err) {
      console.error('[mcp] submit_survey error:', err.message);
      return {
        content: [{ type: 'text', text: `Error submitting survey: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ─── Tool: get_advice ─────────────────────────────────────────────────────────

server.registerTool(
  'get_advice',
  {
    description:
      'Get a specific, metric-grounded health advice message for the current time slot. ' +
      'Returns stored advice if already generated today, or generates new advice on demand. ' +
      'Advice is tailored to the developer\'s actual biometric values.',
    inputSchema: z.object({
      slot: z.enum(['morning', 'midday', 'afternoon'])
        .describe('The time slot to get advice for. Use "morning" before noon, "midday" around lunch, "afternoon" after 3pm.'),
    }),
  },
  async ({ slot }) => {
    try {
      // Return stored advice if already generated for today's slot
      const existing = getTodayAdvice(slot);
      if (existing.length > 0) {
        const a = existing[0];
        const lines = [
          `💡 **Po-Ko ${capitalize(slot)} Advice**`,
          ``,
          a.text,
        ];
        if (a.triggerMetric) {
          lines.push(``, `_Triggered by: ${a.triggerMetric.replace(/_/g, ' ')}${a.triggerValue != null ? ` = ${a.triggerValue}` : ''}_`);
        }
        return { content: [{ type: 'text', text: lines.join('\n') }] };
      }

      // Generate new advice on demand
      const date    = new Date().toISOString().slice(0, 10);
      const dayData = getTelemetryByDate(date);

      if (!dayData) {
        return {
          content: [{
            type: 'text',
            text: `No telemetry data for today (${date}). Please log today\'s biometrics to get personalised advice.`,
          }],
        };
      }

      const externalEntry   = getFactorsForDate(date);
      const externalFactors = externalEntry ? externalEntry.factors : null;
      const sickDay         = isSickDay(date);

      const advice = await generateAdvice(dayData, externalFactors, sickDay, slot);
      insertAdvice({ date, ...advice });

      const lines = [
        `💡 **Po-Ko ${capitalize(slot)} Advice**`,
        ``,
        advice.text,
      ];
      if (advice.triggerMetric) {
        lines.push(``, `_Triggered by: ${advice.triggerMetric.replace(/_/g, ' ')}${advice.triggerValue != null ? ` = ${advice.triggerValue}` : ''}_`);
      }

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (err) {
      console.error('[mcp] get_advice error:', err.message);
      return {
        content: [{ type: 'text', text: `Error getting advice: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ─── Tool: log_daily_metrics ──────────────────────────────────────────────────

server.registerTool(
  'log_daily_metrics',
  {
    description:
      'Logs daily wearable telemetry metrics (Sleep Score, Overnight HRV, 7-day Avg HRV, Avg Stress, Bedtime, Wake Time) ' +
      'directly into the local database from the AI chat window. Recalculates and returns the updated Po-Ko score in real time.',
    inputSchema: z.object({
      date: z.string().optional()
        .describe('ISO date string (e.g. "2026-09-26"). Defaults to today if omitted.'),
      sleepScore: z.number().min(0).max(100)
        .describe('Garmin Sleep Score (0–100).'),
      overnightHrv: z.number().min(0)
        .describe('Overnight average HRV in ms.'),
      avgHrv7d: z.number().min(0)
        .describe('7-day rolling average HRV baseline in ms.'),
      avgStress: z.number().min(0).max(100)
        .describe('Average daily stress level (0–100).'),
      bedtimeDecimal: z.number().min(0).max(24)
        .describe('Bedtime in 24h decimal format (e.g., 22.5 for 10:30 PM).'),
      wakeTimeDecimal: z.number().min(0).max(24)
        .describe('Wake time in 24h decimal format (e.g., 7.0 for 7:00 AM).'),
      sleepDurationMinutes: z.number().optional()
        .describe('Optional recorded sleep duration in minutes.'),
    }),
  },
  async (params) => {
    try {
      const targetDate = params.date || new Date().toISOString().slice(0, 10);
      const result = logDailyTelemetry({
        Date: targetDate,
        Sleep_Score: params.sleepScore,
        Overnight_HRV_ms: params.overnightHrv,
        '7d_Avg_HRV_ms': params.avgHrv7d,
        Avg_Stress: params.avgStress,
        Bedtime_Decimal: params.bedtimeDecimal,
        Wake_Time_Decimal: params.wakeTimeDecimal,
        Sleep_Duration_Minutes: params.sleepDurationMinutes,
      });

      return {
        content: [{
          type: 'text',
          text: [
            `✓ Daily telemetry metrics logged successfully for **${targetDate}**.`,
            ``,
            `**Updated Po-Ko Score:** ${result.score}/10  (${result.riskLevel})`,
            `• Overnight HRV: ${params.overnightHrv} ms (7d Avg: ${params.avgHrv7d} ms)`,
            `• Sleep Score: ${params.sleepScore}/100`,
            `• Avg Stress: ${params.avgStress}/100`,
            `• Bedtime / Wake: ${params.bedtimeDecimal} / ${params.wakeTimeDecimal}`,
          ].join('\n'),
        }],
      };
    } catch (err) {
      console.error('[mcp] log_daily_metrics error:', err.message);
      return {
        content: [{ type: 'text', text: `Error logging telemetry metrics: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ─── Start ────────────────────────────────────────────────────────────────────

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[poko-mcp] Po-Ko MCP server running on stdio.');
}

main().catch((err) => {
  console.error('[poko-mcp] Fatal error:', err);
  process.exit(1);
});
