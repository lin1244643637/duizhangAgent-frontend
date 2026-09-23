import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Modal, Table, type TableColumnsType } from 'antd';
import type { WorkSheet } from 'xlsx-js-style';
import { useIsMobile } from '../hooks/useIsMobile';

export type TableDisplayPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages?: number;
  pageSizeOptions?: number[];
  loading?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

export type TableDisplayValue = string | number | null | undefined;
export type TableDisplayComparisonTone = 'positive' | 'negative' | 'neutral';
export type TableDisplayComparison = {
  label?: string;
  value: TableDisplayValue;
  tone?: TableDisplayComparisonTone;
};
export type TableDisplayCell = TableDisplayValue | {
  value: TableDisplayValue;
  comparison?: TableDisplayComparison;
  comparisons?: TableDisplayComparison[];
};

export type TableDisplayData = {
  title?: string;
  headers: string[];
  rows: TableDisplayCell[][];
};

interface TableDisplayFrameProps {
  title: string;
  filename?: string;
  children: ReactNode;
  className?: string;
  tableClassName?: string;
  fullscreenPagination?: TableDisplayPagination;
  exportTables?: TableDisplayData[];
  toolbarExtra?: ReactNode;
  subtitle?: ReactNode;
  showFullscreen?: boolean;
  showDownload?: boolean;
}

type FullscreenTableRow = Record<string, string> & { __rowKey: string };

type FullscreenTableData = {
  tableTitle: string;
  headers: string[];
  rows: FullscreenTableRow[];
};

const FULLSCREEN_TABLE_SCROLL_Y = 'calc(100vh - 230px)';

function sanitizeFilename(value: string): string {
  return (value || '表格数据').replace(/[\\/:*?"<>|]/g, '_').trim() || '表格数据';
}

function cellText(cell: Element | undefined): string {
  return (cell?.textContent || '').replace(/\s+/g, ' ').trim();
}

function extractRows(root: HTMLDivElement | null): string[][] {
  const tables = Array.from(root?.querySelectorAll('table') ?? []);
  const ignoredHeaders = new Set(['操作', 'Actions']);
  const allRows: string[][] = [];
  for (const table of tables) {
    const rows = Array.from(table.querySelectorAll('tr'))
      .map((row) => Array.from(row.querySelectorAll('th,td')).map((cell) => (cell.textContent || '').replace(/\s+/g, ' ').trim()))
      .filter((row) => row.some(Boolean));
    if (rows.length === 0) continue;

    const ignoredIndexes = new Set<number>();
    rows[0].forEach((cell, index) => {
      if (ignoredHeaders.has(cell)) ignoredIndexes.add(index);
    });
    if (allRows.length > 0) allRows.push([]);
    allRows.push(...(ignoredIndexes.size === 0 ? rows : rows.map((row) => row.filter((_, index) => !ignoredIndexes.has(index)))));
  }
  return allRows;
}

function parseFullscreenTables(root: HTMLDivElement | null, title: string): FullscreenTableData[] {
  const tables = Array.from(root?.querySelectorAll('table') ?? []);
  return tables.map((table, tableIndex) => {
    const trs = Array.from(table.querySelectorAll('tr'));
    const headerCells = Array.from(trs[0]?.querySelectorAll('th') ?? []);
    const fallbackHeaderCells = headerCells.length ? headerCells : Array.from(trs[0]?.querySelectorAll('th,td') ?? []);
    const headers = fallbackHeaderCells.map((cell, index) => cellText(cell) || `列 ${index + 1}`);
    const rowElements = trs.slice(1);
    const rows = rowElements
      .map((row, rowIndex) => {
        const cells = Array.from(row.querySelectorAll('td'));
        if (headers.length > 1 && cells.length === 1 && cells[0]?.getAttribute('colspan')) return null;
        const item: FullscreenTableRow = { __rowKey: `${tableIndex}-${rowIndex}` };
        headers.forEach((_, columnIndex) => {
          item[`c${columnIndex}`] = cellText(cells[columnIndex]) || '-';
        });
        return item;
      })
      .filter((row): row is FullscreenTableRow => Boolean(row));
    return {
      tableTitle: tables.length > 1 ? `${title} ${tableIndex + 1}` : title,
      headers,
      rows,
    };
  }).filter((table) => table.headers.length > 0);
}

type DownloadSheetData = {
  rows: string[][];
  tones: Array<Array<TableDisplayComparisonTone | undefined>>;
};

function valueText(value: TableDisplayValue): string {
  return value == null ? '' : String(value);
}

function isComparisonCell(cell: TableDisplayCell): cell is Exclude<TableDisplayCell, TableDisplayValue> {
  return typeof cell === 'object' && cell !== null && 'value' in cell;
}

function primaryCellText(cell: TableDisplayCell): string {
  return valueText(isComparisonCell(cell) ? cell.value : cell);
}

function cellComparisons(cell: TableDisplayCell): TableDisplayComparison[] {
  if (!isComparisonCell(cell)) return [];
  if (cell.comparisons?.length) return cell.comparisons;
  return cell.comparison ? [cell.comparison] : [];
}

function comparisonLabel(comparison: TableDisplayComparison): string {
  return comparison.label || '较上期';
}

function normalizeExplicitTables(tables: TableDisplayData[], title: string): FullscreenTableData[] {
  return tables.map((table, tableIndex) => ({
    tableTitle: table.title || (tables.length > 1 ? `${title} ${tableIndex + 1}` : title),
    headers: table.headers,
    rows: table.rows.map((row, rowIndex) => {
      const item: FullscreenTableRow = { __rowKey: `${tableIndex}-${rowIndex}` };
      table.headers.forEach((_, columnIndex) => {
        item[`c${columnIndex}`] = primaryCellText(row[columnIndex]) || '-';
      });
      return item;
    }),
  })).filter((table) => table.headers.length > 0);
}

function explicitDownloadData(tables: TableDisplayData[], title: string): DownloadSheetData {
  const includeTitles = tables.length > 1;
  const rows: string[][] = [];
  const tones: Array<Array<TableDisplayComparisonTone | undefined>> = [];
  tables.forEach((table, index) => {
    const comparisonHeaders = new Map<number, string[]>();
    table.rows.forEach((row) => {
      table.headers.forEach((_, columnIndex) => {
        const labels = comparisonHeaders.get(columnIndex) || [];
        cellComparisons(row[columnIndex]).forEach((comparison) => {
          const label = comparisonLabel(comparison);
          if (!labels.includes(label)) labels.push(label);
        });
        if (labels.length) comparisonHeaders.set(columnIndex, labels);
      });
    });
    if (index > 0) {
      rows.push([]);
      tones.push([]);
    }
    if (includeTitles) {
      rows.push([table.title || `${title} ${index + 1}`]);
      tones.push([]);
    }
    rows.push(table.headers.flatMap((header, columnIndex) => [
      header,
      ...(comparisonHeaders.get(columnIndex) || []).map(label => `${header}${label}`),
    ]));
    tones.push([]);
    table.rows.forEach((row) => {
      const exportRow: string[] = [];
      const toneRow: Array<TableDisplayComparisonTone | undefined> = [];
      table.headers.forEach((_, columnIndex) => {
        const cell = row[columnIndex];
        exportRow.push(primaryCellText(cell));
        toneRow.push(undefined);
        const comparisons = cellComparisons(cell);
        (comparisonHeaders.get(columnIndex) || []).forEach((label) => {
          const comparison = comparisons.find(item => comparisonLabel(item) === label);
          exportRow.push(valueText(comparison?.value));
          toneRow.push(comparison?.tone);
        });
      });
      rows.push(exportRow);
      tones.push(toneRow);
    });
  });
  return { rows, tones };
}

function buildFullscreenColumns(headers: string[], rows: FullscreenTableRow[]): TableColumnsType<FullscreenTableRow> {
  return headers.map((header, index) => {
    const key = `c${index}`;
    const values = Array.from(new Set(rows.map((row) => row[key]).filter(Boolean))).slice(0, 1000);
    return {
      title: header,
      dataIndex: key,
      key,
      minWidth: 120,
      filters: values.map((value) => ({
        text: value.length > 80 ? `${value.slice(0, 80)}...` : value,
        value,
      })),
      filterSearch: true,
      onFilter: (value, record) => record[key] === String(value),
      render: (value) => (
        <span className="block min-w-[96px] whitespace-pre-wrap break-words text-slate-700">
          {String(value ?? '-')}
        </span>
      ),
    };
  });
}

function columnName(index: number): string {
  let value = index + 1;
  let name = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function displayWidth(value: string): number {
  return Array.from(value).reduce((width, character) => width + (character.charCodeAt(0) > 255 ? 2 : 1), 0);
}

function styleWorksheet(
  worksheet: WorkSheet,
  rows: string[][],
  tones: DownloadSheetData['tones'] = [],
) {
  const sheet = worksheet as WorkSheet & Record<string, any>;
  const headerRows = new Set<number>();
  const titleRows = new Set<number>();
  let expectHeader = true;

  rows.forEach((row, rowIndex) => {
    const nonEmpty = row.filter(Boolean).length;
    if (nonEmpty === 0) {
      expectHeader = true;
      return;
    }
    const nextNonEmpty = rows[rowIndex + 1]?.filter(Boolean).length || 0;
    if (nonEmpty === 1 && nextNonEmpty > 1) {
      titleRows.add(rowIndex);
      expectHeader = true;
      return;
    }
    if (expectHeader) {
      headerRows.add(rowIndex);
      expectHeader = false;
    }
  });

  const thinBorder = {
    top: { style: 'thin', color: { rgb: 'CBD5E1' } },
    right: { style: 'thin', color: { rgb: 'CBD5E1' } },
    bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
    left: { style: 'thin', color: { rgb: 'CBD5E1' } },
  };
  rows.forEach((row, rowIndex) => {
    row.forEach((_, columnIndex) => {
      const cell = sheet[`${columnName(columnIndex)}${rowIndex + 1}`];
      if (!cell) return;
      const isHeader = headerRows.has(rowIndex);
      const isTitle = titleRows.has(rowIndex);
      const tone = !isHeader && !isTitle ? tones[rowIndex]?.[columnIndex] : undefined;
      const fontColor = tone === 'positive'
        ? '059669'
        : tone === 'negative'
          ? 'EF4444'
          : tone === 'neutral'
            ? '94A3B8'
            : isTitle
              ? '1D4ED8'
              : isHeader
                ? '334155'
                : '475569';
      cell.s = {
        border: thinBorder,
        alignment: {
          vertical: 'center',
          horizontal: isHeader || isTitle ? 'center' : 'left',
          wrapText: true,
        },
        font: {
          bold: isHeader || isTitle,
          color: { rgb: fontColor },
          sz: isTitle ? 13 : 11,
        },
        fill: {
          patternType: 'solid',
          fgColor: { rgb: isTitle ? 'EFF6FF' : isHeader ? 'E2E8F0' : rowIndex % 2 === 0 ? 'F8FAFC' : 'FFFFFF' },
        },
      };
    });
  });
  const columnCount = rows.reduce((count, row) => Math.max(count, row.length), 0);
  sheet['!cols'] = Array.from({ length: columnCount }, (_, columnIndex) => {
    const width = rows.reduce((maximum, row) => Math.max(maximum, displayWidth(String(row[columnIndex] ?? ''))), 0);
    return { wch: Math.min(36, Math.max(12, width + 2)) };
  });
  sheet['!rows'] = rows.map((_, rowIndex) => ({ hpt: headerRows.has(rowIndex) || titleRows.has(rowIndex) ? 24 : 21 }));
  const firstHeader = [...headerRows][0];
  if (firstHeader !== undefined) {
    sheet['!freeze'] = { xSplit: 0, ySplit: firstHeader + 1 };
  }
}

async function downloadXlsx(data: DownloadSheetData, filename: string) {
  if (data.rows.length === 0) return;
  const XLSX = await import('xlsx-js-style');
  const ws = XLSX.utils.aoa_to_sheet(data.rows);
  styleWorksheet(ws, data.rows, data.tones);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, `${sanitizeFilename(filename)}.xlsx`);
}

export function TableDisplayFrame({
  title,
  filename,
  children,
  className = '',
  tableClassName = '',
  fullscreenPagination,
  exportTables,
  toolbarExtra,
  subtitle,
  showFullscreen = true,
  showDownload = true,
}: TableDisplayFrameProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenTables, setFullscreenTables] = useState<FullscreenTableData[]>([]);
  const tableRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const exportName = filename || title || '表格数据';
  const useStructuredFullscreen = Boolean(fullscreenPagination || exportTables?.length);

  useEffect(() => {
    if (!fullscreen || !useStructuredFullscreen) return;
    setFullscreenTables(exportTables ? normalizeExplicitTables(exportTables, title) : parseFullscreenTables(tableRef.current, title));
  }, [children, exportTables, fullscreen, title, useStructuredFullscreen]);

  function handleDownload() {
    const data = exportTables
      ? explicitDownloadData(exportTables, title)
      : { rows: extractRows(tableRef.current), tones: [] };
    void downloadXlsx(data, exportName);
  }

  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-xs font-medium text-slate-500">{title}</div>
        {subtitle ? <div className="mt-0.5 truncate text-sm font-semibold text-slate-800">{subtitle}</div> : null}
      </div>
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        {toolbarExtra}
        <div className="flex shrink-0 items-center gap-1">
        {showFullscreen && (
          <Button
            type="text"
            autoInsertSpace={false}
            onClick={() => setFullscreen(true)}
            className="inline-flex h-8 min-w-8 w-8 items-center justify-center rounded-md p-0 text-slate-500 transition hover:bg-white hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100 md:h-7 md:min-w-7 md:w-7"
            title="全屏展示"
            aria-label={`${title}全屏展示`}
          >
            <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M4 3a1 1 0 00-1 1v4a1 1 0 102 0V5h3a1 1 0 000-2H4zm8 0a1 1 0 100 2h3v3a1 1 0 102 0V4a1 1 0 00-1-1h-4zM4 11a1 1 0 011 1v3h3a1 1 0 110 2H4a1 1 0 01-1-1v-4a1 1 0 011-1zm12 0a1 1 0 00-1 1v3h-3a1 1 0 100 2h4a1 1 0 001-1v-4a1 1 0 00-1-1z" />
            </svg>
          </Button>
        )}
        {showDownload && (
          <Button
            type="text"
            autoInsertSpace={false}
            onClick={handleDownload}
            className="inline-flex h-8 min-w-8 w-8 items-center justify-center rounded-md p-0 text-slate-500 transition hover:bg-white hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100 md:h-7 md:min-w-7 md:w-7"
            title="下载表格"
            aria-label={`${title}下载表格`}
          >
            <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </Button>
        )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className={`overflow-hidden ${className}`}>
        {toolbar}
        <div ref={tableRef} className={tableClassName}>
          {children}
        </div>
      </div>
      <Modal
        open={fullscreen}
        centered
        closable={false}
        footer={null}
        getContainer={false}
        keyboard
        mask={{ closable: false }}
        width={isMobile ? '100vw' : 'calc(100vw - 32px)'}
        zIndex={1000}
        onCancel={() => setFullscreen(false)}
        styles={{
          container: { padding: 0, borderRadius: isMobile ? 0 : 12, overflow: 'hidden' },
          body: { padding: 0 },
        }}
      >
        <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-white shadow-2xl md:h-[calc(100vh-32px)] md:rounded-xl">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <h2 className="min-w-0 truncate text-sm font-semibold text-slate-800">{title}</h2>
            <div className="flex shrink-0 items-center gap-2">
              {showDownload && (
                <Button
                  autoInsertSpace={false}
                  onClick={handleDownload}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-100"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                  下载
                </Button>
              )}
              <Button
                type="text"
                autoInsertSpace={false}
                onClick={() => setFullscreen(false)}
                className="inline-flex h-8 min-w-8 w-8 items-center justify-center rounded-lg p-0 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
                title="关闭"
                aria-label="关闭全屏表格"
              >
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden p-2 md:p-4">
            <div className="table-fullscreen-content h-full min-w-0">
              {!useStructuredFullscreen ? (
                <div className={`h-full overflow-auto ${tableClassName}`}>
                  {children}
                </div>
              ) : fullscreenTables.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-slate-400">暂无可展示的表格数据</p>
              ) : fullscreenTables.map((item, index) => (
                <div key={`${item.tableTitle}-${index}`} className={index > 0 ? 'mt-6 h-full min-h-0' : 'h-full min-h-0'}>
                  {fullscreenTables.length > 1 && (
                    <h3 className="mb-2 text-xs font-semibold text-slate-500">{item.tableTitle}</h3>
                  )}
                  <Table<FullscreenTableRow>
                    columns={buildFullscreenColumns(item.headers, item.rows)}
                    dataSource={item.rows}
                    loading={fullscreenPagination?.loading}
                    rowKey="__rowKey"
                    size="small"
                    bordered
                    scroll={{ x: 'max-content', y: isMobile ? 'calc(100dvh - 190px)' : FULLSCREEN_TABLE_SCROLL_Y }}
                    pagination={fullscreenPagination && fullscreenTables.length === 1 ? {
                      current: fullscreenPagination.page,
                      pageSize: fullscreenPagination.pageSize,
                      total: fullscreenPagination.total,
                      position: ['bottomRight'],
                      showSizeChanger: true,
                      pageSizeOptions: (fullscreenPagination.pageSizeOptions || [10, 20, 50, 100]).map(String),
                      showTotal: (total, range) => `共 ${total} 条，第 ${range[0]}-${range[1]} 条`,
                      onChange: (page, pageSize) => {
                        if (pageSize !== fullscreenPagination.pageSize) {
                          fullscreenPagination.onPageSizeChange(pageSize);
                          return;
                        }
                        fullscreenPagination.onPageChange(page);
                      },
                    } : (item.rows.length > 20 ? {
                      defaultPageSize: 20,
                      position: ['bottomRight'],
                      showSizeChanger: true,
                      pageSizeOptions: ['10', '20', '50', '100'],
                      showTotal: (total) => `共 ${total} 条`,
                    } : false)}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
