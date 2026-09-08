import { CloseOutlined } from '@ant-design/icons';
import { Button, Drawer } from 'antd';
import type { ReactNode } from 'react';

export interface PlatformDetailDrawerProps {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}

export function PlatformDetailDrawer({
  open,
  title,
  onClose,
  children,
  footer,
  width = 520,
}: PlatformDetailDrawerProps) {
  return (
    <Drawer
      open={open}
      title={title}
      size={width}
      onClose={onClose}
      closable={false}
      destroyOnHidden
      footer={footer}
      extra={(
        <Button
          aria-label="关闭详情抽屉"
          icon={<CloseOutlined />}
          type="text"
          onClick={onClose}
        />
      )}
      styles={{ body: { padding: '20px 24px' } }}
    >
      {children}
    </Drawer>
  );
}
