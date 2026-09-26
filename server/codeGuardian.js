/**
 * Code Guardian — Cognitive Weight Classifier
 * ─────────────────────────────────────────────────────────────────────────────
 * Context Subagent for the Po-Ko Developer Framework.
 *
 * When a developer's Po-Ko score has crossed into an "Active Support State",
 * this module analyses incoming PR / task context and applies a metadata flag
 * to code that carries a statistically elevated probability of fatigue-induced
 * faults. The flag preserves health-state context alongside the commit so that
 * future bug investigations have a highlighted starting point.
 *
 * Public API:
 *   classifyCognitiveWeight(taskDescription, filesChanged, isCompromised)
 *     → CognitiveLoadResult | InterventionResult
 *
 * Classification Architecture (point-based, 0–100 raw):
 * ┌──────────────────────────────┬────────┬──────────────────────────────────────┐
 * │ Signal                       │ Weight │ Rationale                            │
 * ├──────────────────────────────┼────────┼──────────────────────────────────────┤
 * │ High-severity keywords       │  50 %  │ Architectural intent signals risk     │
 * │ Medium-severity keywords     │  20 %  │ Notable complexity but bounded scope  │
 * │ Files changed (volume)       │  30 %  │ Breadth of blast-radius compounds load│
 * └──────────────────────────────┴────────┴──────────────────────────────────────┘
 *
 * Classification thresholds (raw score 0–100):
 *   LOW    →  0–34
 *   MEDIUM → 35–64
 *   HEAVY  → 65–100
 */

// ─── Keyword Catalogue ───────────────────────────────────────────────────────

/**
 * HIGH-severity patterns — tasks matching these words carry deep architectural
 * reach and a proportionally high defect-injection risk under cognitive fatigue.
 *
 * Each entry is a { pattern: RegExp, label: string } pair.
 * Multiple hits within the same tier do not stack beyond the tier cap (see
 * scoring section) to avoid artificially inflating scores for dense descriptions.
 */
const HIGH_SEVERITY_PATTERNS = [
  { pattern: /\barchitect(ure|ural)?\b/i,          label: 'architecture'        },
  { pattern: /\brefactor(ing)?\b/i,                label: 'refactor'            },
  { pattern: /\bauth(entication|orization|z)?\b/i, label: 'auth'               },
  { pattern: /\bdatabase\s+migration\b/i,           label: 'database migration'  },
  { pattern: /\bdb\s+migration\b/i,                 label: 'db migration'        },
  { pattern: /\bsecurit(y|ies)\b/i,                label: 'security'            },
  { pattern: /\bencrypt(ion|ed)?\b/i,               label: 'encryption'          },
  { pattern: /\bcryptograph(y|ic)\b/i,              label: 'cryptography'        },
  { pattern: /\bmigrat(e|ion|ing)\b/i,              label: 'migration'           },
  { pattern: /\bbreaking[\s-]change\b/i,            label: 'breaking change'     },
  { pattern: /\bapi[\s-]?redesign\b/i,              label: 'api redesign'        },
  { pattern: /\binfrastructure\b/i,                 label: 'infrastructure'      },
  { pattern: /\bconcurrenc(y|ies)\b/i,              label: 'concurrency'         },
  { pattern: /\brace\s+condition\b/i,               label: 'race condition'      },
  { pattern: /\bdeadlock\b/i,                       label: 'deadlock'            },
];

/**
 * MEDIUM-severity patterns — meaningful scope but typically bounded to a
 * single service, feature, or layer; less likely to cascade across the system.
 */
const MEDIUM_SEVERITY_PATTERNS = [
  { pattern: /\bbug[\s-]?fix\b/i,          label: 'bug fix'         },
  { pattern: /\bperformance\b/i,           label: 'performance'     },
  { pattern: /\boptimiz(e|ation|ing)\b/i,  label: 'optimization'    },
  { pattern: /\bintegration\b/i,           label: 'integration'     },
  { pattern: /\bdependen(cy|cies)\b/i,     label: 'dependency'      },
  { pattern: /\bupgrad(e|ing)\b/i,         label: 'upgrade'         },
  { pattern: /\bcach(e|ing)\b/i,           label: 'caching'         },
  { pattern: /\bschedul(e|ing|er)\b/i,     label: 'scheduling'      },
  { pattern: /\bvalidat(e|ion|ing)\b/i,    label: 'validation'      },
  { pattern: /\bpagination\b/i,            label: 'pagination'      },
  { pattern: /\berror[\s-]?handling\b/i,   label: 'error handling'  },
  { pattern: /\blogging\b/i,               label: 'logging'         },
];

// ─── File-Volume Thresholds ───────────────────────────────────────────────────

/**
 * Number-of-files bands that map to a normalised 0–10 volume sub-score.
 * Deliberately non-linear: the cognitive jump from 1→5 files is manageable,
 * but 20→50 files represents a qualitatively different task surface.
 */
const FILE_BANDS = [
  { max: 2,   score: 0  }, // Trivial — single concern
  { max: 5,   score: 2  }, // Small — a handful of related files
  { max: 10,  score: 4  }, // Moderate — a complete feature slice
  { max: 20,  score: 6  }, // Large — cross-cutting change
  { max: 40,  score: 8  }, // Very large — multi-service impact
  { max: Infinity, score: 10 }, // Massive — system-wide blast radius
];

// ─── Classification Thresholds ────────────────────────────────────────────────

const THRESHOLDS = {
  HEAVY:  65,
  MEDIUM: 35,
  // Below MEDIUM → LOW
};

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Scans a description string against a pattern catalogue and returns both
 * the count of distinct matched labels and the matched label array itself.
 *
 * @param {string}   text     - Task or PR description
 * @param {Array}    patterns - Pattern catalogue array
 * @returns {{ count: number, matched: string[] }}
 */
function matchPatterns(text, patterns) {
  const matched = patterns
    .filter(({ pattern }) => pattern.test(text))
    .map(({ label }) => label);
  return { count: matched.length, matched };
}

/**
 * Returns a 0–10 sub-score for the number of files changed.
 * @param {number} filesChanged
 * @returns {number}
 */
function scoreFileVolume(filesChanged) {
  const n = Math.max(0, filesChanged);
  for (const band of FILE_BANDS) {
    if (n <= band.max) return band.score;
  }
  return 10; // Fallthrough safety
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Classifies the cognitive weight of a task and — when the developer is in a
 * compromised health state and the task is HEAVY — returns an actionable
 * intervention object with a traceability flag.
 *
 * @param {string}  taskDescription - Text of the PR title, task description,
 *                                    or commit message to analyse.
 * @param {number}  filesChanged    - Count of distinct files modified by the task.
 * @param {boolean} isCompromised   - True when the developer's Po-Ko score has
 *                                    reached an "Active Support State" threshold.
 *
 * @returns {CognitiveLoadResult|InterventionResult}
 *
 * CognitiveLoadResult:
 * {
 *   classification:    'LOW' | 'MEDIUM' | 'HEAVY',
 *   rawScore:          number,          // 0–100 composite score
 *   flagForTraceability: false,
 *   matchedHighKeywords:  string[],     // High-severity terms found
 *   matchedMediumKeywords: string[],    // Medium-severity terms found
 *   fileVolumeScore:   number,          // 0–10 volume sub-score
 * }
 *
 * InterventionResult (returned only when isCompromised && classification === 'HEAVY'):
 * {
 *   ...CognitiveLoadResult,
 *   flagForTraceability: true,
 *   routingAction: string,             // Recommended workflow intervention
 *   interventionReason: string,        // Human-readable rationale
 * }
 */
export function classifyCognitiveWeight(taskDescription, filesChanged, isCompromised) {
  const description = typeof taskDescription === 'string' ? taskDescription : '';

  // --- Keyword scoring (capped at 10 per tier to avoid description-stuffing) ---
  const highMatch   = matchPatterns(description, HIGH_SEVERITY_PATTERNS);
  const mediumMatch = matchPatterns(description, MEDIUM_SEVERITY_PATTERNS);

  // Each high-severity hit contributes 5 points; hard cap at 10 (2 hits saturate tier)
  const highKeywordScore   = Math.min(10, highMatch.count * 5);

  // Each medium-severity hit contributes 2.5 points; hard cap at 10 (4 hits saturate tier)
  const mediumKeywordScore = Math.min(10, mediumMatch.count * 2.5);

  const fileVolumeScore = scoreFileVolume(filesChanged);

  // --- Weighted composite (0–100) ---
  // High keywords: 50 % weight  → max contribution 50 pts
  // Medium keywords: 20 % weight → max contribution 20 pts
  // File volume: 30 % weight     → max contribution 30 pts
  const rawScore = Math.round(
    (highKeywordScore   * 5.0) +  // 10 * 5.0 = 50
    (mediumKeywordScore * 2.0) +  // 10 * 2.0 = 20
    (fileVolumeScore    * 3.0)    // 10 * 3.0 = 30
  );

  // --- Derive classification tier ---
  let classification;
  if (rawScore >= THRESHOLDS.HEAVY)       classification = 'HEAVY';
  else if (rawScore >= THRESHOLDS.MEDIUM) classification = 'MEDIUM';
  else                                    classification = 'LOW';

  const baseResult = {
    classification,
    rawScore,
    flagForTraceability:    false,
    matchedHighKeywords:    highMatch.matched,
    matchedMediumKeywords:  mediumMatch.matched,
    fileVolumeScore,
  };

  // --- Intervention gate: compromised developer + HEAVY cognitive load ---
  if (isCompromised && classification === 'HEAVY') {
    return {
      ...baseResult,
      flagForTraceability: true,
      routingAction:
        'Recommend pausing task or requesting secondary review. ' +
        'Flag this commit set for elevated post-merge audit.',
      interventionReason:
        `Developer is in an Active Support State (Po-Ko health flag active) and this ` +
        `task has been classified as HEAVY cognitive load (score: ${rawScore}/100). ` +
        `High-severity signals: [${highMatch.matched.join(', ') || 'none'}]. ` +
        `Files changed: ${filesChanged} (volume sub-score: ${fileVolumeScore}/10). ` +
        `Fatigue-induced fault probability is significantly elevated — traceability ` +
        `metadata has been attached to this push.`,
    };
  }

  return baseResult;
}
