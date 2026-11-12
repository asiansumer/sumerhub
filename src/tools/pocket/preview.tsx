/** 首页卡片上的小图：节拍的点、调音的指针、一个二维码角。 */
export default function PocketPreview() {
  return (
    <div className="pocket-preview" aria-hidden="true">
      <span className="tile beat"><i /><i /><i /><i /></span>
      <span className="tile gauge"><i /><b /></span>
      <span className="tile code"><i /><i /><i /><u /></span>
    </div>
  );
}
