const bars = [18, 34, 26, 52, 40, 64, 30, 46, 58, 24, 38, 50, 20, 32];

/** 首页卡片和拖放区共用的小图：一段波形，旁边是读出来的速度和调性。 */
export default function AudioAnalyzePreview() {
  return (
    <div className="analyze-preview" aria-hidden="true">
      <span className="bars">{bars.map((height, index) => <i key={index} style={{ height: height + '%' }} />)}</span>
      <span className="readout"><b>128</b><em>BPM</em></span>
      <span className="readout"><b>8A</b><em>A 小调</em></span>
    </div>
  );
}
