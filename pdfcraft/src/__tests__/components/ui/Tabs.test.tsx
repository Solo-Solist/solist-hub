import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs, Tab } from '@/components/ui/Tabs';

const mockTabs: Tab[] = [
  { id: 'tab1', label: 'Tab 1', content: <div>Content 1</div> },
  { id: 'tab2', label: 'Tab 2', content: <div>Content 2</div> },
  { id: 'tab3', label: 'Tab 3', content: <div>Content 3</div> },
];

describe('Tabs', () => {
  describe('Rendering', () => {
    it('renders all tab labels', () => {
      render(<Tabs tabs={mockTabs} />);
      expect(screen.getByRole('tab', { name: 'Tab 1' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Tab 2' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Tab 3' })).toBeInTheDocument();
    });

    it('renders first tab content by default', () => {
      render(<Tabs tabs={mockTabs} />);
      expect(screen.getByText('Content 1')).toBeInTheDocument();
      expect(screen.queryByText('Content 2')).not.toBeInTheDocument();
    });

    it('renders specified default tab content', () => {
      render(<Tabs tabs={mockTabs} defaultTab="tab2" />);
      expect(screen.queryByText('Content 1')).not.toBeInTheDocument();
      expect(screen.getByText('Content 2')).toBeInTheDocument();
    });

    it('renders tablist with correct role', () => {
      render(<Tabs tabs={mockTabs} />);
      expect(screen.getByRole('tablist')).toBeInTheDocument();
    });

    it('renders tabpanels with correct role', () => {
      render(<Tabs tabs={mockTabs} />);
      expect(screen.getByRole('tabpanel')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has correct aria-selected on active tab', () => {
      render(<Tabs tabs={mockTabs} />);
      expect(screen.getByRole('tab', { name: 'Tab 1' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tab', { name: 'Tab 2' })).toHaveAttribute('aria-selected', 'false');
    });

    it('has correct aria-controls linking tab to panel', () => {
      render(<Tabs tabs={mockTabs} />);
      const tab1 = screen.getByRole('tab', { name: 'Tab 1' });
      expect(tab1).toHaveAttribute('aria-controls', 'tabpanel-tab1');
      expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'tabpanel-tab1');
    });

    it('has correct aria-labelledby on tabpanel', () => {
      render(<Tabs tabs={mockTabs} />);
      const panel = screen.getByRole('tabpanel');
      expect(panel).toHaveAttribute('aria-labelledby', 'tab-tab1');
    });

    it('has tabindex=0 on active tab and -1 on inactive tabs', () => {
      render(<Tabs tabs={mockTabs} />);
      expect(screen.getByRole('tab', { name: 'Tab 1' })).toHaveAttribute('tabIndex', '0');
      expect(screen.getByRole('tab', { name: 'Tab 2' })).toHaveAttribute('tabIndex', '-1');
      expect(screen.getByRole('tab', { name: 'Tab 3' })).toHaveAttribute('tabIndex', '-1');
    });

    it('has aria-orientation attribute on tablist', () => {
      render(<Tabs tabs={mockTabs} />);
      expect(screen.getByRole('tablist')).toHaveAttribute('aria-orientation', 'horizontal');
    });

    it('has vertical aria-orientation when orientation is vertical', () => {
      render(<Tabs tabs={mockTabs} orientation="vertical" />);
      expect(screen.getByRole('tablist')).toHaveAttribute('aria-orientation', 'vertical');
    });
  });

  describe('Tab Switching', () => {
    it('switches content when clicking a tab', async () => {
      render(<Tabs tabs={mockTabs} />);
      
      await userEvent.click(screen.getByRole('tab', { name: 'Tab 2' }));
      
      expect(screen.queryByText('Content 1')).not.toBeInTheDocument();
      expect(screen.getByText('Content 2')).toBeInTheDocument();
    });

    it('updates aria-selected when switching tabs', async () => {
      render(<Tabs tabs={mockTabs} />);
      
      await userEvent.click(screen.getByRole('tab', { name: 'Tab 2' }));
      
      expect(screen.getByRole('tab', { name: 'Tab 1' })).toHaveAttribute('aria-selected', 'false');
      expect(screen.getByRole('tab', { name: 'Tab 2' })).toHaveAttribute('aria-selected', 'true');
    });

    it('calls onChange callback when tab changes', async () => {
      const handleChange = vi.fn();
      render(<Tabs tabs={mockTabs} onChange={handleChange} />);
      
      await userEvent.click(screen.getByRole('tab', { name: 'Tab 2' }));
      
      expect(handleChange).toHaveBeenCalledWith('tab2');
    });
  });

  describe('Keyboard Navigation', () => {
    it('moves focus to next tab with ArrowRight', async () => {
      render(<Tabs tabs={mockTabs} />);
      const tab1 = screen.getByRole('tab', { name: 'Tab 1' });
      
      tab1.focus();
      fireEvent.keyDown(tab1, { key: 'ArrowRight' });
      
      expect(screen.getByRole('tab', { name: 'Tab 2' })).toHaveFocus();
    });

    it('moves focus to previous tab with ArrowLeft', async () => {
      render(<Tabs tabs={mockTabs} defaultTab="tab2" />);
      const tab2 = screen.getByRole('tab', { name: 'Tab 2' });
      
      tab2.focus();
      fireEvent.keyDown(tab2, { key: 'ArrowLeft' });
      
      expect(screen.getByRole('tab', { name: 'Tab 1' })).toHaveFocus();
    });

    it('wraps to last tab when pressing ArrowLeft on first tab', async () => {
      render(<Tabs tabs={mockTabs} />);
      const tab1 = screen.getByRole('tab', { name: 'Tab 1' });
      
      tab1.focus();
      fireEvent.keyDown(tab1, { key: 'ArrowLeft' });
      
      expect(screen.getByRole('tab', { name: 'Tab 3' })).toHaveFocus();
    });

    it('wraps to first tab when pressing ArrowRight on last tab', async () => {
      render(<Tabs tabs={mockTabs} defaultTab="tab3" />);
      const tab3 = screen.getByRole('tab', { name: 'Tab 3' });
      
      tab3.focus();
      fireEvent.keyDown(tab3, { key: 'ArrowRight' });
      
      expect(screen.getByRole('tab', { name: 'Tab 1' })).toHaveFocus();
    });

    it('moves to first tab with Home key', async () => {
      render(<Tabs tabs={mockTabs} defaultTab="tab3" />);
      const tab3 = screen.getByRole('tab', { name: 'Tab 3' });
      
      tab3.focus();
      fireEvent.keyDown(tab3, { key: 'Home' });
      
      expect(screen.getByRole('tab', { name: 'Tab 1' })).toHaveFocus();
    });

    it('moves to last tab with End key', async () => {
      render(<Tabs tabs={mockTabs} />);
      const tab1 = screen.getByRole('tab', { name: 'Tab 1' });
      
      tab1.focus();
      fireEvent.keyDown(tab1, { key: 'End' });
      
      expect(screen.getByRole('tab', { name: 'Tab 3' })).toHaveFocus();
    });

    it('activates tab with Enter key', async () => {
      render(<Tabs tabs={mockTabs} />);
      const tab2 = screen.getByRole('tab', { name: 'Tab 2' });
      
      tab2.focus();
      fireEvent.keyDown(tab2, { key: 'Enter' });
      
      expect(screen.getByText('Content 2')).toBeInTheDocument();
    });

    it('activates tab with Space key', async () => {
      render(<Tabs tabs={mockTabs} />);
      const tab2 = screen.getByRole('tab', { name: 'Tab 2' });
      
      tab2.focus();
      fireEvent.keyDown(tab2, { key: ' ' });
      
      expect(screen.getByText('Content 2')).toBeInTheDocument();
    });
  });

  describe('Vertical Orientation', () => {
    it('uses ArrowDown for next tab in vertical mode', async () => {
      render(<Tabs tabs={mockTabs} orientation="vertical" />);
      const tab1 = screen.getByRole('tab', { name: 'Tab 1' });
      
      tab1.focus();
      fireEvent.keyDown(tab1, { key: 'ArrowDown' });
      
      expect(screen.getByRole('tab', { name: 'Tab 2' })).toHaveFocus();
    });

    it('uses ArrowUp for previous tab in vertical mode', async () => {
      render(<Tabs tabs={mockTabs} orientation="vertical" defaultTab="tab2" />);
      const tab2 = screen.getByRole('tab', { name: 'Tab 2' });
      
      tab2.focus();
      fireEvent.keyDown(tab2, { key: 'ArrowUp' });
      
      expect(screen.getByRole('tab', { name: 'Tab 1' })).toHaveFocus();
    });
  });

  describe('Disabled Tabs', () => {
    const tabsWithDisabled: Tab[] = [
      { id: 'tab1', label: 'Tab 1', content: <div>Content 1</div> },
      { id: 'tab2', label: 'Tab 2', content: <div>Content 2</div>, disabled: true },
      { id: 'tab3', label: 'Tab 3', content: <div>Content 3</div> },
    ];

    it('renders disabled tab with aria-disabled', () => {
      render(<Tabs tabs={tabsWithDisabled} />);
      expect(screen.getByRole('tab', { name: 'Tab 2' })).toHaveAttribute('aria-disabled', 'true');
    });

    it('does not switch to disabled tab on click', async () => {
      render(<Tabs tabs={tabsWithDisabled} />);
      
      await userEvent.click(screen.getByRole('tab', { name: 'Tab 2' }));
      
      expect(screen.getByText('Content 1')).toBeInTheDocument();
      expect(screen.queryByText('Content 2')).not.toBeInTheDocument();
    });

    it('skips disabled tabs during keyboard navigation', async () => {
      render(<Tabs tabs={tabsWithDisabled} />);
      const tab1 = screen.getByRole('tab', { name: 'Tab 1' });
      
      tab1.focus();
      fireEvent.keyDown(tab1, { key: 'ArrowRight' });
      
      // Should skip tab2 (disabled) and go to tab3
      expect(screen.getByRole('tab', { name: 'Tab 3' })).toHaveFocus();
    });
  });
});
