declare module "bwip-js" {
  type ToBufferOptions = Record<string, unknown>;

  type ToBufferCallback = (error: Error | null, buffer: Buffer | undefined) => void;

  export function toBuffer(
    options: ToBufferOptions,
    callback: ToBufferCallback,
  ): void;

  const bwipjs: {
    toBuffer: typeof toBuffer;
  };

  export default bwipjs;
}
