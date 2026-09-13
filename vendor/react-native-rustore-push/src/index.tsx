import { NativeModules, NativeEventEmitter } from 'react-native';
import type { TestNotificationPayload } from './types';
import type { RemoteMessage } from 'react-native-rustore-push';

interface RustorePushModule {
  createPushEmitter: () => void;
  deletePushEmitter: () => void;

  getToken: () => Promise<string>;
  deleteToken: () => Promise<boolean>;

  checkPushAvailability: () => Promise<boolean>;

  subscribeToTopic: (topic: string) => Promise<boolean>;
  unsubscribeFromTopic: (topic: string) => Promise<boolean>;

  sendTestNotification: (value: TestNotificationPayload) => Promise<boolean>;

  offNativeErrorHandling: () => void;

  getInitialNotification: () => Promise<RemoteMessage | null>;
}

export default NativeModules.RustorePush as RustorePushModule;

const eventEmitter = new NativeEventEmitter(NativeModules.RustorePush);

export { eventEmitter };
export * from './types';
