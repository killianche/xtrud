export interface RemoteMessage {
  messageId?: string;
  priority?: number;
  ttl?: number;
  collapseKey?: string;
  data: {key: string, value: string},
  rawData?:Array<number>,
  notification: Notification;
}

export interface Notification {
  title?: string;
  body: string;
  channelId?: string;
  imageUrl?: string;
  color?: string;
  icon?: string;
  clickAction?: string;
  clickActionType?: ClickActionType;
}

export enum ClickActionType {
  DEFAULT = "DEFAULT",
  DEEP_LINK = "DEEP_LINK"
}

export enum PushEvents {
  ON_NEW_TOKEN = 'ON_NEW_TOKEN',
  ON_MESSAGE_RECEIVED = 'ON_MESSAGE_RECEIVED',
  ON_DELETED_MESSAGES = 'ON_DELETED_MESSAGES',
  ON_ERROR = 'ON_ERROR',
  ON_OPENED = 'ON_OPENED'
}

export class TestNotificationPayload {
  title: string ;
  body: string;
  imageUrl: string;
  data: {key: string, value: string};
  constructor(title: string, body: string, imageUrl: string, data: {key: string, value: string}) {
    this.title = title;
    this.body = body;
    this.imageUrl = imageUrl;
    this.data = data;
  }
}
