import { Client, Context, Service, StatusCodes } from '@types-first-api/core';
import { GrpcClient } from '@types-first-api/grpc-client';
import { GrpcServer } from '@types-first-api/grpc-server';
import { NEVER, of } from 'rxjs';
import { clients, services, wtf } from '../generated/Service';
import { later } from './util';

describe('grpc', () => {
  let service: Service<wtf.guys.SchedulingService>;
  let server: GrpcServer;
  let client: Client<wtf.guys.SchedulingService>;

  beforeEach(async () => {
    service = services.create('wtf.guys.SchedulingService', {});
    server = new GrpcServer(service);
    await server.bind({ port: 5556 });
    client = clients.create(
      'wtf.guys.SchedulingService',
      { host: 'localhost', port: 5556 },
      GrpcClient
    );
  });

  afterEach(async () => {
    await server.shutdown();
  });

  describe('client initialization', () => {
    it('should provide rpc functions based on the service', () => {
      expect(client.rpc.Unary).toBeInstanceOf(Function);
      expect(client.rpc.ClientStream).toBeInstanceOf(Function);
      expect(client.rpc.ServerStream).toBeInstanceOf(Function);
      expect(client.rpc.BidiStream).toBeInstanceOf(Function);
    });
  });

  describe('errors', () => {
    it('should return an error if given a bad connection string', () => {
      client = clients.create(
        'wtf.guys.SchedulingService',
        { host: 'localhost', port: 12345 },
        GrpcClient
      );

      const response$ = client.rpc.Unary(of({ id: '1' }));
      return expect(response$.toPromise()).rejects.toMatchObject({
        code: StatusCodes.Unavailable,
        message: 'Connect Failed',
      });
    });

    ['Unary', 'ClientStream', 'ServerStream', 'BidiStream'].forEach(methodName => {
      it(`should propagate a serialized error from the server for ${methodName}`, () => {
        const response$ = client.rpc[methodName](of({ id: '1' }));
        return expect(response$.toPromise()).rejects.toMatchObject({
          code: 'Not Implemented',
          message: `RPC Method '${methodName}' is not implemented.`,
          forwardedFor: ['wtf.guys.SchedulingService'],
        });
      });
    });

    it('should propagate errors from upstream client calls', () => {
      service.registerServiceHandler('Unary', req$ => {
        return client.rpc.ServerStream(req$);
      });

      const response$ = client.rpc.Unary(of({ id: '1', outlookId: 'hi' }));
      return expect(response$.toPromise()).rejects.toMatchObject({
        code: 'Not Implemented',
        message: "RPC Method 'ServerStream' is not implemented.",
        forwardedFor: ['wtf.guys.SchedulingService', 'wtf.guys.SchedulingService'],
      });
    });
  });

  describe('cancellation', () => {
    it('should allow cancellation of a request fast', () => {
      service.registerServiceHandler('Unary', () => {
        return NEVER;
      });

      const ctx = Context.create();
      ctx.cancel();

      const response$ = client.rpc.Unary(of({ id: '1' }), ctx);

      return expect(response$.toPromise()).rejects.toMatchObject({
        code: StatusCodes.Cancelled,
      });
    });

    it('should allow cancellation of a request later', () => {
      service.registerServiceHandler('Unary', () => {
        return NEVER;
      });

      const ctx = Context.create();
      const response$ = client.rpc.Unary(of({ id: '1' }), ctx);
      setTimeout(ctx.cancel, 100);

      return expect(response$.toPromise()).rejects.toMatchObject({
        code: StatusCodes.Cancelled,
      });
    });

    it('should propagate cancellation to the server', () => {
      let serverContext: Context;
      service.registerServiceHandler('Unary', (req$, ctx) => {
        serverContext = ctx;
        return NEVER;
      });

      const ctx = Context.create();
      const res$ = client.rpc.Unary(of({ id: '1' }), ctx);

      setTimeout(ctx.cancel, 100);

      return res$.toPromise().catch(() => {
        return expect(serverContext.cancel$.toPromise()).rejects.toMatchObject({
          code: StatusCodes.Cancelled,
        });
      });
    });
  });

  describe('deadlines', () => {
    it('should cause the client request to cancel with deadline exceeded', () => {
      service.registerServiceHandler('Unary', (req$, ctx) => {
        return NEVER;
      });

      const deadline = later();
      const ctx = Context.create({ deadline });
      const res$ = client.rpc.Unary(of({ id: '1' }), ctx);

      return expect(res$.toPromise()).rejects.toMatchObject({
        code: StatusCodes.Deadline,
        message: `Request exceeded deadline ${deadline.toISOString()}.`,
      });
    });

    it('should propagate cancellation to the server', () => {
      let serverContext: Context;
      service.registerServiceHandler('Unary', (req$, ctx) => {
        serverContext = ctx;
        return NEVER;
      });

      const deadline = later();
      const ctx = Context.create({ deadline });
      const res$ = client.rpc.Unary(of({ id: '1' }), ctx);

      return res$.toPromise().catch(() => {
        return expect(serverContext.cancel$.toPromise()).rejects.toMatchObject({
          code: StatusCodes.Deadline,
          message: `Request exceeded deadline ${deadline.toISOString()}.`,
        });
      });
    });
  });

  describe('metadata', () => {
    it('should send context metadata from client to server', () => {
      let serverContext: Context;
      service.registerServiceHandler('Unary', (req$, ctx) => {
        serverContext = ctx;
        return req$;
      });

      const ctx = Context.create({ metadata: { hello: 'world' } });
      const res$ = client.rpc.Unary(of({ id: '1' }), ctx);

      return res$.toPromise().then(() => {
        return expect(serverContext.metadata).toMatchObject({
          hello: 'world',
        });
      });
    });
  });

  describe('serialization', () => {
    it('should serialize enums as numersb', () => {
      service.registerServiceHandler('Unary', req$ => {
        return of({
          id: '1',
          dayofWeek: wtf.guys.DayOfWeek.WED,
        });
      });
      const res$ = client.rpc.Unary(of({ id: '1' }));
      return expect(res$.toPromise()).resolves.toMatchObject({
        id: '1',
        dayofWeek: 2,
      });
    });

    it('should serialize oneofs with source correctly', () => {
      service.registerServiceHandler('Unary', req$ => {
        return of({
          id: '1',
          outlookId: 'asdf',
        });
      });
      const res$ = client.rpc.Unary(of({ id: '1' }));
      return expect(res$.toPromise()).resolves.toMatchObject({
        id: '1',
        source: 'outlookId',
        outlookId: 'asdf',
      });
    });
  });
});
