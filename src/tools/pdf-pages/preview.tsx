/** 首页卡片和拖放区共用的小图：几页纸叠成一份。 */
export default function PdfPagesPreview() {
  const lines = <><u /><u /><u /></>;
  return (
    <div className="pdf-preview" aria-hidden="true">
      <span className="sheet">{lines}<b>1</b></span>
      <span className="sheet">{lines}<b>2</b></span>
      <span className="sheet">{lines}<b>3</b></span>
    </div>
  );
}
