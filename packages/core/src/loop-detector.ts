import { sha256 } from "@jules/shared";

export interface LoopDetectorConfig {
  maxConsecutiveIdenticalPrompts?: number;
  maxTotalSessionCycles?: number;
}

export interface ActivityHistoryItem {
  id: string;
  type: string;
  content: string;
  timestamp: string;
}

export class LoopDetector {
  private promptHashes: string[] = [];
  private readonly maxConsecutive: number;
  private readonly maxCycles: number;

  constructor(config: LoopDetectorConfig = {}) {
    this.maxConsecutive = config.maxConsecutiveIdenticalPrompts ?? 2;
    this.maxCycles = config.maxTotalSessionCycles ?? 10;
  }

  public evaluate(history: ActivityHistoryItem[]): { isLoopDetected: boolean; reason?: string } {
    if (history.length >= this.maxCycles * 2) {
      return {
        isLoopDetected: true,
        reason: `Session exceeded maximum cycle limit (${this.maxCycles} cycles)`,
      };
    }

    const agentQuestions = history
      .filter((h) => h.type === "AGENT_MESSAGE" && h.content)
      .map((h) => sha256(h.content.trim().toLowerCase()));

    if (agentQuestions.length >= this.maxConsecutive) {
      const recent = agentQuestions.slice(-this.maxConsecutive);
      const allSame = recent.every((h) => h === recent[0]);
      if (allSame) {
        return {
          isLoopDetected: true,
          reason: `Repeated identical agent prompt detected ${this.maxConsecutive} times consecutively`,
        };
      }
    }

    return { isLoopDetected: false };
  }
}
