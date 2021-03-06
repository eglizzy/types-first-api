import * as _ from 'lodash';
import { isError, isString } from 'util';

export enum StatusCodes {
  Ok = 'OK',

  // TODO: deal with status for token refresh (currently ABORTED / 412)
  TokenExpired = 'Token Expired',

  Cancelled = 'Cancelled',
  Deadline = 'Deadline Exceeded',
  RateLimit = 'Rate Limit Exceeded',
  BadRequest = 'Bad Request',
  NotImplemented = 'Not Implemented',
  NotAuthenticated = 'Not Authenticated',
  NotAuthorized = 'Not Authorized',
  NotFound = 'Not Found',

  Unavailable = 'Unavailable',
  NetworkError = 'Network Error',
  ServerError = 'Server Error',
  ClientError = 'Client Error',
}

export const HEADERS = {
  TRAILER_ERROR: 'x-grpc-serialized-error',
  DEADLINE: 'x-grpc-deadline',
};

export interface IError {
  code: StatusCodes;
  message: string;
  forwardedFor: string[];
  details?: string;
  stackTrace?: string;
}

export const DEFAULT_SERVER_ERROR = {
  code: StatusCodes.ServerError,
  message: 'Something went wrong while processing the request.',
  forwardedFor: [],
};

export const DEFAULT_CLIENT_ERROR = {
  code: StatusCodes.ClientError,
  message: 'Something went wrong while processing the request.',
  forwardedFor: [],
};

export function isIError(err: any): err is IError {
  return err != null && _.includes(StatusCodes, err.code) && isString(err.message);
}

export function createError(err: any, defaultError: IError): IError {
  const stackTrace = new Error().stack;

  if (err != null) {
    if (isIError(err)) {
      return err;
    }

    if (isError(err)) {
      return {
        ...defaultError,
        message: err.message,
        stackTrace: err.stack,
        forwardedFor: [],
      };
    }
  }

  return {
    ...defaultError,
    details: `source error: ${JSON.stringify(err)}`,
    forwardedFor: [],
    stackTrace,
  };
}
