/** 首页卡片上的小图：二维码的一角、一串随机字符、一个色块。 */
export default function GeneratorsPreview() {
  return (
    <div className="pocket-preview gen" aria-hidden="true">
      <span className="tile code"><i /><i /><i /><u /></span>
      <span className="tile key"><b>k7#Qm</b><b>••••</b></span>
      <span className="tile swatch"><i /><i /><i /></span>
    </div>
  );
}
