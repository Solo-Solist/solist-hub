import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import { PDFStudio } from '@/components/studio/PDFStudio';
import * as tauriBridge from '@/lib/tauri-bridge';
import * as studioProcessors from '@/components/studio/studio-processors';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock path util
vi.mock('@/lib/utils/path', () => ({
  withBasePath: (path: string) => path,
}));

// Mock tauri-bridge
vi.mock('@/lib/tauri-bridge', () => ({
  isTauri: vi.fn(() => false),
  saveBlobFile: vi.fn().mockResolvedValue(true),
  getSystemPrinters: vi.fn().mockResolvedValue([]),
  printPdfFile: vi.fn().mockResolvedValue(true),
}));

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

describe('PDFStudio Component', () => {
  beforeEach(() => {
    localStorage.clear();
    URL.createObjectURL = vi.fn(() => 'blob:mock-studio-url');
    URL.revokeObjectURL = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    cleanup();
  });

  const createDummyPdfFile = (name = 'test-doc.pdf') => {
    return new File(['%PDF-1.4 dummy content'], name, { type: 'application/pdf' });
  };

  it('renders initial empty workspace with upload dropzone and classic grid switch link in Chinese', () => {
    render(<PDFStudio locale="zh" />);

    expect(screen.getByText(/PDFCraft/i)).toBeInTheDocument();
    expect(screen.getByText(/导入 PDF 开启 Studio 工作台/i)).toBeInTheDocument();
    expect(screen.getByText(/选择 PDF 文件/i)).toBeInTheDocument();
    expect(screen.getByText(/经典网格视图/i)).toBeInTheDocument();
  });

  it('defaults to English when locale prop is omitted or unsupported', () => {
    render(<PDFStudio />);

    expect(screen.getByText(/PDFCraft/i)).toBeInTheDocument();
    expect(screen.getByText(/Import PDF to Launch Studio Workspace/i)).toBeInTheDocument();
    expect(screen.getByText(/Select PDF Files/i)).toBeInTheDocument();
    expect(screen.getByText(/Back to All Tools/i)).toBeInTheDocument();
  });

  it('renders English UI when locale="en" with initialFile', () => {
    const file = createDummyPdfFile('my-invoice.pdf');
    render(<PDFStudio locale="en" initialFile={file} />);

    expect(screen.getByText('my-invoice.pdf')).toBeInTheDocument();
    expect(screen.getByText('Print')).toBeInTheDocument();
    expect(screen.getByText('Save & Export')).toBeInTheDocument();
  });

  it('renders central viewer and toolbar controls when loaded with initialFile', () => {
    const file = createDummyPdfFile('my-invoice.pdf');
    render(<PDFStudio locale="zh" initialFile={file} />);

    // Shows file name in header
    expect(screen.getByText('my-invoice.pdf')).toBeInTheDocument();

    // Undo and Redo buttons exist and disabled initially
    const undoBtn = screen.getByLabelText('Undo');
    const redoBtn = screen.getByLabelText('Redo');
    expect(undoBtn).toBeDisabled();
    expect(redoBtn).toBeDisabled();

    // Print and Export buttons
    expect(screen.getByText('打印')).toBeInTheDocument();
    expect(screen.getByText('保存导出')).toBeInTheDocument();

    // Iframe with viewer src and title matching file name
    const iframe = screen.getByTitle('my-invoice.pdf');
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute('src', expect.stringContaining('viewer.html'));
  });

  it('collapses and expands left toolbar rail', () => {
    const file = createDummyPdfFile();
    render(<PDFStudio locale="zh" initialFile={file} />);

    const collapseBtn = screen.getByLabelText('Collapse sidebar');
    fireEvent.click(collapseBtn);

    // After collapsing, button should have Expand sidebar label
    expect(screen.getByLabelText('Expand sidebar')).toBeInTheDocument();

    // Expand again
    const expandBtn = screen.getByLabelText('Expand sidebar');
    fireEvent.click(expandBtn);
    expect(screen.getByLabelText('Collapse sidebar')).toBeInTheDocument();
  });

  it('opens tool drawer when clicking a tool icon on the left rail', () => {
    const file = createDummyPdfFile();
    render(<PDFStudio locale="zh" initialFile={file} />);

    // Click rotate tool (matches 旋转PDF in featured)
    const rotateBtn = screen.getAllByRole('button', { name: /旋转/i })[0];
    fireEvent.click(rotateBtn);

    // Tool drawer should open with Apply button and Cancel button
    expect(screen.getByText('应用更改')).toBeInTheDocument();
    expect(screen.getByText('取消')).toBeInTheDocument();

    // Click cancel in drawer
    const cancelBtn = screen.getByText('取消');
    fireEvent.click(cancelBtn);
    expect(screen.queryByText('应用更改')).not.toBeInTheDocument();
  });

  it('executes operation, updates history stack, enables undo and export', async () => {
    const mockOutputBlob = new Blob(['%PDF-1.4 modified'], { type: 'application/pdf' });
    vi.spyOn(studioProcessors, 'executeStudioOperation').mockResolvedValue(mockOutputBlob);

    const file = createDummyPdfFile('sample.pdf');
    render(<PDFStudio locale="zh" initialFile={file} />);

    // Open Rotate tool
    const rotateBtn = screen.getAllByRole('button', { name: /旋转/i })[0];
    fireEvent.click(rotateBtn);

    // Click Apply
    const applyBtn = screen.getByText('应用更改');
    fireEvent.click(applyBtn);

    // Wait for operation to complete
    await waitFor(() => {
      expect(studioProcessors.executeStudioOperation).toHaveBeenCalled();
    });

    // Undo button should now be enabled
    const undoBtn = screen.getByLabelText('Undo');
    await waitFor(() => {
      expect(undoBtn).not.toBeDisabled();
    });

    // Click Undo
    fireEvent.click(undoBtn);

    // Redo button should now be enabled
    const redoBtn = screen.getByLabelText('Redo');
    await waitFor(() => {
      expect(redoBtn).not.toBeDisabled();
    });

    // Export document
    const exportBtn = screen.getByText('保存导出');
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(tauriBridge.saveBlobFile).toHaveBeenCalled();
    });
  });

  it('filters tools by search query in the left rail', () => {
    const file = createDummyPdfFile();
    render(<PDFStudio locale="zh" initialFile={file} />);

    const searchInput = screen.getByPlaceholderText(/搜索全部 67\+ 工具/i);
    fireEvent.change(searchInput, { target: { value: '水印' } });

    // Should find matching tools
    expect(screen.getByText(/找到/i)).toBeInTheDocument();
    expect(screen.getByText(/添加水印/i)).toBeInTheDocument();
  });

  it('handles export convert tools without altering central PDF viewer', async () => {
    const mockExportBlob = new Blob(['dummy docx'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    vi.spyOn(studioProcessors, 'executeStudioExport').mockResolvedValue({
      blob: mockExportBlob,
      filename: 'sample_converted.docx',
    });

    const file = createDummyPdfFile('sample.pdf');
    render(<PDFStudio locale="zh" initialFile={file} />);

    // Filter for Word tool
    const searchInput = screen.getByPlaceholderText(/搜索全部 67\+ 工具/i);
    fireEvent.change(searchInput, { target: { value: 'Word' } });

    // Click PDF to Word
    const wordToolBtn = screen.getByRole('button', { name: /PDF转Word/i });
    fireEvent.click(wordToolBtn);

    // Drawer opens with export button
    const exportBtn = screen.getByText('开始导出');
    expect(exportBtn).toBeInTheDocument();
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(studioProcessors.executeStudioExport).toHaveBeenCalled();
      expect(tauriBridge.saveBlobFile).toHaveBeenCalledWith(
        mockExportBlob,
        'sample_converted.docx'
      );
    });

    // Original iframe is still present and valid
    expect(screen.getByTitle('sample.pdf')).toBeInTheDocument();
  });

  it('toggles favorite tools and filters via favorites pill', () => {
    const file = createDummyPdfFile();
    render(<PDFStudio locale="zh" initialFile={file} />);

    // Find favorite button for rotate tool
    const favButtons = screen.getAllByTitle('添加收藏');
    expect(favButtons.length).toBeGreaterThan(0);
    fireEvent.click(favButtons[0]);

    // Check filter pill for favorites
    const favPill = screen.getByTestId('filter-pill-favorites');
    fireEvent.click(favPill);

    // Should show at least 1 tool in favorites
    expect(screen.getByText(/找到/i)).toBeInTheDocument();
  });

  it('opens history timeline popover and split export dropdown', async () => {
    const mockOutputBlob = new Blob(['%PDF-1.4 modified'], { type: 'application/pdf' });
    vi.spyOn(studioProcessors, 'executeStudioOperation').mockResolvedValue(mockOutputBlob);

    const file = createDummyPdfFile('history-doc.pdf');
    render(<PDFStudio locale="zh" initialFile={file} />);

    // Apply a tool to build history
    const rotateBtn = screen.getAllByRole('button', { name: /旋转/i })[0];
    fireEvent.click(rotateBtn);
    fireEvent.click(screen.getByText('应用更改'));

    await waitFor(() => {
      expect(studioProcessors.executeStudioOperation).toHaveBeenCalled();
    });

    // Open history popover
    const historyBadge = screen.getByTitle('查看操作历史记录');
    fireEvent.click(historyBadge);
    expect(screen.getByText('操作历史时间线')).toBeInTheDocument();

    // Open export dropdown
    const moreExportBtn = screen.getByLabelText('More export formats');
    fireEvent.click(moreExportBtn);
    expect(screen.getByText(/导出为 Word/i)).toBeInTheDocument();
    expect(screen.getByText(/导出为图片包/i)).toBeInTheDocument();
  });

  it('renders non-scrolling two-tier filter controls and toggles category filters', () => {
    const file = createDummyPdfFile();
    render(<PDFStudio locale="zh" initialFile={file} />);

    // Tier 1 pills
    expect(screen.getByTestId('filter-pill-all')).toBeInTheDocument();
    expect(screen.getByTestId('filter-pill-featured')).toBeInTheDocument();
    expect(screen.getByTestId('filter-pill-favorites')).toBeInTheDocument();
    expect(screen.getByTestId('filter-pill-recent')).toBeInTheDocument();

    // Tier 2 category pills
    const orgPill = screen.getByTestId('filter-pill-organize-manage');
    expect(orgPill).toBeInTheDocument();

    // Click category pill to filter
    fireEvent.click(orgPill);
    expect(screen.getByText(/找到/i)).toBeInTheDocument();

    // Click again to toggle back to all
    fireEvent.click(orgPill);
    expect(screen.getByText(/按大类浏览/i)).toBeInTheDocument();
  });

  it('supports multi-document tabs, switching active document, and batch ZIP export', async () => {
    const file1 = createDummyPdfFile('contract_part1.pdf');
    const file2 = createDummyPdfFile('contract_part2.pdf');

    render(<PDFStudio locale="zh" />);

    // Batch load multiple files via file input in empty workspace
    const uploadInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(uploadInput).toBeInTheDocument();

    fireEvent.change(uploadInput, {
      target: { files: [file1, file2] },
    });

    // Both tabs should now be rendered in the document tabs bar
    await waitFor(() => {
      expect(screen.getByText('contract_part1.pdf')).toBeInTheDocument();
      expect(screen.getByText('contract_part2.pdf')).toBeInTheDocument();
    });

    // Currently active viewer iframe should be the first document
    expect(screen.getByTitle('contract_part1.pdf')).toBeInTheDocument();

    // Click the second tab to switch active document
    const tab2 = screen.getByText('contract_part2.pdf');
    fireEvent.click(tab2);

    // Active viewer iframe should now switch to contract_part2.pdf
    await waitFor(() => {
      expect(screen.getByTitle('contract_part2.pdf')).toBeInTheDocument();
    });

    // Open export dropdown - should show batch export option for 2 documents
    const moreExportBtn = screen.getByLabelText('More export formats');
    fireEvent.click(moreExportBtn);
    expect(screen.getByText(/打包导出全部文档 \(2篇 \.zip\)/i)).toBeInTheDocument();

    // Open Merge PDF tool - drawer should show contract_part1.pdf as quick-add option
    const searchInput = screen.getByPlaceholderText(/搜索全部 67\+ 工具/i);
    fireEvent.change(searchInput, { target: { value: '合并' } });

    const mergeBtn = screen.getByTestId('tool-item-merge-pdf');
    fireEvent.click(mergeBtn);

    // Check quick add button exists for the other open document
    expect(screen.getByText(/快捷并入工作台中已打开的文档/i)).toBeInTheDocument();

    // Close the second tab
    const closeBtn2 = screen.getByLabelText('Close contract_part2.pdf');
    fireEvent.click(closeBtn2);

    // After closing tab 2, active document reverts to contract_part1.pdf
    await waitFor(() => {
      expect(screen.queryByTitle('contract_part2.pdf')).not.toBeInTheDocument();
      expect(screen.getByTitle('contract_part1.pdf')).toBeInTheDocument();
    });
  });

  it('renders rich parameters in tool drawer for extract-pages, decrypt-pdf, and n-up-pdf', async () => {
    const file = createDummyPdfFile('test-tools.pdf');
    render(<PDFStudio locale="zh" initialFile={file} />);

    const searchInput = screen.getByPlaceholderText(/搜索全部 67\+ 工具/i);

    // 1. Check extract-pages parameters
    fireEvent.change(searchInput, { target: { value: '提取页面' } });
    const extractBtn = screen.getByTestId('tool-item-extract-pages');
    fireEvent.click(extractBtn);

    expect(screen.getByText(/提取页码范围/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('1-3, 5')).toBeInTheDocument();

    // 2. Check decrypt-pdf parameters
    fireEvent.change(searchInput, { target: { value: '解密' } });
    const decryptBtn = screen.getByTestId('tool-item-decrypt-pdf');
    fireEvent.click(decryptBtn);

    expect(screen.getByText(/文档密码 \/ 口令/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/若有打开密码请输入/i)).toBeInTheDocument();

    // 3. Check n-up-pdf parameters
    fireEvent.change(searchInput, { target: { value: '多页' } });
    const nUpBtn = screen.getByTestId('tool-item-n-up-pdf');
    fireEvent.click(nUpBtn);

    expect(screen.getByText(/每张纸拼排页数/i)).toBeInTheDocument();
    expect(screen.getByText('2-Up')).toBeInTheDocument();
    expect(screen.getByText('4-Up')).toBeInTheDocument();
  });
});

