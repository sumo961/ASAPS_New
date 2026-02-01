import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScrollIndicator, ScrollBadge } from '../../src/components/ScrollIndicator';

describe('ScrollIndicator', () => {
  describe('rendering', () => {
    it('should render with bottom position', () => {
      const { container } = render(<ScrollIndicator position="bottom" />);
      const indicator = container.firstChild as HTMLElement;

      expect(indicator).toBeDefined();
      expect(indicator.style.bottom).toBe('0px');
    });

    it('should render with top position', () => {
      const { container } = render(<ScrollIndicator position="top" />);
      const indicator = container.firstChild as HTMLElement;

      expect(indicator).toBeDefined();
      expect(indicator.style.top).toBe('0px');
    });
  });

  describe('message display', () => {
    it('should show default bottom message', () => {
      render(<ScrollIndicator position="bottom" />);
      expect(screen.getByText('↓ Scroll for more')).toBeDefined();
    });

    it('should show default top message', () => {
      render(<ScrollIndicator position="top" />);
      expect(screen.getByText('↑ Scroll up')).toBeDefined();
    });

    it('should show custom message when provided', () => {
      render(<ScrollIndicator position="bottom" message="Custom message" />);
      expect(screen.getByText('Custom message')).toBeDefined();
    });

    it('should hide message when showMessage is false', () => {
      render(<ScrollIndicator position="bottom" showMessage={false} />);
      expect(screen.queryByText('↓ Scroll for more')).toBeNull();
    });
  });

  describe('styling', () => {
    it('should have pointer-events: none to not block interactions', () => {
      const { container } = render(<ScrollIndicator position="bottom" />);
      const indicator = container.firstChild as HTMLElement;

      expect(indicator.style.pointerEvents).toBe('none');
    });

    it('should have correct gradient for bottom position', () => {
      const { container } = render(<ScrollIndicator position="bottom" />);
      const indicator = container.firstChild as HTMLElement;

      // Browser normalizes gradient syntax, just verify it's a gradient
      expect(indicator.style.background).toContain('linear-gradient');
      expect(indicator.style.background).toContain('transparent');
    });

    it('should have correct gradient for top position', () => {
      const { container } = render(<ScrollIndicator position="top" />);
      const indicator = container.firstChild as HTMLElement;

      // Browser normalizes gradient syntax, just verify it's a gradient
      expect(indicator.style.background).toContain('linear-gradient');
      expect(indicator.style.background).toContain('transparent');
    });

    it('should have fixed height of 30px', () => {
      const { container } = render(<ScrollIndicator position="bottom" />);
      const indicator = container.firstChild as HTMLElement;

      expect(indicator.style.height).toBe('30px');
    });
  });
});

describe('ScrollBadge', () => {
  describe('visibility', () => {
    it('should render when visible is true', () => {
      render(<ScrollBadge visible={true} />);
      expect(screen.getByText('Scrollable')).toBeDefined();
    });

    it('should not render when visible is false', () => {
      const { container } = render(<ScrollBadge visible={false} />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('styling', () => {
    it('should be positioned in bottom-right corner', () => {
      const { container } = render(<ScrollBadge visible={true} />);
      const badge = container.firstChild as HTMLElement;

      expect(badge.style.position).toBe('absolute');
      expect(badge.style.bottom).toBe('4px');
      expect(badge.style.right).toBe('4px');
    });

    it('should have pointer-events: none', () => {
      const { container } = render(<ScrollBadge visible={true} />);
      const badge = container.firstChild as HTMLElement;

      expect(badge.style.pointerEvents).toBe('none');
    });

    it('should display "Scrollable" text', () => {
      render(<ScrollBadge visible={true} />);
      expect(screen.getByText('Scrollable')).toBeDefined();
    });
  });
});
