import ConvertPreview from '@/components/convert-preview';

/** 首页卡片和拖放区共用的小图：一个 .ncm 文件变成带波形的 .mp3。 */
export default function NcmPreview() {
  return <ConvertPreview from=".ncm" to=".mp3" before={<i className="lock" />}><i className="wave"><u /><u /><u /><u /><u /></i></ConvertPreview>;
}
