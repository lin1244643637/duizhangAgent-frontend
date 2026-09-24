const DISPLAY_VALUE_LABELS: Record<string, string> = {
  NEW: '新建',
  RUNNING: '进行中',
  COMPLETED: '已完成',
  TERMINATED: '已终止',
  CANCELED: '已取消',
  CANCELLED: '已取消',
  PENDING: '待处理',
  SUCCESS: '成功',
  FAILED: '失败',
  FAILURE: '失败',
  NORMAL: '正常',
  MISSING_CHECK: '缺卡',
  OUTSIDE: '外勤',
  LATE: '迟到',
  EARLY: '早退',
  agree: '同意',
  refuse: '拒绝',
  redirect: '转交',
  terminate: '终止',
  cancel: '取消',
};

export function formatDisplayValue(value: string): string {
  const text = value.trim();
  return DISPLAY_VALUE_LABELS[text] ?? DISPLAY_VALUE_LABELS[text.toUpperCase()] ?? value;
}
