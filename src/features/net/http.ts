/**
 * A tiny, dependency-free HTTP/1.1 codec.
 *
 * We speak HTTP over a raw socket (react-native-tcp-socket) rather than using
 * fetch, because raw TCP is not subject to the Android cleartext-traffic policy
 * or iOS App Transport Security. Both ends are ours, so we keep it deliberately
 * simple: one request per connection, `Connection: close`, no chunked encoding.
 */

export type HttpRequest = {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string;
};

export type HttpResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

const HEADER_TERMINATOR = '\r\n\r\n';

/** Byte length of a string encoded as UTF-8 (Content-Length is in bytes). */
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      // Surrogate pair: two code units, four bytes.
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

function parseHeaders(block: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of block.split('\r\n')) {
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key) headers[key] = value;
  }
  return headers;
}

/**
 * Parse an HTTP request out of a (possibly partial) buffer.
 * Returns `null` while the message is still incomplete.
 */
export function parseHttpRequest(raw: string): HttpRequest | null {
  const boundary = raw.indexOf(HEADER_TERMINATOR);
  if (boundary === -1) return null;

  const head = raw.slice(0, boundary);
  const rest = raw.slice(boundary + HEADER_TERMINATOR.length);
  const firstBreak = head.indexOf('\r\n');
  const requestLine = firstBreak === -1 ? head : head.slice(0, firstBreak);
  const headerBlock = firstBreak === -1 ? '' : head.slice(firstBreak + 2);

  const parts = requestLine.split(' ');
  const method = (parts[0] ?? 'GET').toUpperCase();
  const path = parts[1] ?? '/';
  const headers = parseHeaders(headerBlock);

  const contentLength = Number.parseInt(headers['content-length'] ?? '0', 10) || 0;
  if (utf8ByteLength(rest) < contentLength) return null;

  return { method, path, headers, body: contentLength > 0 ? rest : '' };
}

const STATUS_TEXT: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  500: 'Internal Server Error',
};

export function serializeResponse(response: HttpResponse): string {
  const statusText = STATUS_TEXT[response.status] ?? 'OK';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': String(utf8ByteLength(response.body)),
    Connection: 'close',
    ...response.headers,
  };
  const lines = Object.entries(headers).map(([key, value]) => `${key}: ${value}`);
  return `HTTP/1.1 ${response.status} ${statusText}\r\n${lines.join('\r\n')}\r\n\r\n${response.body}`;
}

export function serializeRequest(request: {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
}): string {
  const body = request.body ?? '';
  const headers: Record<string, string> = {
    Host: 'shopos.local',
    Accept: 'application/json',
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': String(utf8ByteLength(body)),
    Connection: 'close',
    ...request.headers,
  };
  const lines = Object.entries(headers).map(([key, value]) => `${key}: ${value}`);
  return `${request.method.toUpperCase()} ${request.path} HTTP/1.1\r\n${lines.join('\r\n')}\r\n\r\n${body}`;
}

/** Parse a complete HTTP response. With `Connection: close` the body is the tail. */
export function parseHttpResponse(raw: string): HttpResponse {
  const boundary = raw.indexOf(HEADER_TERMINATOR);
  if (boundary === -1) throw new Error('Malformed HTTP response (no header end).');
  const head = raw.slice(0, boundary);
  const body = raw.slice(boundary + HEADER_TERMINATOR.length);
  const firstBreak = head.indexOf('\r\n');
  const statusLine = firstBreak === -1 ? head : head.slice(0, firstBreak);
  const headerBlock = firstBreak === -1 ? '' : head.slice(firstBreak + 2);
  const status = Number.parseInt(statusLine.split(' ')[1] ?? '0', 10) || 0;
  return { status, headers: parseHeaders(headerBlock), body };
}
