export class JulesApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly isRetryable: boolean,
    public readonly rawError?: unknown,
  ) {
    super(`Jules API Error [${statusCode}]: ${message}`);
    this.name = "JulesApiError";
  }

  public static fromResponse(statusCode: number, body: string): JulesApiError {
    const isRetryable =
      statusCode === 429 || statusCode === 503 || statusCode === 504 || statusCode === 502;
    return new JulesApiError(
      `HTTP request failed with status ${statusCode}: ${body}`,
      statusCode,
      isRetryable,
    );
  }
}
