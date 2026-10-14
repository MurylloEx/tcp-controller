export class FramingError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'FramingError';
  }
}
