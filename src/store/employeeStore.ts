import { listRecipientEmployees, type AutomationRecipientEmployee } from '../api/automation';
import { createResourceStore } from './createResourceStore';

/** 员工通讯录全局缓存（自动化推送、经营分析推送弹窗、连接器告警人选共用）。 */
export const useEmployeeStore = createResourceStore<AutomationRecipientEmployee>(listRecipientEmployees);
