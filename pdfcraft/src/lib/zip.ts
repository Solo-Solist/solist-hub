
import JSZip from 'jszip';

/**
 * Creates a ZIP file containing multiple files
 * @param files Array of files to include in the ZIP
 * @returns Blob representing the ZIP file
 */
export async function createZip(files: File[] | { blob: Blob; filename: string }[]): Promise<Blob> {
    const zip = new JSZip();

    files.forEach((file) => {
        if (file instanceof File) {
            zip.file(file.name, file);
        } else {
            zip.file(file.filename, file.blob);
        }
    });

    return await zip.generateAsync({ type: 'blob' });
}
