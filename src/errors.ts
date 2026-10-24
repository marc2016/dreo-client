export class DreoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DreoError';
  }
}

export class DreoAuthenticationError extends DreoError {
  public code?: number | string;

  constructor(message: string, code?: number | string) {
    super(message);
    this.name = 'DreoAuthenticationError';
    this.code = code;
  }
}

export class DreoNetworkError extends DreoError {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'DreoNetworkError';
  }
}

export class DreoApiError extends DreoError {
  constructor(message: string, public code?: number | string) {
    super(message);
    this.name = 'DreoApiError';
  }
}

export class DreoCommandError extends DreoError {
  constructor(message: string, public code?: number | string) {
    super(message);
    this.name = 'DreoCommandError';
  }
}

