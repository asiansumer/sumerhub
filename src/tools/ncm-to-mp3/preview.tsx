import './preview.css';

/** 首页卡片和拖放区共用的小图：一个 .ncm 文件变成 .mp3。纯 HTML/CSS，没有图片。 */
export default function NcmPreview() {
  return (
    <div className="ncm-preview" aria-hidden="true">
      <span className="file"><i className="lock" /><b>.ncm</b></span>
      <span className="flow"><i /><i /><i /></span>
      <span className="file out"><i className="wave"><u /><u /><u /><u /><u /></i><b>.mp3</b></span>
    </div>
  );
}
