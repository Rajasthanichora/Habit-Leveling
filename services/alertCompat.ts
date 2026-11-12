// Cross-platform alert helpers.
// `Alert.alert` is a hard no-op on web (react-native-web implements it as an
// empty method), so destructive confirmations and informational popups would
// silently do nothing in the browser. Native platforms keep the real system
// dialogs; web maps onto the browser's own confirm/alert windows.
import { Alert, AlertButton, Platform } from 'react-native';

export function infoAlert(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

export function confirmAlert(title: string, message: string | undefined, buttons: AlertButton[]): void {
  if (Platform.OS === 'web') {
    const confirmed = window.confirm(message ? `${title}\n\n${message}` : title);
    if (confirmed) {
      // Fire the non-cancel button (the destructive/positive action), same
      // role native Alert.alert gives to the non-cancel options.
      const confirmBtn = buttons.find((b) => b.style !== 'cancel') || buttons[buttons.length - 1];
      confirmBtn?.onPress?.();
    }
    return;
  }
  Alert.alert(title, message, buttons);
}
