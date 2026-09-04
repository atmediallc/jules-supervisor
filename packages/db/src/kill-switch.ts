import { SystemSettingsRepository } from "./repositories/system-settings.repository.js";

/**
 * Runtime kill switch — P1 safety gate (Phases 20-25).
 *
 * MODEL
 * -----
 * The supervisor must be able to be halted at runtime by a human operator,
 * and that halt MUST be authoritative (persisted, survives restart, cannot be
 * overridden by the AI) and MUST be enforced in the same critical section as
 * any external mutation.
 *
 * The kill switch is modelled as a small set of `system_settings` rows:
 *   - AUTONOMY_SAFETY_STATE         → "RUNNING" | "PAUSED" | "SAFETY_LOCKED"
 *   - AUTONOMY_SAFETY_CHANGED_AT    → ISO timestamp (metadata)
 *   - AUTONOMY_SAFETY_CHANGED_BY    → actor that flipped the switch
 *   - AUTONOMY_SAFETY_REASON        → human-readable reason
 *
 * SEMANTICS
 * ---------
 *   RUNNING        → autonomous execution is permitted.
 *   PAUSED         → the AI is NOT called for new decisions and NO external
 *                    mutation is performed; in-flight work is refused but the
 *                    daemon keeps running (operator can restart/resume).
 *   SAFETY_LOCKED  → hard stop: AI calls and mutations are refused. Cannot be
 *                    lifted by the AI or by the config loader — only by an
 *                    explicit human operator action.
 *
 * FAIL-CLOSED
 * -----------
 * If the safety state cannot be read (DB error), the switch reports
 * SAFETY_LOCKED so the supervisor refuses to act rather than proceeding
 * without its safety check. `setState` is fail-closed too: a write error
 * throws and leaves the previous state intact.
 */

export type SafetyState = "RUNNING" | "PAUSED" | "SAFETY_LOCKED";

export const SAFETY_STATE_KEY = "AUTONOMY_SAFETY_STATE";
export const SAFETY_CHANGED_AT_KEY = "AUTONOMY_SAFETY_CHANGED_AT";
export const SAFETY_CHANGED_BY_KEY = "AUTONOMY_SAFETY_CHANGED_BY";
export const SAFETY_REASON_KEY = "AUTONOMY_SAFETY_REASON";

export interface SafetyStateRecord {
  state: SafetyState;
  changedAt: string | null;
  changedBy: string | null;
  reason: string | null;
}

const VALID_STATES: ReadonlySet<string> = new Set<SafetyState>([
  "RUNNING",
  "PAUSED",
  "SAFETY_LOCKED",
]);

export class KillSwitch {
  constructor(private readonly settingsRepo: SystemSettingsRepository) {}

  /** Reads the current safety state. Fail-closed → SAFETY_LOCKED on read error. */
  public async getState(): Promise<SafetyStateRecord> {
    let rows: Awaited<ReturnType<SystemSettingsRepository["getByKey"]>>;
    try {
      rows = await this.settingsRepo.getByKey(SAFETY_STATE_KEY);
    } catch {
      // Fail-closed: if we cannot read the safety state we must not act.
      return {
        state: "SAFETY_LOCKED",
        changedAt: new Date().toISOString(),
        changedBy: "SYSTEM",
        reason: "Fail-closed: could not read safety state from database",
      };
    }

    const raw = rows?.value;
    if (raw !== undefined && raw !== null && !VALID_STATES.has(raw)) {
      return {
        state: "SAFETY_LOCKED",
        changedAt: new Date().toISOString(),
        changedBy: "SYSTEM",
        reason: `Fail-closed: unrecognized or corrupted safety state in database: ${raw}`,
      };
    }
    const state: SafetyState = raw && VALID_STATES.has(raw) ? (raw as SafetyState) : "RUNNING";

    let changedAt: string | null = null;
    let changedBy: string | null = null;
    let reason: string | null = null;
    try {
      const [at, by, why] = await Promise.all([
        this.settingsRepo.getByKey(SAFETY_CHANGED_AT_KEY),
        this.settingsRepo.getByKey(SAFETY_CHANGED_BY_KEY),
        this.settingsRepo.getByKey(SAFETY_REASON_KEY),
      ]);
      changedAt = at?.value ?? null;
      changedBy = by?.value ?? null;
      reason = why?.value ?? null;
    } catch {
      // Metadata is advisory; the state itself was already read successfully.
    }

    return { state, changedAt, changedBy, reason };
  }

  /**
   * Sets the safety state (plus metadata). Fail-closed: if any write fails,
   * the error is rethrown so the caller knows the transition did NOT apply.
   */
  public async setState(
    state: SafetyState,
    opts: { by: string; reason?: string },
  ): Promise<SafetyStateRecord> {
    if (!VALID_STATES.has(state)) {
      throw new Error(`Invalid safety state: ${state}`);
    }
    const now = new Date().toISOString();
    await this.settingsRepo.upsertMany([
      { key: SAFETY_STATE_KEY, value: state, category: "safety", isSecret: false },
      { key: SAFETY_CHANGED_AT_KEY, value: now, category: "safety", isSecret: false },
      { key: SAFETY_CHANGED_BY_KEY, value: opts.by, category: "safety", isSecret: false },
      { key: SAFETY_REASON_KEY, value: opts.reason ?? "", category: "safety", isSecret: false },
    ]);
    return {
      state,
      changedAt: now,
      changedBy: opts.by,
      reason: opts.reason ?? null,
    };
  }

  /** True when autonomous execution is permitted. */
  public isRunning(state: SafetyStateRecord): boolean {
    return state.state === "RUNNING";
  }
}

/** Convenience guard used by the pipeline; returns a human-safe decision action. */
export function safetyActionForState(state: SafetyStateRecord): {
  blocked: boolean;
  action: "REQUEST_HUMAN" | "BLOCK";
  reason: string;
} {
  switch (state.state) {
    case "SAFETY_LOCKED":
      return {
        blocked: true,
        action: "BLOCK",
        reason: "Autonomy is SAFETY_LOCKED by a human operator. External mutations are refused.",
      };
    case "PAUSED":
      return {
        blocked: false,
        action: "REQUEST_HUMAN",
        reason: "Autonomy is PAUSED by a human operator. Escalating to human review.",
      };
    case "RUNNING":
    default:
      return { blocked: false, action: "REQUEST_HUMAN", reason: "" };
  }
}
