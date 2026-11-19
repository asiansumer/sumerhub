/** 首页卡片和拖放区共用的小图：三行歌词，中间那行唱到一半，下面是录音的波形。 */
export default function SingAlongPreview() {
  return (
    <div className="sing-preview" aria-hidden="true">
      <span className="words"><i /><i className="now"><b /></i><i /></span>
      <span className="take"><em />{Array.from({ length: 14 }, (_, i) => <u key={i} />)}</span>
    </div>
  );
}
