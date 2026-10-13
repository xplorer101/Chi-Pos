import {
  parseHttpRequest,
  parseHttpResponse,
  serializeRequest,
  serializeResponse,
  utf8ByteLength,
} from '../http';

describe('http codec', () => {
  it('counts UTF-8 byte length, not characters', () => {
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('₦')).toBe(3);
    expect(utf8ByteLength('😀')).toBe(4);
  });

  it('parses a request only once the body has fully arrived', () => {
    const body = JSON.stringify({ clientId: 'abc', name: 'Till 1' });
    const raw = `POST /pair/request HTTP/1.1\r\nContent-Length: ${utf8ByteLength(body)}\r\n\r\n${body}`;

    expect(parseHttpRequest(raw.slice(0, 10))).toBeNull();

    const head = raw.slice(0, raw.indexOf('\r\n\r\n') + 4);
    expect(parseHttpRequest(head)).toBeNull();

    const parsed = parseHttpRequest(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.method).toBe('POST');
    expect(parsed!.path).toBe('/pair/request');
    expect(JSON.parse(parsed!.body)).toEqual({ clientId: 'abc', name: 'Till 1' });
  });

  it('lowercases header names on parse', () => {
    const raw = `GET /health HTTP/1.1\r\nX-Pairing-Key: ABCD-EFGH\r\n\r\n`;
    const parsed = parseHttpRequest(raw);
    expect(parsed!.headers['x-pairing-key']).toBe('ABCD-EFGH');
  });

  it('round-trips a response with a non-ASCII body', () => {
    const body = JSON.stringify({ shopName: 'Iya ₦ Store' });
    const wire = serializeResponse({ status: 200, headers: {}, body });
    const parsed = parseHttpResponse(wire);
    expect(parsed.status).toBe(200);
    expect(parsed.body).toBe(body);
    expect(JSON.parse(parsed.body).shopName).toBe('Iya ₦ Store');
  });

  it('serializes a request with the correct Content-Length in bytes', () => {
    const wire = serializeRequest({ method: 'post', path: '/sales', body: '{"note":"₦"}' });
    expect(wire.startsWith('POST /sales HTTP/1.1\r\n')).toBe(true);
    const expected = utf8ByteLength('{"note":"₦"}');
    expect(wire).toContain(`Content-Length: ${expected}`);
  });
});
