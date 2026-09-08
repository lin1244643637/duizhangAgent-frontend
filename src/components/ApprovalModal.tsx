import { Button, Modal } from 'antd';

import type { ApprovalRequest } from '../types';

interface Props {
  request: ApprovalRequest;
  onApprove: (action: string) => void;
  onCancel: () => void;
}

export function ApprovalModal({ request, onApprove, onCancel }: Props) {
  return (
    <Modal
      open
      centered
      closable={false}
      footer={null}
      getContainer={false}
      mask={{ closable: false }}
      width={384}
      zIndex={1000}
      styles={{ container: { padding: 24, borderRadius: 16 }, body: { padding: 0 } }}
    >
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">
            <svg className="w-5 h-5 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-slate-800">需要确认</h3>
            <p className="text-xs text-slate-500">以下操作需要您的授权</p>
          </div>
        </div>

        <p className="text-slate-600 text-sm bg-slate-50 border border-slate-200 rounded-xl p-3 mb-5">
          {request.description}
        </p>

        <div className="flex gap-3">
          <Button
            autoInsertSpace={false}
            onClick={onCancel}
            className="h-auto flex-1 rounded-xl border-slate-200 px-4 py-2 text-sm text-slate-500 transition-colors hover:text-slate-700"
          >
            取消
          </Button>
          <Button
            autoInsertSpace={false}
            type="primary"
            onClick={() => onApprove(request.action)}
            className="h-auto flex-1 rounded-xl bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600"
          >
            同意执行
          </Button>
        </div>
      </div>
    </Modal>
  );
}
