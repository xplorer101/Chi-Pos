import { parsePairingInfo, PROTOCOL_VERSION } from '../protocol';

describe('parsePairingInfo', () => {
  const valid = {
    v: PROTOCOL_VERSION,
    ip: '192.168.1.10',
    port: 8799,
    shopId: 'shop-1',
    key: 'ABCD-EFGH',
    name: 'ShopPOS',
  };

  it('reads the payload the host puts in its QR code', () => {
    expect(parsePairingInfo(JSON.stringify(valid))).toEqual(valid);
  });

  it('fills in defaults for fields an older host omits', () => {
    expect(parsePairingInfo(JSON.stringify({ ip: '10.0.0.2', port: 8799, key: 'KEY' }))).toEqual({
      v: 0,
      ip: '10.0.0.2',
      port: 8799,
      shopId: '',
      key: 'KEY',
      name: 'ShopPOS',
    });
  });

  it('rejects product barcodes and malformed payloads', () => {
    expect(parsePairingInfo('5901234123457')).toBeNull();
    expect(parsePairingInfo('')).toBeNull();
    expect(parsePairingInfo('{"ip":"1.2.3.4"}')).toBeNull();
    expect(parsePairingInfo(JSON.stringify({ ip: '', port: 8799, key: 'K' }))).toBeNull();
    expect(parsePairingInfo(JSON.stringify({ ip: '1.2.3.4', port: 0, key: 'K' }))).toBeNull();
    expect(parsePairingInfo(JSON.stringify({ ip: '1.2.3.4', port: 8799, key: '' }))).toBeNull();
  });
});
