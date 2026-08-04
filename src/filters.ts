import type { Filters } from './types.js';

export function serializeFilters(filters: Filters): Record<string, string> {
  const params: Record<string, string> = {};

  for (const [field, operators] of Object.entries(filters)) {
    for (const [op, value] of Object.entries(operators)) {
      if (value === null || value === undefined) continue;

      const paramKey = `${field}__${op}`;

      if (Array.isArray(value)) {
        params[paramKey] = value.join(',');
      } else {
        params[paramKey] = String(value);
      }
    }
  }

  return params;
}
