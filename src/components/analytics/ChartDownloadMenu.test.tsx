import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChartDownloadMenu } from './ChartDownloadMenu';

describe('ChartDownloadMenu', () => {
  it('is disabled before its chart instance is ready', () => {
    render(<ChartDownloadMenu chartRef={createRef()} title="净实收趋势" />);

    expect((screen.getByRole('button', { name: '净实收趋势下载图表' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
