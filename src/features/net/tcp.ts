import { Buffer } from 'buffer';
import TcpSocket from 'react-native-tcp-socket';

import { parseHttpRequest, parseHttpResponse, serializeRequest, serializeResponse } from './http';
import type { HttpRequest } from './http';

/**
 * The only place that touches the native TCP module. Everything else works with
 * the plain HTTP types in `./http`, so the transport can be swapped (or mocked
 * in tests) without changing the protocol or screens.
 *
 * `react-native-tcp-socket` is a legacy native module; the New Architecture
 * interop layer loads it as-is. It requires a development build - it is not
 * available in Expo Go.
 */

type DataListener = (data: string | Uint8Array) => void;

type SocketLike = {
  remoteAddress?: string;
  remotePort?: number;
  setEncoding(encoding: string): void;
  on(event: 'data', cb: DataListener): void;
  on(event: 'error', cb: (error: Error) => void): void;
  on(event: 'close', cb: (hadError: boolean) => void): void;
  on(event: 'end', cb: () => void): void;
  write(data: string): void;
  end(data?: string): void;
  destroy(): void;
};

type ServerLike = {
  listen(options: { port: number; host?: string }, callback?: () => void): void;
  close(callback?: (error?: Error) => void): void;
  on(event: 'error', cb: (error: Error) => void): void;
};

export function isTcpAvailable(): boolean {
  try {
    return typeof (TcpSocket as { createServer?: unknown })?.createServer === 'function';
  } catch {
    return false;
  }
}

export type HttpHandler = (
  request: HttpRequest,
  meta: { remoteAddress: string; remotePort: number },
) => Promise<{ status: number; body: unknown; headers?: Record<string, string> }>;

/** Start an HTTP server on all interfaces. Returns a handle to stop it. */
export function createHttpServer(handler: HttpHandler, onError?: (error: Error) => void) {
  const server = TcpSocket.createServer({ keepAlive: true, noDelay: true }, (rawSocket) => {
    const socket = rawSocket as unknown as SocketLike;
    let buffer = '';
    socket.setEncoding('utf8');

    socket.on('data', (data) => {
      buffer += typeof data === 'string' ? data : Buffer.from(data).toString('utf8');
      const request = parseHttpRequest(buffer);
      if (!request) return;
      buffer = '';
      void (async () => {
        let payload: { status: number; body: unknown; headers?: Record<string, string> };
        try {
          payload = await handler(request, {
            remoteAddress: socket.remoteAddress ?? '',
            remotePort: socket.remotePort ?? 0,
          });
        } catch (error) {
          payload = {
            status: 500,
            body: { error: 'server_error', message: error instanceof Error ? error.message : String(error) },
          };
        }
        const text = JSON.stringify(payload.body ?? {});
        try {
          socket.end(serializeResponse({ status: payload.status, headers: payload.headers ?? {}, body: text }));
        } catch {
          socket.destroy();
        }
      })();
    });

    socket.on('error', () => {
      // A single broken connection must never take the server down.
    });
  }) as unknown as ServerLike;

  server.on('error', (error) => onError?.(error));

  return {
    listen(port: number, host = '0.0.0.0') {
      server.listen({ port, host });
    },
    stop() {
      server.close();
    },
  };
}

export type ClientResult = { status: number; body: unknown };

/** Perform one HTTP request over a fresh TCP connection. */
export function httpRequest(options: {
  host: string;
  port: number;
  method?: string;
  path: string;
  body?: unknown;
  token?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}): Promise<ClientResult> {
  const timeoutMs = options.timeoutMs ?? 6000;
  const headers: Record<string, string> = { ...options.headers };
  if (options.token) headers['x-device-token'] = options.token;

  return new Promise<ClientResult>((resolve, reject) => {
    let settled = false;
    let raw = '';
    let socket: SocketLike;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket?.destroy();
      } catch {
        // already gone
      }
      fn();
    };

    const timer = setTimeout(() => finish(() => reject(new Error('The admin phone did not respond.'))), timeoutMs);

    try {
      socket = TcpSocket.createConnection(
        { host: options.host, port: options.port, interface: 'wifi', connectTimeout: timeoutMs },
        () => {
          socket.write(
            serializeRequest({
              method: options.method ?? 'GET',
              path: options.path,
              headers,
              body: options.body === undefined ? '' : JSON.stringify(options.body),
            }),
          );
        },
      ) as unknown as SocketLike;
    } catch (error) {
      clearTimeout(timer);
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    socket.setEncoding('utf8');
    socket.on('data', (data) => {
      raw += typeof data === 'string' ? data : Buffer.from(data).toString('utf8');
    });
    socket.on('error', (error) => finish(() => reject(error)));
    socket.on('close', () => {
      finish(() => {
        try {
          const response = parseHttpResponse(raw);
          let body: unknown = null;
          if (response.body) {
            try {
              body = JSON.parse(response.body);
            } catch {
              body = response.body;
            }
          }
          resolve({ status: response.status, body });
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });
  });
}
