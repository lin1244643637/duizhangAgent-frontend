import { useEffect, useState, type RefObject } from 'react';
import { Button, Dropdown, message } from 'antd';
import type { MenuProps } from 'antd';
import type { ECharts } from 'echarts/core';
import { downloadChartPng, downloadChartXlsx } from './chartExport';

type Props = {
  chartRef: RefObject<ECharts | null>;
  title: string;
  dateFrom?: string;
  dateTo?: string;
  className?: string;
};

export function ChartDownloadMenu({ chartRef, title, dateFrom, dateTo, className = '' }: Props) {
  const [ready, setReady] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let timer: number | undefined;
    let active = true;
    const syncReady = () => {
      const chart = chartRef.current;
      const nextReady = Boolean(chart && !chart.isDisposed());
      setReady(nextReady);
      if (!nextReady && active) timer = window.setTimeout(syncReady, 50);
    };
    syncReady();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [chartRef]);

  const handleDownload: MenuProps['onClick'] = async ({ key }) => {
    const chart = chartRef.current;
    if (!chart || chart.isDisposed()) return;
    setDownloading(true);
    try {
      if (key === 'png') {
        await downloadChartPng(chart, title, dateFrom, dateTo);
        message.success('图表 PNG 已开始下载');
      } else {
        await downloadChartXlsx(chart, title, dateFrom, dateTo);
        message.success('图表 XLSX 已开始下载');
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '图表下载失败');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dropdown
      trigger={['click']}
      disabled={!ready || downloading}
      menu={{
        items: [
          { key: 'png', label: '下载 PNG' },
          { key: 'xlsx', label: '下载 XLSX' },
        ],
        onClick: handleDownload,
      }}
    >
      <Button
        type="text"
        autoInsertSpace={false}
        disabled={!ready || downloading}
        aria-label={`${title}下载图表`}
        title="下载图表"
        className={`inline-flex h-8 min-w-8 w-8 items-center justify-center rounded-md p-0 text-slate-500 hover:bg-white hover:text-blue-600 ${className}`}
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M3 16a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM9 3a1 1 0 112 0v7.59l2.29-2.3a1 1 0 011.42 1.42l-4 4a1 1 0 01-1.42 0l-4-4a1 1 0 011.42-1.42L9 10.59V3z" clipRule="evenodd" />
        </svg>
      </Button>
    </Dropdown>
  );
}
