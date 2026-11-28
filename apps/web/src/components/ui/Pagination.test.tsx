import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { usePagination } from '@/lib/use-pagination';
import { Pagination } from './index';

/** The "Page x of y" line (its numbers are bold, so match the whole line). */
const pageLabel = (text: string) =>
  screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === text);

describe('Pagination', () => {
  it('shows which records are on screen and changes the page size', async () => {
    const onChange = vi.fn();
    const onPageSizeChange = vi.fn();
    render(
      <Pagination
        page={2}
        totalPages={3}
        total={47}
        pageSize={20}
        onChange={onChange}
        onPageSizeChange={onPageSizeChange}
      />,
    );
    expect(screen.getByText(/Showing/)).toHaveTextContent('Showing 21–40 of 47 records');
    expect(pageLabel('Page 2 of 3')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Rows per page'), '50');
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('handles the last partial page and empty lists', () => {
    const { rerender } = render(
      <Pagination page={3} totalPages={3} total={47} pageSize={20} onChange={() => {}} />,
    );
    expect(screen.getByText(/Showing/)).toHaveTextContent('Showing 41–47 of 47 records');
    expect(screen.queryByLabelText('Rows per page')).not.toBeInTheDocument();
    rerender(<Pagination page={1} totalPages={1} total={0} pageSize={20} onChange={() => {}} />);
    expect(screen.getByText('No records')).toBeInTheDocument();
    expect(pageLabel('Page 1 of 1')).toBeInTheDocument();
  });
});

describe('usePagination', () => {
  it('remembers the page size and returns to page 1 when it changes', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    const { result } = renderHook(() => usePagination());
    expect(result.current.pageSize).toBe(20);
    act(() => result.current.setPage(3));
    act(() => result.current.setPageSize(50));
    expect(result.current).toMatchObject({ page: 1, pageSize: 50 });
    const again = renderHook(() => usePagination());
    expect(again.result.current.pageSize).toBe(50);
    // A list with its own sizes ignores an unsupported remembered value.
    const media = renderHook(() =>
      usePagination({ key: 'tables', defaultSize: 24, options: [12, 24] }),
    );
    expect(media.result.current.pageSize).toBe(24);
    vi.unstubAllGlobals();
  });
});
