import { Alert, Platform } from 'react-native';

/**
 * Destructive confirmation that works everywhere: react-native-web's Alert.alert
 * is a no-op, so on web delete/erase would silently do nothing.
 */
export function confirmDestructive(opts: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
}) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${opts.title}\n\n${opts.message}`)) opts.onConfirm();
    return;
  }
  Alert.alert(opts.title, opts.message, [
    { text: opts.cancelLabel, style: 'cancel' },
    { text: opts.confirmLabel, style: 'destructive', onPress: opts.onConfirm },
  ]);
}

/** Non-destructive yes/no confirmation (e.g. "Download the model?"), web-safe like the above. */
export function confirmAction(opts: { title: string; message: string; confirmLabel: string; cancelLabel: string; onConfirm: () => void }) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${opts.title}\n\n${opts.message}`)) opts.onConfirm();
    return;
  }
  Alert.alert(opts.title, opts.message, [
    { text: opts.cancelLabel, style: 'cancel' },
    { text: opts.confirmLabel, onPress: opts.onConfirm },
  ]);
}
