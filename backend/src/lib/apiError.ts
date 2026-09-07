export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "ApiError";
  }
}
