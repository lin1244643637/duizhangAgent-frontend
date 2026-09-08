import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FileUploadArea } from './FileUploadArea';

describe('FileUploadArea', () => {
  it('adds and removes files through callbacks', () => {
    const onFilesChange = vi.fn();
    const onClose = vi.fn();
    const firstFile = new File(['a'], '美团_2025-04.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const { container } = render(
      <FileUploadArea files={[firstFile]} onFilesChange={onFilesChange} onClose={onClose} />,
    );

    fireEvent.click(screen.getAllByText('×')[0]);
    expect(onClose).toHaveBeenCalled();

    const secondFile = new File(['b'], '招商银行_202504.csv', { type: 'text/csv' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [secondFile] } });
    expect(onFilesChange).toHaveBeenCalledWith([firstFile, secondFile]);

    fireEvent.click(screen.getAllByText('×')[1]);
    expect(onFilesChange).toHaveBeenCalledWith([]);
  });
});
