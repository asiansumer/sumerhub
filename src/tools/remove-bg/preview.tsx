import ConvertPreview from '@/components/convert-preview';

/** 首页卡片和拖放区共用的小图：一张照片变成透明底上的主体。 */
export default function RemoveBgPreview() {
  return <ConvertPreview from="照片" to="透明" before={<i className="picture" />}><i className="subject" /></ConvertPreview>;
}
