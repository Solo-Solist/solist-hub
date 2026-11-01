/**
 * Extract Attachments Worker
 * Uses coherentpdf to extract file attachments from PDF documents with proper encoding support.
 */

self.importScripts('/coherentpdf.browser.min.js');

const PDF_DOC_ENCODING_MAP = {
  0x18: 0x02D8, 0x19: 0x02C7, 0x1A: 0x02C6, 0x1B: 0x02D9,
  0x1C: 0x02DD, 0x1D: 0x02DB, 0x1E: 0x02DA, 0x1F: 0x02DC,
  0x80: 0x2022, 0x81: 0x2020, 0x82: 0x2021, 0x83: 0x2026,
  0x84: 0x2014, 0x85: 0x2013, 0x86: 0x0192, 0x87: 0x2044,
  0x88: 0x2039, 0x89: 0x203A, 0x8A: 0x2212, 0x8B: 0x2030,
  0x8C: 0x201E, 0x8D: 0x201C, 0x8E: 0x201D, 0x8F: 0x2018,
  0x90: 0x2019, 0x91: 0x201A, 0x92: 0x2122, 0x93: 0xFB01,
  0x94: 0xFB02, 0x95: 0x0141, 0x96: 0x0152, 0x97: 0x0160,
  0x98: 0x0178, 0x99: 0x017D, 0x9A: 0x0131, 0x9B: 0x0142,
  0x9C: 0x0153, 0x9D: 0x0161, 0x9E: 0x017E, 0xA0: 0x20AC,
};

function extractRawString(raw) {
  if (raw == null) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object') {
    if (typeof raw.c === 'string') return raw.c;
    if (typeof raw.toString === 'function') {
      const str = raw.toString();
      if (str && str !== '[object Object]') return str;
    }
  }
  return String(raw);
}

function cleanFilename(name) {
  if (!name) return '';
  let cleaned = name.replace(/[\0\r\n]/g, '').trim();
  cleaned = cleaned.replace(/^.*[/\\]/, '');
  return cleaned;
}

function decodePdfDocEncoding(bytes) {
  let result = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    const mapped = PDF_DOC_ENCODING_MAP[b];
    if (mapped !== undefined) {
      result += String.fromCharCode(mapped);
    } else {
      result += String.fromCharCode(b);
    }
  }
  return result;
}

function decodePdfFilename(raw) {
  if (raw == null) return '';

  let str = extractRawString(raw).trim();
  if (!str) return '';

  // 1. Unescape PDF octal string escapes if present (e.g. \347\250\213)
  if (/\\([0-7]{1,3})/.test(str)) {
    try {
      str = str.replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
    } catch (e) {
      // Continue with original string
    }
  }

  // 2. Unescape URI percent-encoding if present (e.g. %E7%A8%8B)
  if (/%[0-9A-Fa-f]{2}/.test(str)) {
    try {
      const decodedUri = decodeURIComponent(str);
      if (decodedUri !== str) {
        str = decodedUri;
      }
    } catch (e) {
      // Ignore URI decode errors
    }
  }

  // 3. Check if all characters are single-byte (0..255)
  const isByteString = Array.from(str).every(c => c.charCodeAt(0) <= 255);

  if (isByteString) {
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      bytes[i] = str.charCodeAt(i) & 0xff;
    }

    // 3a. UTF-16BE with BOM (0xFE 0xFF)
    if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
      try {
        const decoded = new TextDecoder('utf-16be').decode(bytes.slice(2));
        return cleanFilename(decoded);
      } catch (e) {}
    }

    // 3b. UTF-16LE with BOM (0xFF 0xFE)
    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
      try {
        const decoded = new TextDecoder('utf-16le').decode(bytes.slice(2));
        return cleanFilename(decoded);
      } catch (e) {}
    }

    // 3c. UTF-8 with BOM (0xEF 0xBB 0xBF)
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      try {
        const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes.slice(3));
        return cleanFilename(decoded);
      } catch (e) {}
    }

    // 3d. Check for high bytes (>= 128)
    const hasHighByte = bytes.some(b => b >= 128);

    if (hasHighByte) {
      // Priority 1: Try UTF-8 (strict)
      try {
        const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        return cleanFilename(decoded);
      } catch (e) {}

      // Priority 2: Loose UTF-8 decoding (tolerates minor byte corruption or non-strict sequences)
      try {
        const looseDecoded = new TextDecoder('utf-8').decode(bytes);
        const repCount = (looseDecoded.match(/\uFFFD/g) || []).length;
        if (repCount <= 1 || repCount / looseDecoded.length <= 0.15) {
          return cleanFilename(looseDecoded.replace(/\uFFFD/g, ''));
        }
      } catch (e) {}

      // Priority 3: Try GB18030 / GBK
      try {
        const decoded = new TextDecoder('gb18030', { fatal: true }).decode(bytes);
        if (decoded && !decoded.includes('\uFFFD')) {
          return cleanFilename(decoded);
        }
      } catch (e) {}

      // Priority 4: Safe fallback - avoid damaging Latin-1 conversion on multi-byte sequences
      return cleanFilename(str);
    }
  }

  return cleanFilename(str);
}

function guessExtension(data) {
  if (!data) return 'bin';
  const u8 = new Uint8Array(data);
  if (u8.length >= 4) {
    if (u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46) return 'pdf';
    if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4E && u8[3] === 0x47) return 'png';
    if (u8[0] === 0xFF && u8[1] === 0xD8 && u8[2] === 0xFF) return 'jpg';
    if (u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46) return 'gif';
    if (u8[0] === 0x50 && u8[1] === 0x4B && u8[2] === 0x03 && u8[3] === 0x04) return 'zip';
  }
  return 'bin';
}

function extractAttachmentsFromPDFsInWorker(fileBuffers, fileNames) {
  try {
    const allAttachments = [];
    const totalFiles = fileBuffers.length;

    for (let i = 0; i < totalFiles; i++) {
      const buffer = fileBuffers[i];
      const fileName = fileNames[i];
      const uint8Array = new Uint8Array(buffer);

      let pdf;
      try {
        pdf = coherentpdf.fromMemory(uint8Array, '');
      } catch (error) {
        console.warn(`Failed to load PDF: ${fileName}`, error);
        continue;
      }

      coherentpdf.startGetAttachments(pdf);
      const attachmentCount = coherentpdf.numberGetAttachments();

      if (attachmentCount === 0) {
        console.warn(`No attachments found in ${fileName}`);
        coherentpdf.endGetAttachments();
        coherentpdf.deletePdf(pdf);
        continue;
      }

      const baseName = fileName.replace(/\.pdf$/i, '');
      for (let j = 0; j < attachmentCount; j++) {
        try {
          const rawAttachmentName = coherentpdf.getAttachmentName(j);
          const attachmentPage = coherentpdf.getAttachmentPage(j);
          const attachmentData = coherentpdf.getAttachmentData(j);

          const rawStr = extractRawString(rawAttachmentName);
          const fallbackExt = guessExtension(attachmentData);
          const decodedName = decodePdfFilename(rawStr) || `attachment_${j + 1}.${fallbackExt}`;

          let uniqueName = decodedName;
          let counter = 1;
          while (allAttachments.some(att => att.name === uniqueName)) {
            const nameParts = decodedName.split('.');
            if (nameParts.length > 1) {
              const extension = nameParts.pop();
              uniqueName = `${nameParts.join('.')}_${counter}.${extension}`;
            } else {
              uniqueName = `${decodedName}_${counter}`;
            }
            counter++;
          }

          if (totalFiles > 1) {
            if (attachmentPage > 0) {
              uniqueName = `${baseName}_page${attachmentPage}_${uniqueName}`;
            } else {
              uniqueName = `${baseName}_${uniqueName}`;
            }
          } else {
            if (attachmentPage > 0) {
              uniqueName = `page${attachmentPage}_${uniqueName}`;
            }
          }

          allAttachments.push({
            index: j,
            name: uniqueName,
            page: attachmentPage,
            data: attachmentData.buffer.slice(0)
          });
        } catch (error) {
          console.warn(`Failed to extract attachment ${j} from ${fileName}:`, error);
        }
      }

      coherentpdf.endGetAttachments();
      coherentpdf.deletePdf(pdf);
    }

    if (allAttachments.length === 0) {
      self.postMessage({
        status: 'error',
        message: 'No attachments were found in the selected PDF(s).'
      });
      return;
    }

    const response = {
      status: 'success',
      attachments: []
    };

    const transferBuffers = [];
    for (const attachment of allAttachments) {
      response.attachments.push({
        index: attachment.index,
        name: attachment.name,
        page: attachment.page,
        data: attachment.data
      });
      transferBuffers.push(attachment.data);
    }

    self.postMessage(response, transferBuffers);
  } catch (error) {
    self.postMessage({
      status: 'error',
      message: error instanceof Error
        ? error.message
        : 'Unknown error occurred during attachment extraction.'
    });
  }
}

self.onmessage = (e) => {
  if (e.data.command === 'extract-attachments') {
    extractAttachmentsFromPDFsInWorker(e.data.fileBuffers, e.data.fileNames);
  }
};
