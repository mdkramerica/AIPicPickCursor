declare module 'heic-convert' {
  function convert(input: Buffer | Uint8Array, options?: {
    format?: 'JPEG' | 'PNG';
    quality?: number;
  }): Promise<Buffer>;
  
  export = convert;
}
