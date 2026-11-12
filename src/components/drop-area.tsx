'use client';

import { useDropzone, type Accept, type FileRejection } from 'react-dropzone';

type Props = {
  /** react-dropzone 的 accept，例如 { 'image/*': [] }。 */
  accept: Accept;
  maxSize?: number;
  multiple?: boolean;
  disabled?: boolean;
  /** 已经有结果时收成一条窄栏。 */
  compact?: boolean;
  onFiles: (files: File[], rejected: FileRejection[]) => void;
  title: string;
  hint?: string;
  compactTitle?: string;
  compactButton?: string;
  /** 拖放区中间的小图，一般就是首页卡片上的那张预览图。 */
  preview?: React.ReactNode;
  inputLabel: string;
};

/** 所有工具共用的拖放区。 */
export default function DropArea({ accept, maxSize, multiple = true, disabled, compact, onFiles, title, hint, compactTitle = '继续拖入文件', compactButton = '再选一批', preview, inputLabel }: Props) {
  const { getRootProps, getInputProps, open, isDragActive } = useDropzone({ onDrop: onFiles, accept, maxSize, multiple, noClick: true, noKeyboard: true, disabled });
  const pick = () => { if (!disabled) open(); };
  return (
    <div {...getRootProps({ className: 'drop' + (isDragActive ? ' dragging' : '') + (compact ? ' compact' : '') + (disabled ? ' disabled' : ''), onClick: pick })}
      role="button" tabIndex={0} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pick(); } }}>
      <input {...getInputProps()} aria-label={inputLabel} />
      {compact ? (
        <><span className="drop-title">{isDragActive ? '松开开始处理' : compactTitle}</span><span className="button ghost">{compactButton}</span></>
      ) : (
        <>
          {preview}
          <span className="drop-title">{isDragActive ? '松开开始处理' : title}</span>
          {hint && <span className="drop-hint">{hint}</span>}
          <span className="button">选择文件</span>
        </>
      )}
    </div>
  );
}
