import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import React from 'react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../../../../messages/en.json';
import { BookmarkTool } from '@/components/tools/bookmark/BookmarkTool';
import { processBookmarks } from '@/lib/pdf/processors/bookmark';

vi.mock('@/components/tools/FileUploader', () => ({
  FileUploader: ({ onFilesSelected }: { onFilesSelected: (files: File[]) => void }) => (
    <button
      data-testid="mock-uploader"
      onClick={() => {
        const file = new File(['%PDF'], 'book.pdf', { type: 'application/pdf' });
        Object.defineProperty(file, 'arrayBuffer', { value: async () => new ArrayBuffer(4) });
        onFilesSelected([file]);
      }}
    >
      Upload PDF
    </button>
  ),
}));

vi.mock('@/lib/pdf/loader', () => ({
  configurePdfjsWorker: vi.fn(),
}));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: 'mock-worker.js' },
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 4,
      getPage: async () => ({}),
      getOutline: async () => [
        { title: 'Cover', items: [] },
        { title: 'Page 2', items: [] },
        { title: 'Page 3', items: [] },
        { title: 'Contents', items: [{ title: 'Chapter 1', items: [] }] },
      ],
    }),
  }),
}));

vi.mock('@/lib/pdf/processors/bookmark', () => ({
  processBookmarks: vi.fn(async () => ({ success: true, result: new Blob(['%PDF']) })),
}));

const renderAndLoad = async () => {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BookmarkTool />
    </NextIntlClientProvider>
  );
  fireEvent.click(screen.getByTestId('mock-uploader'));
  await screen.findByText('Cover');
};

const savedTitles = () => {
  const options = vi.mocked(processBookmarks).mock.calls[0][1];
  const titles: string[] = [];
  const collect = (items: { title: string; children?: unknown[] }[]) => {
    for (const item of items) {
      titles.push(item.title);
      collect((item.children ?? []) as typeof items);
    }
  };
  collect(options.bookmarks ?? []);
  return titles;
};

const originalCreateObjectURL = URL.createObjectURL;

describe('BookmarkTool', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(processBookmarks).mockClear();
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    vi.restoreAllMocks();
    cleanup();
  });

  it('removes all bookmarks after confirmation and saves a PDF with none', async () => {
    await renderAndLoad();

    fireEvent.click(screen.getByRole('button', { name: 'Remove all' }));

    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Cover')).not.toBeInTheDocument();
    expect(screen.getByText('All bookmarks removed. Save to download a PDF with no bookmarks.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save Bookmarks' }));
    await waitFor(() => expect(processBookmarks).toHaveBeenCalledTimes(1));
    expect(savedTitles()).toEqual([]);
  });

  it('keeps every bookmark when Remove all is cancelled', async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    await renderAndLoad();

    fireEvent.click(screen.getByRole('button', { name: 'Remove all' }));

    expect(screen.getByText('Cover')).toBeInTheDocument();
    expect(screen.getByText('Chapter 1')).toBeInTheDocument();
  });

  it('Shift+click checks a range and Remove selected deletes only those bookmarks', async () => {
    await renderAndLoad();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select "Cover"' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select "Page 3"' }), { shiftKey: true });

    expect(screen.getByRole('checkbox', { name: 'Select "Page 2"' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select "Contents"' })).not.toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Remove selected (3)' }));

    expect(window.confirm).toHaveBeenCalledWith(
      'Remove 3 selected bookmarks? Their child bookmarks will also be removed.'
    );
    expect(screen.queryByText('Cover')).not.toBeInTheDocument();
    expect(screen.queryByText('Page 2')).not.toBeInTheDocument();
    expect(screen.queryByText('Page 3')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove selected/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save Bookmarks' }));
    await waitFor(() => expect(processBookmarks).toHaveBeenCalledTimes(1));
    expect(savedTitles()).toEqual(['Contents', 'Chapter 1']);
  });

  it('removes the children of a checked bookmark and keeps the selection when cancelled', async () => {
    await renderAndLoad();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select "Contents"' }));

    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: 'Remove selected (1)' }));
    expect(screen.getByText('Chapter 1')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select "Contents"' })).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Remove selected (1)' }));
    expect(screen.queryByText('Contents')).not.toBeInTheDocument();
    expect(screen.queryByText('Chapter 1')).not.toBeInTheDocument();
    expect(screen.getByText('Cover')).toBeInTheDocument();
  });

  it('still offers Save after the last bookmark is deleted individually', async () => {
    await renderAndLoad();

    for (const title of ['Cover', 'Page 2', 'Page 3', 'Contents']) {
      const row = screen.getByText(title).closest('[draggable="true"]') as HTMLElement;
      fireEvent.click(within(row).getByTitle('Delete'));
    }

    fireEvent.click(screen.getByRole('button', { name: 'Save Bookmarks' }));
    await waitFor(() => expect(processBookmarks).toHaveBeenCalledTimes(1));
    expect(savedTitles()).toEqual([]);
  });
});
