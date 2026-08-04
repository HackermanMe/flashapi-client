import { describe, it, expect } from 'vitest';
import { serializeFilters } from './filters.js';

describe('serializeFilters', () => {
  it('serializes simple operators', () => {
    const result = serializeFilters({
      price: { gte: 100, lte: 500 },
    });
    expect(result).toEqual({
      'price__gte': '100',
      'price__lte': '500',
    });
  });

  it('serializes string operators', () => {
    const result = serializeFilters({
      name: { contains: 'phone', startswith: 'i' },
    });
    expect(result).toEqual({
      'name__contains': 'phone',
      'name__startswith': 'i',
    });
  });

  it('serializes array values (in operator)', () => {
    const result = serializeFilters({
      status: { in: ['active', 'pending'] },
    });
    expect(result).toEqual({
      'status__in': 'active,pending',
    });
  });

  it('serializes boolean values', () => {
    const result = serializeFilters({
      active: { eq: true },
    });
    expect(result).toEqual({
      'active__eq': 'true',
    });
  });

  it('serializes isnull', () => {
    const result = serializeFilters({
      deletedAt: { isnull: true },
    });
    expect(result).toEqual({
      'deletedAt__isnull': 'true',
    });
  });

  it('skips null/undefined values', () => {
    const result = serializeFilters({
      name: { eq: null },
      price: { gte: undefined as unknown as null },
    });
    expect(result).toEqual({});
  });

  it('handles multiple fields', () => {
    const result = serializeFilters({
      price: { gte: 10 },
      name: { contains: 'test' },
      category: { eq: 'electronics' },
    });
    expect(result).toEqual({
      'price__gte': '10',
      'name__contains': 'test',
      'category__eq': 'electronics',
    });
  });
});
