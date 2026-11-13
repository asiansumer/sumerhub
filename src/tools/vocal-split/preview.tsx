/** 首页卡片和拖放区共用的小图：一条波形分成人声和伴奏两条。 */
export default function VocalSplitPreview() {
  const bars = (count: number) => Array.from({ length: count }, (_, i) => <u key={i} />);
  return (
    <div className="split-preview" aria-hidden="true">
      <span className="lane mix">{bars(9)}</span>
      <span className="fork"><i /><i /></span>
      <span className="lanes">
        <span className="lane voice"><b>人声</b>{bars(6)}</span>
        <span className="lane band"><b>伴奏</b>{bars(6)}</span>
      </span>
    </div>
  );
}
