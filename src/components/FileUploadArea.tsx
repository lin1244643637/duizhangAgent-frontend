import { Button, Upload } from 'antd';

interface Props {
  files: File[];
  onFilesChange: (files: File[]) => void;
  onClose: () => void;
}

export function FileUploadArea({ files, onFilesChange, onClose }: Props) {
  function removeFile(idx: number) {
    onFilesChange(files.filter((_, i) => i !== idx));
  }

  return (
    <div className="border-t border-slate-200 bg-white p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-600">上传账单文件（随消息一起发送）</span>
        <Button
          autoInsertSpace={false}
          type="text"
          onClick={onClose}
          className="h-auto border-0 p-0 text-lg leading-none text-slate-400 shadow-none hover:text-slate-600"
        >
          &times;
        </Button>
      </div>

      <div className="border border-dashed border-slate-300 rounded-xl p-3 bg-slate-50">
        <Upload
          accept=".xlsx,.xls,.csv"
          multiple
          showUploadList={false}
          beforeUpload={(file, fileList) => {
            if (file.uid === fileList[fileList.length - 1]?.uid) onFilesChange([...files, ...fileList]);
            return Upload.LIST_IGNORE;
          }}
        >
          <Button
            autoInsertSpace={false}
            type="text"
            className="h-auto w-full border-0 p-0 text-xs text-blue-500 shadow-none transition-colors hover:text-blue-600"
          >
            + 添加账单文件（如 美团_2025-04.xlsx / 招商银行_202504.csv）
          </Button>
        </Upload>
        {files.map((f, i) => (
          <div key={i} className="flex items-center justify-between mt-1.5 text-xs text-slate-600">
            <span className="truncate max-w-[85%]">{f.name}</span>
            <Button
              autoInsertSpace={false}
              type="text"
              onClick={() => removeFile(i)}
              className="ml-1 h-auto border-0 p-0 text-slate-400 shadow-none hover:text-red-500"
            >
              &times;
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
