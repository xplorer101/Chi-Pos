import React, { useEffect, useState } from 'react';

import ConnectScreen from '@/app/connect';
import { useSessionStore } from '@/features/auth/sessionStore';

import { useClientStore } from './clientStore';

/**
 * Front door for a phone in cashier mode, shown by RootGate until the device is
 * unlocked. If it is already paired, it unlocks silently as the bound cashier;
 * otherwise it shows the connect/pairing screen.
 */
export function CashierBoot() {
  const pairing = useClientStore((state) => state.pairing);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      await useClientStore.getState().load();
      if (mounted) setLoaded(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded || !pairing) return;
    useSessionStore.getState().unlockAs({
      id: pairing.userId,
      name: pairing.userName,
      role: pairing.role === 'owner' ? 'owner' : 'cashier',
    });
  }, [loaded, pairing]);

  if (!loaded || pairing) return null;
  return <ConnectScreen />;
}
