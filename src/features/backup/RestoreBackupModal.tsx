import React, { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

import { Button } from '@/components/Button';
import { FormSheet } from '@/components/FormSheet';
import { Input } from '@/components/Input';
import { Text } from '@/components/Text';
import { formatMoney } from '@/lib/money';
import { useSessionStore } from '@/features/auth/sessionStore';
import { useTheme } from '@/theme/theme';
import type { ActingUser } from '@/db/types';
import { CONFIRM_WORD } from './backupFormat';
import { useBackupProgress } from './backupProgress';
import { BackupProgressBar } from './BackupProgressBar';
import {
  inspectBackup,
  restoreBackup,
  type InspectedBackup,
} from './backupService';
import { formatDateTime } from '@/lib/dates';

type Stage = 'pin' | 'pick' | 'password' | 'summary';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** The signed-in owner, or null when restoring before first-time setup. */
  actor: ActingUser | null;
};

function CountRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text variant="body" tone="muted">
        {label}
      </Text>
      <Text variant="body" style={{ fontFamily: theme.font.semibold }}>
        {value}
      </Text>
    </View>
  );
}

/** Pick, validate, preview and (with a typed confirmation) restore a backup. */
export function RestoreBackupModal({ visible, onClose, actor }: Props) {
  const theme = useTheme();
  const needsPin = actor !== null;

  const [stage, setStage] = useState<Stage>('pin');
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [inspected, setInspected] = useState<InspectedBackup | null>(null);
  const [confirmWord, setConfirmWord] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setPin('');
    setPassword('');
    setFileName(null);
    setText(null);
    setInspected(null);
    setConfirmWord('');
    setError(null);
    setWorking(false);
    setStage(needsPin ? 'pin' : 'pick');
  }, [visible, needsPin]);

  const pickFile = async () => {
    setError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/json', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const file = new File(asset.uri);
      const contents = await file.text();
      setText(contents);
      setFileName(asset.name ?? 'backup');

      const inspectedFile = inspectBackupMetadata(contents);
      if (inspectedFile.encrypted) {
        setStage('password');
      } else {
        setInspected(await inspectBackup(contents));
        setStage('summary');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const unlockBackup = async () => {
    if (!text) return;
    setError(null);
    try {
      setInspected(await inspectBackup(text, password.trim() || undefined));
      setStage('summary');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const doRestore = async () => {
    if (!text) return;
    setError(null);
    setWorking(true);
    useBackupProgress.getState().begin('Restoring backup');
    try {
      const result = await restoreBackup(actor, {
        pin: needsPin ? pin : '',
        text,
        password: password.trim() || undefined,
        confirmWord,
        onProgress: (label, current, total) =>
          useBackupProgress.getState().update(label, total > 0 ? current / total : null),
      });
      void result;
      Alert.alert(
        'Backup restored',
        'All current data was replaced. The app will now return to the login screen - the owner ' +
          'signs in with the PIN that was stored in the backup.',
        [{ text: 'OK' }],
      );
      onClose();
      await new Promise<void>((resolve) => setTimeout(resolve, 250));
      await useSessionStore.getState().restart();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      useBackupProgress.getState().end();
      setWorking(false);
    }
  };

  const subtitle =
    stage === 'pin'
      ? 'Backups contain customer, staff and price data. Re-enter your owner PIN to continue.'
      : stage === 'pick'
        ? 'Choose a .shoppos backup file. It is validated before anything is touched.'
        : stage === 'password'
          ? `"${fileName ?? 'This file'}" is password-protected. Enter the password to preview it.`
          : `Restore from${fileName ? ` "${fileName}"` : ' a backup'}?`;

  return (
    <FormSheet
      visible={visible}
      onClose={onClose}
      title="Restore a backup"
      subtitle={subtitle}
      dismissable={!working}
      footer={
        <View style={{ gap: 12 }}>
          {error ? (
            <Text variant="label" tone="danger">
              {error}
            </Text>
          ) : null}
          <BackupProgressBar />
          {stage === 'pin' ? (
            <Button
              label="Continue"
              icon="arrow-forward"
              onPress={() => {
                setStage('pick');
                void pickFile();
              }}
              disabled={!pin}
            />
          ) : stage === 'pick' ? (
            <Button label="Choose backup file" icon="folder-open-outline" onPress={() => void pickFile()} />
          ) : stage === 'password' ? (
            <Button label="Unlock preview" icon="lock-open-outline" onPress={() => void unlockBackup()} disabled={!password.trim()} />
          ) : (
            <>
              <Button
                label="Type RESTORE to replace everything"
                variant="danger"
                icon="alert-circle-outline"
                onPress={() => void doRestore()}
                loading={working}
                disabled={confirmWord.toUpperCase() !== CONFIRM_WORD}
              />
              <Button label="Go back to choosing" variant="ghost" onPress={() => setStage('pick')} disabled={working} />
            </>
          )}
        </View>
      }
    >
      {stage === 'pin' ? (
        <View style={{ gap: 12 }}>
          <Input
            label="Owner PIN"
            value={pin}
            onChangeText={setPin}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
            placeholder="••••"
          />
          <Text variant="caption" tone="muted">
            Restoring REPLACES everything on this device. A safety copy of the current data is saved
            automatically first (last 3 are kept).
          </Text>
        </View>
      ) : stage === 'password' ? (
        <View style={{ gap: 12 }}>
          <Input
            label="Backup password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            placeholder="Password used when the backup was created"
          />
          <Text variant="caption" tone="warning">
            A wrong password (or an edited file) cannot be restored. If you cannot remember the
            password, there is no way to open this backup.
          </Text>
        </View>
      ) : stage === 'summary' && inspected ? (
        <View style={{ gap: 12 }}>
          <View style={{ gap: 6 }}>
            <Overline label="Business" value={inspected.file.header.businessName || '—'} />
            <Overline label="Backup made" value={formatDateTime(inspected.file.header.createdAt)} />
            <Overline label="Data schema" value={`v${inspected.file.header.schemaVersion}${inspected.file.header.encrypted ? ' (encrypted)' : ''}`} />
          </View>
          <View
            style={{
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.surfaceAlt,
              padding: theme.space(3),
              gap: theme.space(2),
            }}
          >
            <CountRow label="Items" value={String(inspected.counts.items)} />
            <CountRow label="Customers" value={String(inspected.counts.customers)} />
            <CountRow label="Completed sales" value={String(inspected.counts.sales)} />
            <CountRow
              label="Outstanding debt"
              value={formatMoney(inspected.counts.outstandingDebt)}
            />
          </View>
          <Text variant="body" tone="danger" style={{ fontFamily: theme.font.semibold }}>
            This completely replaces the current data on this device. It cannot be undone (except by
            restoring a safety copy).
          </Text>
          {needsPin ? (
            <Input
              label="Owner PIN"
              value={pin}
              onChangeText={setPin}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              placeholder="Re-enter your PIN"
            />
          ) : (
            <Text variant="caption" tone="muted">
              No owner exists on this device yet, so no PIN is required for this first restore.
              After restoring you will sign in with the backup&apos;s owner PIN.
            </Text>
          )}
          <Input
            label={`Type ${CONFIRM_WORD} to continue`}
            value={confirmWord}
            onChangeText={(value) => setConfirmWord(value.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder={CONFIRM_WORD}
          />
        </View>
      ) : null}
    </FormSheet>
  );
}

function Overline({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="caption" style={{ fontFamily: theme.font.semibold }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/** Cheap header peek so we know whether a password step is needed. */
function inspectBackupMetadata(contents: string): { encrypted: boolean } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error('That file is not a readable ShopPOS backup.');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('That is not a ShopPOS backup.');
  }
  const header = (parsed as { header?: { encrypted?: unknown } }).header;
  if (!header) throw new Error('That is not a ShopPOS backup.');
  return { encrypted: header.encrypted === true };
}