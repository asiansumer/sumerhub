/** 首页卡片上的小图：节拍的点和调音的指针。 */
export default function MetronomeTunerPreview() {
  return (
    <div className="pocket-preview" aria-hidden="true">
      <span className="tile beat"><i /><i /><i /><i /></span>
      <span className="tile gauge"><i /><b /></span>
    </div>
  );
}
