/** 通用的「A 变成 B」预览图，转换类工具可以直接用：<ConvertPreview from=".heic" to=".jpg" /> */
export default function ConvertPreview({ from, to, before, children }: { from: string; to: string; before?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="convert-preview" aria-hidden="true">
      <span className="file">{before}<b>{from}</b></span>
      <span className="flow"><i /><i /><i /></span>
      <span className="file out">{children}<b>{to}</b></span>
    </div>
  );
}
