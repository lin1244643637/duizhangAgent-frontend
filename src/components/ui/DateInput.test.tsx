import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DateInput } from './DateInput';

describe('DateInput', () => {
  it('keeps native date input behavior while using the shared input wrapper', () => {
    const onChange = vi.fn();

    render(<DateInput label="账期" value="2026-07-03" onChange={onChange} helper="北京时间" />);

    const input = screen.getByLabelText('账期') as HTMLInputElement;
    expect(input.type).toBe('date');
    expect(screen.getByText('北京时间')).toBeTruthy();

    fireEvent.change(input, { target: { value: '2026-07-04' } });
    expect(onChange).toHaveBeenCalledWith('2026-07-04');
  });
});
