import ConvertPreview from '@/components/convert-preview';

/** 首页卡片和拖放区共用的小图：一张大图变小。 */
export default function ImageCompressPreview() {
  const picture = <i className="picture" />;
  return <ConvertPreview from="4.2 MB" to="680 KB" before={picture}>{picture}</ConvertPreview>;
}
