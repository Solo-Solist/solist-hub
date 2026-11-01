declare module 'zgapdfsigner' {
  export interface SignOption {
    p12cert: ArrayBuffer;
    pwd: string;
    reason?: string;
    location?: string;
    contact?: string;
    drawinf?: {
      area: { x: number; y: number; w: number; h: number };
      pageidx: number | string;
      imgInfo?: { imgData: ArrayBuffer; imgType: string };
      textInfo?: { text: string; size: number; color: string };
    };
  }

  export class PdfSigner {
    constructor(options: Record<string, unknown>);
    sign(pdfBytes: Uint8Array): Promise<ArrayBuffer>;
  }
}
