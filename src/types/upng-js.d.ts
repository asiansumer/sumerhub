declare module 'upng-js' {
  const UPNG: {
    /** cnum = 0 表示无损；其他值是调色板的颜色数（有损量化）。 */
    encode(frames: ArrayBuffer[], width: number, height: number, cnum: number): ArrayBuffer;
  };
  export default UPNG;
}
