import { listChannels, type NotificationChannel } from '../api/automation';
import { createResourceStore } from './createResourceStore';

/** 消息通道全局缓存（自动化与消息、经营分析推送弹窗共用）。通道增删改后 load(true)/invalidate()。 */
export const useChannelStore = createResourceStore<NotificationChannel>(listChannels);
