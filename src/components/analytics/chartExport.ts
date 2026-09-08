import type { ECharts } from 'echarts/core';

type ExportCell = string | number | null;
type ExportRows = ExportCell[][];
type OptionRecord = Record<string, unknown>;

function asRecord(value: unknown): OptionRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as OptionRecord
    : null;
}

function firstRecord(value: unknown): OptionRecord | null {
  return asRecord(Array.isArray(value) ? value[0] : value);
}

function asRecords(value: unknown): OptionRecord[] {
  return (Array.isArray(value) ? value : [value])
    .flatMap(item => asRecord(item) ? [asRecord(item)!] : []);
}

function dataValue(value: unknown): ExportCell {
  const record = asRecord(value);
  const raw = record?.value ?? value;
  return typeof raw === 'string' || typeof raw === 'number' ? raw : null;
}

function axisData(option: OptionRecord, axis: 'xAxis' | 'yAxis'): unknown[] {
  const component = firstRecord(option[axis]);
  return Array.isArray(component?.data) ? component.data : [];
}

function seriesName(series: OptionRecord, index: number): string {
  return String(series.name || `系列 ${index + 1}`);
}

export function chartRowsFromOption(option: unknown): ExportRows {
  const root = asRecord(option);
  if (!root) return [];
  const series = asRecords(root.series);
  if (series.length === 0) return [];

  const xData = axisData(root, 'xAxis');
  const yData = axisData(root, 'yAxis');
  const categories = xData.length > 0 ? xData : yData;
  if (categories.length > 0) {
    const axis = xData.length > 0 ? firstRecord(root.xAxis) : firstRecord(root.yAxis);
    const header = String(axis?.name || (xData.length > 0 ? '周期' : '分类'));
    return [
      [header, ...series.map(seriesName)],
      ...categories.map((category, rowIndex) => [
        dataValue(category),
        ...series.map(item => dataValue((Array.isArray(item.data) ? item.data : [])[rowIndex])),
      ]),
    ];
  }

  const pie = series[0];
  const pieData = Array.isArray(pie.data) ? pie.data : [];
  if (pieData.every(item => asRecord(item)?.name != null)) {
    return [
      ['分类', seriesName(pie, 0)],
      ...pieData.map(item => {
        const record = asRecord(item)!;
        return [String(record.name), dataValue(record)];
      }),
    ];
  }

  return [];
}

function sanitizeFilename(value: string): string {
  return (value || '图表数据').replace(/[\\/:*?"<>|]/g, '_').trim() || '图表数据';
}

export function chartFilename(
  title: string,
  dateFrom?: string,
  dateTo?: string,
  extension: 'png' | 'xlsx' = 'png',
): string {
  const range = dateFrom && dateTo ? `_${dateFrom}_${dateTo}` : '';
  return `${sanitizeFilename(title)}${range}.${extension}`;
}

function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图表图片生成失败'));
    image.src = src;
  });
}

export async function downloadChartPng(
  chart: ECharts,
  title: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<void> {
  const svgDataUrl = chart.getDataURL({ type: 'svg', backgroundColor: '#ffffff' });
  const image = await loadImage(svgDataUrl);
  const ratio = 2;
  const width = Math.max(1, Math.round(chart.getWidth() * ratio));
  const height = Math.max(1, Math.round(chart.getHeight() * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器不支持图表图片导出');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  downloadDataUrl(canvas.toDataURL('image/png'), chartFilename(title, dateFrom, dateTo, 'png'));
}

export async function downloadChartXlsx(
  chart: ECharts,
  title: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<void> {
  const rows = chartRowsFromOption(chart.getOption());
  if (rows.length === 0) throw new Error('当前图表没有可导出的数据');
  const XLSX = await import('xlsx');
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '图表数据');
  XLSX.writeFile(workbook, chartFilename(title, dateFrom, dateTo, 'xlsx'));
}
