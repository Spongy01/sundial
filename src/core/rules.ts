import { hostMatches } from './domain';
import type { Categorization } from './types';

export type RuleType = 'keyword' | 'host' | 'domain';

export interface DomainRule {
  id?: number;
  type: RuleType;
  /**
   * keyword: domain or host the rule applies to (subdomains included).
   * host:    exact host, e.g. `docs.google.com`.
   * domain:  exact registrable domain, e.g. `youtube.com`.
   */
  matchDomain: string;
  /** keyword rules only: URL path must start with this. */
  pathPrefix?: string;
  /** keyword rules only: title must contain any of these words (case-insensitive). */
  titleKeywords?: string[];
  categoryId: string;
  /** Higher wins among rules of the same type. */
  priority: number;
  enabled: boolean;
  isExample?: boolean;
}

export type Dictionary = Readonly<Record<string, string>>;

export interface CategorizeInput {
  host: string;
  domain: string;
  /** In memory only; never persisted. */
  path: string;
  /** In memory only; never persisted. */
  title: string;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Word-prefix match: "tutorial" matches "Tutorials" but not "mytutorial". */
export function titleHasKeyword(title: string, keywords: string[]): boolean {
  return keywords.some((k) => {
    const word = k.trim();
    return word.length > 0 && new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(word)}`, 'iu').test(title);
  });
}

function keywordRuleMatches(rule: DomainRule, input: CategorizeInput): boolean {
  if (!hostMatches(input.host, rule.matchDomain)) return false;
  const hasPath = !!rule.pathPrefix;
  const hasKeywords = !!rule.titleKeywords?.some((k) => k.trim());
  if (!hasPath && !hasKeywords) return false; // a keyword rule needs a condition
  if (hasPath && !input.path.toLowerCase().startsWith(rule.pathPrefix!.toLowerCase())) return false;
  if (hasKeywords && !titleHasKeyword(input.title, rule.titleKeywords!)) return false;
  return true;
}

const byPriority = (a: DomainRule, b: DomainRule) => b.priority - a.priority || (a.id ?? 0) - (b.id ?? 0);

/**
 * Priority: keyword (path/title) rule → exact host rule → domain rule →
 * default dictionary → Uncategorized.
 */
export function categorize(
  input: CategorizeInput,
  rules: readonly DomainRule[],
  dictionary: Dictionary,
  knownCategoryIds?: ReadonlySet<string>,
): Categorization {
  const usable = rules
    .filter((r) => r.enabled && (!knownCategoryIds || knownCategoryIds.has(r.categoryId)))
    .sort(byPriority);

  const kw = usable.find((r) => r.type === 'keyword' && keywordRuleMatches(r, input));
  if (kw) return { categoryId: kw.categoryId, ruleSource: 'keyword' };

  const host = usable.find((r) => r.type === 'host' && r.matchDomain === input.host);
  if (host) return { categoryId: host.categoryId, ruleSource: 'host' };

  const domain = usable.find((r) => r.type === 'domain' && r.matchDomain === input.domain);
  if (domain) return { categoryId: domain.categoryId, ruleSource: 'domain' };

  // Most specific dictionary entry wins: docs.google.com before google.com.
  const labels = input.host.split('.');
  for (let i = 0; i < labels.length; i++) {
    const candidate = labels.slice(i).join('.');
    const hit = dictionary[candidate];
    if (hit) return { categoryId: hit, ruleSource: 'dictionary' };
    if (candidate === input.domain) break;
  }

  return { categoryId: 'uncategorized', ruleSource: 'none' };
}
