import { loadPyodide } from '/pymupdf-wasm/pyodide.js';

const basePath = '/pymupdf-wasm/';
let pyodide = null;
let initPromise = null;

async function init() {
    if (pyodide) return pyodide;

    self.postMessage({ type: 'status', message: 'Loading Python environment...' });

    pyodide = await loadPyodide({
        indexURL: basePath,
        fullStdLib: false
    });

    self.postMessage({ type: 'status', message: 'Installing dependencies...' });

    // Helper to install packages from local path
    const install = async (filename) => {
        await pyodide.loadPackage(basePath + filename);
    };

    // Install dependencies in order
    await install('six-1.17.0-py2.py3-none-any.whl');
    await install('pytz-2025.1-py2.py3-none-any.whl');
    await install('python_dateutil-2.9.0.post0-py2.py3-none-any.whl');
    await install('numpy-2.2.5-cp313-cp313-pyodide_2025_0_wasm32.whl');

    self.postMessage({ type: 'status', message: 'Installing Pandas...' });
    await install('pandas-2.2.3-cp313-cp313-pyodide_2025_0_wasm32.whl');

    await install('et_xmlfile-2.0.0-py3-none-any.whl');
    await install('openpyxl-3.1.5-py2.py3-none-any.whl');

    await install('pymupdf-1.26.3-cp313-none-pyodide_2025_0_wasm32.whl');

    // Define the python processing script
    self.postMessage({ type: 'status', message: 'Initializing converter script...' });

    pyodide.runPython(`
import fitz
import pandas as pd
import io
import js

def convert_pdf_to_excel(input_bytes, options=None):
    try:
        # Handle JsProxy input (Uint8Array)
        if hasattr(input_bytes, "to_py"):
            input_bytes = input_bytes.to_py().tobytes()
        
        doc = fitz.open(stream=input_bytes, filetype="pdf")
        output = io.BytesIO()
        
        # Check if we found any tables
        found_tables = False
        
        # Create Excel writer
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            for page_num, page in enumerate(doc):
                # Using PyMuPDF's find_tables
                tabs = page.find_tables()
                if tabs.tables:
                    start_row = 0
                    sheet_name = f"Page {page_num + 1}"
                    
                    # Iterate through identified tables
                    for i, tab in enumerate(tabs):
                        try:
                            # tab.to_pandas() returns a pandas DataFrame
                            df = tab.to_pandas()
                            
                            # Write to sheet
                            df.to_excel(writer, sheet_name=sheet_name, startrow=start_row, index=False)
                            
                            # Add spacing between tables
                            start_row += len(df) + 2
                            found_tables = True
                        except Exception as e:
                            print(f"Error extracting table {i} on page {page_num}: {e}")
            
            if not found_tables:
                # Create info sheet if no tables found
                pd.DataFrame(["No tables detected in this PDF."]).to_excel(writer, sheet_name="Info", index=False, header=False)

        return output.getvalue()
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise e
`);

    return pyodide;
}

self.onmessage = async (event) => {
    const { type, data, options } = event.data;

    try {
        if (type === 'init') {
            if (!initPromise) initPromise = init();
            await initPromise;
            self.postMessage({ type: 'ready' });
            return;
        }

        if (type === 'convert') {
            if (!pyodide) {
                if (!initPromise) initPromise = init();
                await initPromise;
            }

            self.postMessage({ type: 'status', message: 'Processing PDF...' });

            const pdfToExcel = pyodide.globals.get('convert_pdf_to_excel');
            const resultProxy = pdfToExcel(data, options);

            // Convert Python bytes to JS Uint8Array
            const excelBytes = resultProxy.toJs();
            resultProxy.destroy();

            self.postMessage({
                type: 'complete',
                data: excelBytes
            }, [excelBytes.buffer]);
        }
    } catch (error) {
        console.error('Worker error:', error);
        self.postMessage({ type: 'error', message: error.message });
    }
};
