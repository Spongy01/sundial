import { describe, expect, it } from 'vitest';
import { DEFAULT_DICTIONARY } from '../data/defaults/dictionary';
import { EXAMPLE_RULES } from '../data/defaults/categories';
import { categorize, titleHasKeyword, type DomainRule } from './rules';

const site = (host: string, domain = host, title = '', path = '/') => ({ host, domain, title, path });
const rule = (r: Partial<DomainRule> & Pick<DomainRule, 'type' | 'matchDomain' | 'categoryId'>): DomainRule => ({
  priority: 0,
  enabled: true,
  ...r,
});

describe('categorize priority order', () => {
  const rules: DomainRule[] = [
    rule({ id: 1, type: 'domain', matchDomain: 'google.com', categoryId: 'domain-cat' }),
    rule({ id: 2, type: 'host', matchDomain: 'docs.google.com', categoryId: 'host-cat' }),
    rule({ id: 3, type: 'keyword', matchDomain: 'google.com', titleKeywords: ['budget'], categoryId: 'kw-cat' }),
  ];
  const dict = { 'docs.google.com': 'dict-host', 'google.com': 'dict-domain', 'example.com': 'dict-ex' };

  it('1. keyword rule beats everything', () => {
    expect(categorize(site('docs.google.com', 'google.com', 'Q3 Budget'), rules, dict)).toEqual({
      categoryId: 'kw-cat',
      ruleSource: 'keyword',
    });
  });
  it('2. exact host rule beats domain rule', () => {
    expect(categorize(site('docs.google.com', 'google.com', 'Notes'), rules, dict)).toEqual({
      categoryId: 'host-cat',
      ruleSource: 'host',
    });
  });
  it('3. domain rule beats dictionary', () => {
    expect(categorize(site('mail.google.com', 'google.com'), rules, dict)).toEqual({
      categoryId: 'domain-cat',
      ruleSource: 'domain',
    });
  });
  it('4. dictionary, most specific entry first', () => {
    expect(categorize(site('docs.google.com', 'google.com'), [], dict).categoryId).toBe('dict-host');
    expect(categorize(site('mail.google.com', 'google.com'), [], dict).categoryId).toBe('dict-domain');
    expect(categorize(site('a.b.example.com', 'example.com'), [], dict)).toEqual({
      categoryId: 'dict-ex',
      ruleSource: 'dictionary',
    });
  });
  it('5. falls back to uncategorized', () => {
    expect(categorize(site('unknown.dev'), rules, dict)).toEqual({ categoryId: 'uncategorized', ruleSource: 'none' });
  });

  it('ignores disabled rules and rules pointing at deleted categories', () => {
    const r = [
      rule({ type: 'domain', matchDomain: 'x.com', categoryId: 'gone' }),
      rule({ type: 'domain', matchDomain: 'x.com', categoryId: 'productive', enabled: false }),
    ];
    expect(categorize(site('x.com'), r, { 'x.com': 'entertainment' }, new Set(['productive', 'entertainment']))).toEqual({
      categoryId: 'entertainment',
      ruleSource: 'dictionary',
    });
  });

  it('uses priority to break ties between keyword rules', () => {
    const r = [
      rule({ id: 1, type: 'keyword', matchDomain: 'youtube.com', titleKeywords: ['music'], categoryId: 'low', priority: 1 }),
      rule({ id: 2, type: 'keyword', matchDomain: 'youtube.com', titleKeywords: ['lecture'], categoryId: 'high', priority: 5 }),
    ];
    expect(categorize(site('youtube.com', 'youtube.com', 'Music theory lecture'), r, {}).categoryId).toBe('high');
  });

  it('supports path-prefix keyword rules', () => {
    const r = [rule({ type: 'keyword', matchDomain: 'reddit.com', pathPrefix: '/r/programming', categoryId: 'productive' })];
    expect(categorize(site('reddit.com', 'reddit.com', '', '/r/programming/comments/1'), r, DEFAULT_DICTIONARY).categoryId).toBe(
      'productive',
    );
    expect(categorize(site('reddit.com', 'reddit.com', '', '/r/funny'), r, DEFAULT_DICTIONARY).categoryId).toBe(
      'entertainment',
    );
  });
});

describe('the shipped YouTube example rule', () => {
  const yt = (title: string) => categorize(site('youtube.com', 'youtube.com', title), EXAMPLE_RULES, DEFAULT_DICTIONARY);

  it('marks tutorials and lectures productive', () => {
    expect(yt('React Tutorial for Beginners - YouTube')).toEqual({ categoryId: 'productive', ruleSource: 'keyword' });
    expect(yt('MIT 6.006 Lecture 1 - YouTube').categoryId).toBe('productive');
    expect(yt('Full Course: Rust in 10 hours').categoryId).toBe('productive');
  });
  it('leaves everything else as entertainment', () => {
    expect(yt('Funny cats compilation').categoryId).toBe('entertainment');
  });
});

describe('titleHasKeyword', () => {
  it('matches word prefixes case-insensitively, not mid-word', () => {
    expect(titleHasKeyword('Tutorials!', ['tutorial'])).toBe(true);
    expect(titleHasKeyword('mytutorial', ['tutorial'])).toBe(false);
    expect(titleHasKeyword('anything', ['  '])).toBe(false);
  });
});

describe('default dictionary', () => {
  it('ships ~150+ entries mapped only to built-in kinds', () => {
    const values = Object.values(DEFAULT_DICTIONARY);
    expect(values.length).toBeGreaterThanOrEqual(150);
    expect(new Set(values)).toEqual(new Set(['productive', 'entertainment', 'neutral']));
  });
});
