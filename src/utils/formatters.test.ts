import { describe, it, expect } from 'vitest';
import {
  formatPrice,
  formatQuantity,
  formatTime,
  formatPnL,
  formatPercent,
  formatCompact,
} from './formatters';

describe('formatters', () => {
  describe('formatPrice', () => {
    it('formats valid numbers with default 2 decimals', () => {
      expect(formatPrice(100.5)).toBe('100.50');
      expect(formatPrice(1234.56)).toBe('1,234.56');
      expect(formatPrice(0.99)).toBe('0.99');
    });

    it('formats valid numbers with custom decimals', () => {
      expect(formatPrice(100.123456, 8)).toBe('100.12345600');
      expect(formatPrice(0.00000001, 8)).toBe('0.00000001');
      expect(formatPrice(50, 0)).toBe('50');
    });

    it('handles null/undefined/NaN values', () => {
      expect(formatPrice(null as unknown as number)).toBe('—');
      expect(formatPrice(undefined as unknown as number)).toBe('—');
      expect(formatPrice(NaN)).toBe('—');
    });

    it('handles zero value', () => {
      expect(formatPrice(0)).toBe('0.00');
      expect(formatPrice(0, 8)).toBe('0.00000000');
    });

    it('handles negative values', () => {
      expect(formatPrice(-100.5)).toBe('-100.50');
      expect(formatPrice(-0.01)).toBe('-0.01');
    });

    it('handles very large numbers', () => {
      expect(formatPrice(1000000.99)).toBe('1,000,000.99');
      expect(formatPrice(999999999.99)).toBe('999,999,999.99');
    });
  });

  describe('formatQuantity', () => {
    it('formats valid numbers with default 0 decimals', () => {
      expect(formatQuantity(1000)).toBe('1,000');
      expect(formatQuantity(1234567)).toBe('1,234,567');
      expect(formatQuantity(100.5)).toBe('101'); // Rounds when decimals=0
    });

    it('formats valid numbers with custom decimals', () => {
      expect(formatQuantity(100.123, 2)).toBe('100.12');
      expect(formatQuantity(1000.5, 1)).toBe('1,000.5');
      expect(formatQuantity(50, 3)).toBe('50.000');
    });

    it('handles null/undefined/NaN values', () => {
      expect(formatQuantity(null as unknown as number)).toBe('—');
      expect(formatQuantity(undefined as unknown as number)).toBe('—');
      expect(formatQuantity(NaN)).toBe('—');
    });

    it('handles zero value', () => {
      expect(formatQuantity(0)).toBe('0');
      expect(formatQuantity(0, 2)).toBe('0.00');
    });

    it('handles negative quantities', () => {
      expect(formatQuantity(-500)).toBe('-500');
      expect(formatQuantity(-1234.56, 2)).toBe('-1,234.56');
    });
  });

  describe('formatTime', () => {
    it('formats timestamp with default HH:mm:ss format', () => {
      const timestamp = new Date('2024-01-15T14:30:45.123Z').getTime();
      const result = formatTime(timestamp);
      // Result depends on local timezone, so we just verify format shape
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    it('formats timestamp with HH:mm:ss.SSS format', () => {
      const timestamp = new Date('2024-01-15T14:30:45.123Z').getTime();
      const result = formatTime(timestamp, 'HH:mm:ss.SSS');
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
    });

    it('pads single-digit hours, minutes, seconds with zero', () => {
      // Create a timestamp for 01:05:09
      const date = new Date();
      date.setHours(1, 5, 9, 0);
      const result = formatTime(date.getTime());
      expect(result).toMatch(/^01:05:09$/);
    });

    it('pads milliseconds with zeros in SSS format', () => {
      const date = new Date();
      date.setHours(12, 30, 45, 5); // 5ms should become 005
      const result = formatTime(date.getTime(), 'HH:mm:ss.SSS');
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}\.005$/);
    });
  });

  describe('formatPnL', () => {
    it('formats positive values with + sign and positive class', () => {
      const result = formatPnL(100.5);
      expect(result.text).toBe('+100.50');
      expect(result.className).toBe('positive');
    });

    it('formats negative values with - sign and negative class', () => {
      const result = formatPnL(-50.25);
      expect(result.text).toBe('-50.25');
      expect(result.className).toBe('negative');
    });

    it('formats zero with + sign and empty class', () => {
      const result = formatPnL(0);
      expect(result.text).toBe('+0.00');
      expect(result.className).toBe('');
    });

    it('handles custom decimal places', () => {
      const result = formatPnL(123.456, 3);
      expect(result.text).toBe('+123.456');
    });

    it('handles null/undefined/NaN values', () => {
      expect(formatPnL(null as unknown as number)).toEqual({ text: '—', className: '' });
      expect(formatPnL(undefined as unknown as number)).toEqual({ text: '—', className: '' });
      expect(formatPnL(NaN)).toEqual({ text: '—', className: '' });
    });

    it('adds thousand separators', () => {
      const result = formatPnL(1234.56);
      expect(result.text).toBe('+1,234.56');
    });

    it('handles very small positive/negative values', () => {
      const positive = formatPnL(0.01);
      expect(positive.text).toBe('+0.01');
      expect(positive.className).toBe('positive');

      const negative = formatPnL(-0.01);
      expect(negative.text).toBe('-0.01');
      expect(negative.className).toBe('negative');
    });
  });

  describe('formatPercent', () => {
    it('formats positive percentage with + sign and positive class', () => {
      const result = formatPercent(5.25);
      expect(result.text).toBe('+5.25%');
      expect(result.className).toBe('positive');
    });

    it('formats negative percentage with - sign and negative class', () => {
      const result = formatPercent(-3.5);
      expect(result.text).toBe('-3.50%');
      expect(result.className).toBe('negative');
    });

    it('formats zero with + sign and empty class', () => {
      const result = formatPercent(0);
      expect(result.text).toBe('+0.00%');
      expect(result.className).toBe('');
    });

    it('handles custom decimal places', () => {
      const result = formatPercent(12.3456, 3);
      expect(result.text).toBe('+12.346%');
    });

    it('handles null/undefined/NaN values', () => {
      expect(formatPercent(null as unknown as number)).toEqual({ text: '—', className: '' });
      expect(formatPercent(undefined as unknown as number)).toEqual({ text: '—', className: '' });
      expect(formatPercent(NaN)).toEqual({ text: '—', className: '' });
    });

    it('handles very large percentages', () => {
      const result = formatPercent(1234.56, 1);
      expect(result.text).toBe('+1234.6%');
    });

    it('handles very small positive/negative percentages', () => {
      const positive = formatPercent(0.01);
      expect(positive.text).toBe('+0.01%');
      expect(positive.className).toBe('positive');

      const negative = formatPercent(-0.01);
      expect(negative.text).toBe('-0.01%');
      expect(negative.className).toBe('negative');
    });
  });

  describe('formatCompact', () => {
    it('formats billions with B suffix', () => {
      expect(formatCompact(1000000000)).toBe('1.0B');
      expect(formatCompact(1500000000)).toBe('1.5B');
      expect(formatCompact(999999999999)).toBe('1000.0B');
    });

    it('formats millions with M suffix', () => {
      expect(formatCompact(1000000)).toBe('1.0M');
      expect(formatCompact(5500000)).toBe('5.5M');
      expect(formatCompact(999999999)).toBe('1000.0M');
    });

    it('formats thousands with K suffix', () => {
      expect(formatCompact(1000)).toBe('1.0K');
      expect(formatCompact(2500)).toBe('2.5K');
      expect(formatCompact(999999)).toBe('1000.0K');
    });

    it('formats values below 1000 with decimals, no suffix', () => {
      expect(formatCompact(999)).toBe('999.0');
      expect(formatCompact(500)).toBe('500.0');
      expect(formatCompact(0)).toBe('0.0');
    });

    it('handles negative values with sign preservation', () => {
      expect(formatCompact(-1000000000)).toBe('-1.0B');
      expect(formatCompact(-5000000)).toBe('-5.0M');
      expect(formatCompact(-1500)).toBe('-1.5K');
      expect(formatCompact(-500)).toBe('-500.0');
    });

    it('handles custom decimal places', () => {
      expect(formatCompact(1234567890, 2)).toBe('1.23B');
      expect(formatCompact(1500000, 0)).toBe('2M'); // Rounds
      expect(formatCompact(1234, 3)).toBe('1.234K');
    });

    it('handles null/undefined/NaN values', () => {
      expect(formatCompact(null as unknown as number)).toBe('—');
      expect(formatCompact(undefined as unknown as number)).toBe('—');
      expect(formatCompact(NaN)).toBe('—');
    });

    it('handles boundary values correctly', () => {
      expect(formatCompact(999999999)).toBe('1000.0M'); // Just under 1B
      expect(formatCompact(999999)).toBe('1000.0K'); // Just under 1M
      expect(formatCompact(999)).toBe('999.0'); // Just under 1K
    });
  });
});
