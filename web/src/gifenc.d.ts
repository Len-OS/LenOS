declare module "gifenc" {
  export function GIFEncoder(): {
    writeFrame(
      indexed: Uint8Array,
      width: number,
      height: number,
      opts?: { palette?: Uint8Array; delay?: number; repeat?: number },
    ): void;
    finish(): void;
    bytesView(): Uint8Array;
  };
  export function quantize(pixels: Uint8Array, maxColors: number): Uint8Array;
  export function applyPalette(pixels: Uint8Array, palette: Uint8Array): Uint8Array;
}
