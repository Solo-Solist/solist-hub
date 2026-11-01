/**
 * Compress PDF Worker
 * Uses coherentpdf for advanced PDF compression
 */

self.importScripts('../coherentpdf.browser.min.js');

/**
 * Compress PDF with coherentpdf
 * @param {ArrayBuffer} pdfData - PDF file data
 * @param {Object} options - Compression options
 * @param {string} options.quality - Compression quality: 'low', 'medium', 'high', 'maximum'
 * @param {boolean} options.removeMetadata - Whether to remove metadata
 */
function compressPdfInWorker(pdfData, options) {
  try {
    const uint8Array = new Uint8Array(pdfData);
    let pdf;
    
    try {
      pdf = coherentpdf.fromMemory(uint8Array, '');
    } catch (error) {
      if (error.message && error.message.includes('encrypt')) {
        self.postMessage({
          status: 'error',
          message: 'The PDF file is encrypted. Please decrypt it first.',
        });
        return;
      }
      throw error;
    }

    self.postMessage({ status: 'progress', progress: 20 });

    // Remove metadata if requested
    if (options.removeMetadata) {
      try {
        coherentpdf.setTitle(pdf, '');
        coherentpdf.setAuthor(pdf, '');
        coherentpdf.setSubject(pdf, '');
        coherentpdf.setKeywords(pdf, '');
        coherentpdf.setCreator(pdf, '');
        coherentpdf.setProducer(pdf, '');
      } catch (e) {
        // Ignore metadata errors
      }
    }

    self.postMessage({ status: 'progress', progress: 40 });

    // Apply compression based on quality level
    // For all quality levels except 'maximum', we apply compression
    if (options.quality !== 'maximum') {
      // Compress all uncompressed streams using Flate
      coherentpdf.compress(pdf);
    }

    self.postMessage({ status: 'progress', progress: 60 });

    // Squeeze/optimize the PDF structure for better compression
    // This removes duplicate objects, optimizes cross-references, etc.
    if (options.quality === 'low' || options.quality === 'medium') {
      coherentpdf.squeezeInMemory(pdf);
    }

    self.postMessage({ status: 'progress', progress: 80 });

    // Output with object stream settings based on quality
    let outputBytes;
    
    if (options.quality === 'low') {
      // Maximum compression: generate and compress object streams
      outputBytes = coherentpdf.toMemoryExt(
        pdf,
        false, // linearize
        false, // make_id
        false, // preserve_objstm
        true,  // generate_objstm - create new object streams
        true   // compress_objstm - compress object streams
      );
    } else if (options.quality === 'medium') {
      // Balanced: generate object streams with compression
      outputBytes = coherentpdf.toMemoryExt(
        pdf,
        false, // linearize
        false, // make_id
        true,  // preserve_objstm
        true,  // generate_objstm
        true   // compress_objstm
      );
    } else if (options.quality === 'high') {
      // Less compression: preserve existing, compress new
      outputBytes = coherentpdf.toMemoryExt(
        pdf,
        false, // linearize
        false, // make_id
        true,  // preserve_objstm
        false, // generate_objstm
        true   // compress_objstm
      );
    } else {
      // Maximum quality (minimal compression): just output normally
      outputBytes = coherentpdf.toMemory(pdf, false, false);
    }

    // Note: pdf is invalid after toMemoryExt, no need to delete

    self.postMessage({ status: 'progress', progress: 100 });

    const outputBuffer = outputBytes.buffer;
    self.postMessage(
      {
        status: 'success',
        pdfBytes: outputBuffer,
        originalSize: pdfData.byteLength,
        compressedSize: outputBytes.length,
      },
      [outputBuffer]
    );
  } catch (error) {
    self.postMessage({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error during compression.',
    });
  }
}

self.onmessage = (e) => {
  if (e.data.command === 'compress') {
    compressPdfInWorker(e.data.pdfData, e.data.options);
  }
};
