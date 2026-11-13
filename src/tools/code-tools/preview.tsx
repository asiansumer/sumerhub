/** 首页卡片上的小图：一段挤在一起的代码，变成排整齐的几行。 */
export default function CodeToolsPreview() {
  return (
    <div className="code-preview" aria-hidden="true">
      <span className="sheet raw"><u /><u /><u /></span>
      <span className="flow"><i /><i /><i /></span>
      <span className="sheet neat"><b>{'{'}</b><u /><u /><u /><b>{'}'}</b></span>
    </div>
  );
}
