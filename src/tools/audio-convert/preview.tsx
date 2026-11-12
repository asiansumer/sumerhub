import ConvertPreview from '@/components/convert-preview';

/** 首页卡片和拖放区共用的小图：一个视频文件变成带波形的 .mp3。 */
export default function AudioConvertPreview() {
  return <ConvertPreview from=".mp4" to=".mp3" before={<i className="clip" />}><i className="wave"><u /><u /><u /><u /><u /></i></ConvertPreview>;
}
