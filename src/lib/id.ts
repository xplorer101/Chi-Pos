import * as Crypto from 'expo-crypto';

/** New UUID primary key (RFC 4122 v4). */
export function newId(): string {
  return Crypto.randomUUID();
}
