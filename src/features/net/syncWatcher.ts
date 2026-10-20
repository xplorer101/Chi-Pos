import { addNetworkStateListener } from 'expo-network';
import { AppState } from 'react-native';

import { useClientStore } from './clientStore';

let stop: (() => void) | null = null;

/**
 * Keeps a cashier phone in step with the admin without anyone pressing a
 * button: the moment the network comes back or the app returns to the
 * foreground, drain the queue and refresh the catalog.
 *
 * Mounted once from the root layout for as long as this phone is a cashier.
 * Returns the stop function so React can clean up on unmount.
 */
export function startSyncWatcher(): () => void {
  stopSyncWatcher();

  const subscriptions = [
    addNetworkStateListener((state) => {
      if (state.isConnected || state.isInternetReachable) {
        void useClientStore.getState().syncNow();
      }
    }),
    AppState.addEventListener('change', (next) => {
      if (next === 'active') void useClientStore.getState().syncNow();
    }),
  ];

  stop = () => {
    for (const subscription of subscriptions) subscription.remove();
    stop = null;
  };

  // Pick up anything left over from the last time the app was open.
  void useClientStore.getState().syncNow();
  return stop;
}

export function stopSyncWatcher() {
  stop?.();
}
