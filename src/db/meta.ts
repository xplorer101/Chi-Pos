import { getDeviceId } from '@/lib/device';
import { newId } from '@/lib/id';

/** Values every row needs: a UUID, sync timestamps and the owning device. */
export type RowMeta = {
  id: string;
  now: number;
  deviceId: string;
};

export async function newRowMeta(): Promise<RowMeta> {
  return {
    id: newId(),
    now: Date.now(),
    deviceId: await getDeviceId(),
  };
}
