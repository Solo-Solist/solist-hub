import { describe, it, expect } from 'vitest';
import { decodePdfFilename, cleanFilename } from '@/lib/pdf/utils/filename-decoder';

/**
 * Helper to simulate OCaml js_of_ocaml Latin-1 string conversion
 * Converts a UTF-8 string into a binary byte string where charCodeAt(i) === byte
 */
function toLatin1ByteString(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let res = '';
  for (let i = 0; i < bytes.length; i++) {
    res += String.fromCharCode(bytes[i]);
  }
  return res;
}

describe('PDF Filename Decoder', () => {
  describe('UTF-8 Mojibake Recovery', () => {
    it('correctly decodes the user reported mojibake for Chinese filename "程佑附件.pdf"', () => {
      const original = '程佑附件.pdf';
      const mojibake = toLatin1ByteString(original);
      
      // Verify mojibake has expected characters (ç¨...ä½...é...ä»¶)
      expect(mojibake.charCodeAt(0)).toBe(0xe7);
      expect(mojibake.charCodeAt(1)).toBe(0xa8);
      
      const decoded = decodePdfFilename(mojibake);
      expect(decoded).toBe('程佑附件.pdf');
    });

    it('correctly decodes complex Chinese filenames with spaces and symbols', () => {
      const original = '2024年度财务审计报告 (最终修订版).xlsx';
      const mojibake = toLatin1ByteString(original);
      expect(decodePdfFilename(mojibake)).toBe(original);
    });

    it('correctly decodes Japanese filenames', () => {
      const original = '見積書_最新版_2024.pdf';
      const mojibake = toLatin1ByteString(original);
      expect(decodePdfFilename(mojibake)).toBe(original);
    });

    it('correctly decodes Korean filenames', () => {
      const original = '계약서_최종본_서명완료.docx';
      const mojibake = toLatin1ByteString(original);
      expect(decodePdfFilename(mojibake)).toBe(original);
    });

    it('correctly decodes European accented filenames', () => {
      const original = 'Rapport_financier_d\'été_2024.pdf';
      const mojibake = toLatin1ByteString(original);
      expect(decodePdfFilename(mojibake)).toBe(original);

      const german = 'Geschäftsbericht_Überweisung.pdf';
      const germanMojibake = toLatin1ByteString(german);
      expect(decodePdfFilename(germanMojibake)).toBe(german);
    });

    it('recovers slightly corrupted UTF-8 byte streams via loose UTF-8 without falling back to Latin-1', () => {
      // Append a trailing incomplete byte (0x80) to a valid UTF-8 string
      const original = '程佑附件.pdf';
      const bytes = new TextEncoder().encode(original);
      const corruptedBytes = new Uint8Array(bytes.length + 1);
      corruptedBytes.set(bytes);
      corruptedBytes[bytes.length] = 0x80; // Incomplete UTF-8 continuation byte

      let corruptedStr = '';
      for (let i = 0; i < corruptedBytes.length; i++) {
        corruptedStr += String.fromCharCode(corruptedBytes[i]);
      }

      const decoded = decodePdfFilename(corruptedStr);
      // Chinese characters should still be recovered, NOT ruined into 'ç¨‹ä½‘...'
      expect(decoded).toContain('程佑附件.pdf');
    });
  });

  describe('Preservation of Valid Strings', () => {
    it('preserves already decoded Unicode strings without corrupting them', () => {
      const original = '程佑附件.pdf';
      expect(decodePdfFilename(original)).toBe(original);
    });

    it('preserves standard ASCII filenames', () => {
      expect(decodePdfFilename('document.pdf')).toBe('document.pdf');
      expect(decodePdfFilename('report_final_v2.docx')).toBe('report_final_v2.docx');
      expect(decodePdfFilename('archive-2024-09.tar.gz')).toBe('archive-2024-09.tar.gz');
    });
  });

  describe('UTF-16 with BOM', () => {
    it('decodes UTF-16BE strings with BOM (0xFE 0xFF)', () => {
      // "程佑.pdf" in UTF-16BE:
      // 程: 0x7A 0x0B
      // 佑: 0x4F 0x51
      // .: 0x00 0x2E
      // p: 0x00 0x70
      // d: 0x00 0x64
      // f: 0x00 0x66
      const utf16beBytes = [
        0xfe, 0xff,
        0x7a, 0x0b,
        0x4f, 0x51,
        0x00, 0x2e,
        0x00, 0x70,
        0x00, 0x64,
        0x00, 0x66
      ];
      let utf16beStr = '';
      for (const b of utf16beBytes) {
        utf16beStr += String.fromCharCode(b);
      }

      expect(decodePdfFilename(utf16beStr)).toBe('程佑.pdf');
    });

    it('decodes UTF-16LE strings with BOM (0xFF 0xFE)', () => {
      // "程佑.pdf" in UTF-16LE
      const utf16leBytes = [
        0xff, 0xfe,
        0x0b, 0x7a,
        0x51, 0x4f,
        0x2e, 0x00,
        0x70, 0x00,
        0x64, 0x00,
        0x66, 0x00
      ];
      let utf16leStr = '';
      for (const b of utf16leBytes) {
        utf16leStr += String.fromCharCode(b);
      }

      expect(decodePdfFilename(utf16leStr)).toBe('程佑.pdf');
    });
  });

  describe('UTF-8 with BOM', () => {
    it('decodes UTF-8 strings with BOM (0xEF 0xBB 0xBF)', () => {
      const original = '附件_带BOM.pdf';
      const utf8Bytes = new TextEncoder().encode(original);
      const withBom = [0xef, 0xbb, 0xbf, ...utf8Bytes];
      let bomStr = '';
      for (const b of withBom) {
        bomStr += String.fromCharCode(b);
      }

      expect(decodePdfFilename(bomStr)).toBe('附件_带BOM.pdf');
    });
  });

  describe('Special PDF Escapes and Encodings', () => {
    it('unescapes octal sequences', () => {
      // Octal for '程': 0xE7 = 347, 0xA8 = 250, 0x8B = 213
      const octalStr = '\\347\\250\\213.txt';
      expect(decodePdfFilename(octalStr)).toBe('程.txt');
    });

    it('decodes percent-encoded URI filenames', () => {
      const uriEncoded = '%E7%A8%8B%E4%BD%91%E9%99%84%E4%BB%B6.pdf';
      expect(decodePdfFilename(uriEncoded)).toBe('程佑附件.pdf');
    });
  });

  describe('Filename Cleaning and Sanitization', () => {
    it('strips Windows directory paths', () => {
      expect(cleanFilename('C:\\Users\\User\\Documents\\程佑附件.pdf')).toBe('程佑附件.pdf');
      expect(decodePdfFilename('D:\\data\\report.pdf')).toBe('report.pdf');
    });

    it('strips Unix directory paths', () => {
      expect(cleanFilename('/var/opt/files/程佑附件.pdf')).toBe('程佑附件.pdf');
      expect(decodePdfFilename('/home/user/document.pdf')).toBe('document.pdf');
    });

    it('removes null bytes and control characters', () => {
      expect(cleanFilename('程佑附件.pdf\0\0')).toBe('程佑附件.pdf');
      expect(cleanFilename('\r\nfile.txt\r\n')).toBe('file.txt');
    });

    it('handles empty or invalid inputs gracefully', () => {
      expect(decodePdfFilename('')).toBe('');
      expect(decodePdfFilename(null)).toBe('');
      expect(decodePdfFilename(undefined)).toBe('');
    });
  });

  describe('js_of_ocaml Internal Objects', () => {
    it('correctly handles js_of_ocaml string objects with .c property', () => {
      const ocamlObj = {
        t: 0,
        c: toLatin1ByteString('程佑附件.docx'),
        l: 17,
      };
      expect(decodePdfFilename(ocamlObj)).toBe('程佑附件.docx');
    });

    it('correctly handles objects with custom toString() implementation', () => {
      const customObj = {
        toString() {
          return toLatin1ByteString('项目验收清单.pdf');
        },
      };
      expect(decodePdfFilename(customObj)).toBe('项目验收清单.pdf');
    });
  });
});

