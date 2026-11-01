import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EditPDFTool } from '@/components/tools/edit-pdf/EditPDFTool';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => {
    const translations: Record<string, Record<string, string>> = {
      common: {
        'buttons.clear': 'Clear',
        'buttons.download': 'Download',
        'status.loading': 'Loading...',
        'status.processing': 'Processing...',
      },
      'tools.editPdf': {
        'uploadLabel': 'Upload PDF to Edit',
        'uploadDescription': 'Drag and drop a PDF file here, or click to browse.',
        'saveDownload': 'Save & Download',
        'saveError': 'Failed to save PDF',
      },
    };
    return translations[namespace]?.[key] || key;
  },
  useLocale: () => 'en',
}));

// Mock the FileUploader component
vi.mock('@/components/tools/FileUploader', () => ({
  FileUploader: ({ onFilesSelected, onError, label, description }: {
    onFilesSelected: (files: File[]) => void;
    onError?: (error: string) => void;
    label?: string;
    description?: string;
  }) => (
    <div data-testid="file-uploader">
      <span>{label}</span>
      <span>{description}</span>
      <button
        onClick={() => {
          const mockFile = new File(['test'], 'test.pdf', { type: 'application/pdf' });
          onFilesSelected([mockFile]);
        }}
        data-testid="mock-upload-button"
      >
        Upload
      </button>
      <button
        onClick={() => onError?.('Test error')}
        data-testid="mock-error-button"
      >
        Trigger Error
      </button>
    </div>
  ),
}));

// Mock recent files storage
vi.mock('@/lib/storage/recent-files', () => ({
  addRecentFile: vi.fn(),
}));

describe('EditPDFTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock URL.createObjectURL
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('renders file uploader when no file is loaded', () => {
      render(<EditPDFTool />);
      
      expect(screen.getByTestId('file-uploader')).toBeInTheDocument();
      expect(screen.getByText('Upload PDF to Edit')).toBeInTheDocument();
    });

    it('renders with custom className', () => {
      const { container } = render(<EditPDFTool className="custom-class" />);
      
      expect(container.firstChild).toHaveClass('custom-class');
    });

    it('hides file uploader after file is selected', async () => {
      render(<EditPDFTool />);
      
      const uploadButton = screen.getByTestId('mock-upload-button');
      fireEvent.click(uploadButton);
      
      await waitFor(() => {
        expect(screen.queryByTestId('file-uploader')).not.toBeInTheDocument();
      });
    });
  });

  describe('File Selection', () => {
    it('displays file info after file is selected', async () => {
      render(<EditPDFTool />);
      
      const uploadButton = screen.getByTestId('mock-upload-button');
      fireEvent.click(uploadButton);
      
      await waitFor(() => {
        expect(screen.getByText('test.pdf')).toBeInTheDocument();
      });
    });

    it('shows clear button after file is selected', async () => {
      render(<EditPDFTool />);
      
      const uploadButton = screen.getByTestId('mock-upload-button');
      fireEvent.click(uploadButton);
      
      await waitFor(() => {
        expect(screen.getByText('Clear')).toBeInTheDocument();
      });
    });

    it('clears file when clear button is clicked', async () => {
      render(<EditPDFTool />);
      
      // Upload file
      const uploadButton = screen.getByTestId('mock-upload-button');
      fireEvent.click(uploadButton);
      
      await waitFor(() => {
        expect(screen.getByText('test.pdf')).toBeInTheDocument();
      });
      
      // Clear file
      const clearButton = screen.getByText('Clear');
      fireEvent.click(clearButton);
      
      await waitFor(() => {
        expect(screen.getByTestId('file-uploader')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('displays error message when upload fails', async () => {
      render(<EditPDFTool />);
      
      const errorButton = screen.getByTestId('mock-error-button');
      fireEvent.click(errorButton);
      
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('Test error')).toBeInTheDocument();
      });
    });
  });

  describe('PDF Viewer', () => {
    it('renders iframe for PDF viewer after file is loaded', async () => {
      render(<EditPDFTool />);
      
      const uploadButton = screen.getByTestId('mock-upload-button');
      fireEvent.click(uploadButton);
      
      await waitFor(() => {
        const iframe = screen.getByTitle('PDF Editor');
        expect(iframe).toBeInTheDocument();
        expect(iframe).toHaveAttribute('src');
      });
    });

    it('shows loading indicator while editor is initializing', async () => {
      render(<EditPDFTool />);
      
      const uploadButton = screen.getByTestId('mock-upload-button');
      fireEvent.click(uploadButton);
      
      await waitFor(() => {
        expect(screen.getByText('Loading...')).toBeInTheDocument();
      });
    });

    it('iframe has correct sandbox attributes', async () => {
      render(<EditPDFTool />);
      
      const uploadButton = screen.getByTestId('mock-upload-button');
      fireEvent.click(uploadButton);
      
      await waitFor(() => {
        const iframe = screen.getByTitle('PDF Editor');
        expect(iframe).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-downloads');
      });
    });
  });

  describe('Mode Switching', () => {
    it('preserves the uploaded file and does not show file uploader when switching between direct and annotator modes', async () => {
      render(<EditPDFTool />);
      
      // Upload file initially
      const uploadButton = screen.getByTestId('mock-upload-button');
      fireEvent.click(uploadButton);
      
      await waitFor(() => {
        expect(screen.getByText('test.pdf')).toBeInTheDocument();
        expect(screen.queryByTestId('file-uploader')).not.toBeInTheDocument();
      });

      // Switch to Classic Annotator
      const annotatorBtn = screen.getByText('Classic Annotator');
      fireEvent.click(annotatorBtn);

      // Verify file is still present and file uploader is NOT shown
      await waitFor(() => {
        expect(screen.getByText('test.pdf')).toBeInTheDocument();
        expect(screen.queryByTestId('file-uploader')).not.toBeInTheDocument();
      });

      // Switch back to Direct Content Edit
      const directBtn = screen.getByText('Direct Content Edit');
      fireEvent.click(directBtn);

      // Verify file is still present and file uploader is NOT shown
      await waitFor(() => {
        expect(screen.getByText('test.pdf')).toBeInTheDocument();
        expect(screen.queryByTestId('file-uploader')).not.toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('error messages have alert role', async () => {
      render(<EditPDFTool />);
      
      const errorButton = screen.getByTestId('mock-error-button');
      fireEvent.click(errorButton);
      
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('iframe has accessible title', async () => {
      render(<EditPDFTool />);
      
      const uploadButton = screen.getByTestId('mock-upload-button');
      fireEvent.click(uploadButton);
      
      await waitFor(() => {
        const iframe = screen.getByTitle('PDF Editor');
        expect(iframe).toBeInTheDocument();
      });
    });
  });
});
