export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Standard heuristic for English / code: ~4 characters per token
  return Math.ceil(text.length / 4);
}
