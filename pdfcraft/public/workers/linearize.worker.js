/**
 * Linearize PDF Worker
 * Uses qpdf-wasm for true PDF linearization (Fast Web View)
 */

// Load qpdf-wasm
self.importScripts('/qpdf.js');

let qpdfInstance = null;

/**
 * Initialize qpdf-wasm
 */
async function initQpdf() {
  if (qpdfInstance) return qpdfInstance;
  
  const createModule = self.createQpdfModule || self.Module;
  if (!createModule) {
    throw new Error('QPDF module not found');
  }
  
  qpdfInstance = await createModule({
    locateFile: (path) => {
      if (path.endsWith('.wasm')) {
        return '/qpdf.wasm';
      }
      return path;
    },
  });
  
  return qpdfInstance;
}

/**
 * Linearize PDF with qpdf
 * @param {ArrayBuffer} pdfData - PDF file data
 * @param {Object} options - Linearization options
 */
async function linearizePdfInWorker(pdfData, options) {
  const inputPath = '/input.pdf';
  const outputPath = '/output.pdf';
  
  try {
    self.postMessage({ status: 'progress', progress: 10 });
    
    // Initialize qpdf
    const qpdf = await initQpdf();
    
    self.postMessage({ status: 'progress', progress: 30 });
    
    // Write input file to virtual filesystem
    const uint8Array = new Uint8Array(pdfData);
    qpdf.FS.writeFile(inputPath, uint8Array);
    
    self.postMessage({ status: 'progress', progress: 50 });
    
    // Build qpdf arguments for linearization
    const args = [inputPath, '--linearize', outputPath];
    
    // Call qpdf
    qpdf.callMain(args);
    
    self.postMessage({ status: 'progress', progress: 80 });
    
    // Read output file
    const outputFile = qpdf.FS.readFile(outputPath, { encoding: 'binary' });
    
    if (!outputFile || outputFile.length === 0) {
      throw new Error('Linearization resulted in an empty file.');
    }
    
    // Get page count (approximate from file structure)
    // qpdf doesn't expose page count directly, so we estimate
    let pageCount = 1;
    try {
      // Try to get page count by checking the output
      const pdfString = new TextDecoder().decode(outputFile.slice(0, 10000));
      const pageMatches = pdfString.match(/\/Type\s*\/Page[^s]/g);
      if (pageMatches) {
        pageCount = pageMatches.length;
      }
    } catch (e) {
      // Ignore page count errors
    }
    
    self.postMessage({ status: 'progress', progress: 95 });
    
    // Clean up virtual filesystem
    try {
      if (qpdf.FS.analyzePath(inputPath).exists) {
        qpdf.FS.unlink(inputPath);
      }
      if (qpdf.FS.analyzePath(outputPath).exists) {
        qpdf.FS.unlink(outputPath);
      }
    } catch (cleanupError) {
      console.warn('Failed to cleanup WASM FS:', cleanupError);
    }
    
    const outputBuffer = outputFile.buffer;
    self.postMessage(
      {
        status: 'success',
        pdfBytes: outputBuffer,
        originalSize: pdfData.byteLength,
        linearizedSize: outputFile.length,
        pageCount: pageCount,
      },
      [outputBuffer]
    );
  } catch (error) {
    // Clean up on error
    try {
      if (qpdfInstance?.FS) {
        if (qpdfInstance.FS.analyzePath(inputPath).exists) {
          qpdfInstance.FS.unlink(inputPath);
        }
        if (qpdfInstance.FS.analyzePath(outputPath).exists) {
          qpdfInstance.FS.unlink(outputPath);
        }
      }
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    
    self.postMessage({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error during linearization.',
    });
  }
}

self.onmessage = async (e) => {
  if (e.data.command === 'linearize') {
    await linearizePdfInWorker(e.data.pdfData, e.data.options);
  }
};
