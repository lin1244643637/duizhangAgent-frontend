import { Button, Input } from 'antd';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlatformDetailDrawer } from './PlatformDetailDrawer';
import { PlatformFilterBar } from './PlatformFilterBar';
import { PlatformMetricStrip } from './PlatformMetricStrip';
import { PlatformPageHeader } from './PlatformPageHeader';
import { PlatformStatusTag } from './PlatformStatusTag';

describe('platform admin base components', () => {
  it('renders a compact page header, metric strip, filter bar, status tag, and drawer', () => {
    render(
      <>
        <PlatformPageHeader
          title="租户管理"
          description="跨租户维护"
          primaryAction={<Button>新建租户</Button>}
        />
        <PlatformMetricStrip items={[{ label: '租户数', value: '12' }]} />
        <PlatformFilterBar resultCount={12}>
          <Input placeholder="搜索" />
        </PlatformFilterBar>
        <PlatformStatusTag label="失败" tone="error" />
        <PlatformDetailDrawer open title="详情" onClose={vi.fn()}>
          内容
        </PlatformDetailDrawer>
      </>,
    );

    expect(screen.getByRole('heading', { name: '租户管理' })).toBeTruthy();
    expect(screen.getByText('租户数')).toBeTruthy();
    expect(screen.getByText('共 12 条')).toBeTruthy();
    expect(screen.getByText('失败')).toBeTruthy();
    expect(screen.getByRole('dialog').textContent).toContain('内容');
  });
});
