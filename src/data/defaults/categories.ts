import type { CategoryKind } from '../../core/types';
import type { DomainRule } from '../../core/rules';

export interface Category {
  id: string;
  name: string;
  color: string;
  /** Scoring bucket. Custom categories pick productive, entertainment or neutral. */
  kind: CategoryKind;
  builtin: boolean;
}

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'productive', name: 'Productive', color: '#2f9e74', kind: 'productive', builtin: true },
  { id: 'entertainment', name: 'Entertainment', color: '#e0663f', kind: 'entertainment', builtin: true },
  { id: 'neutral', name: 'Neutral', color: '#7c8aa0', kind: 'neutral', builtin: true },
  { id: 'uncategorized', name: 'Uncategorized', color: '#b8b0a2', kind: 'uncategorized', builtin: true },
];

export const EXAMPLE_RULES: DomainRule[] = [
  {
    type: 'keyword',
    matchDomain: 'youtube.com',
    titleKeywords: ['tutorial', 'lecture', 'course', 'lesson'],
    categoryId: 'productive',
    priority: 10,
    enabled: true,
    isExample: true,
  },
];
