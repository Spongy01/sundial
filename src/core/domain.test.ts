import { describe, expect, it } from 'vitest';
import { hostMatches, normalizeHost, parseSite, trackingKey } from './domain';

describe('parseSite', () => {
  it.each([
    ['https://www.youtube.com/watch?v=1', 'youtube.com', 'youtube.com'],
    ['https://m.youtube.com/', 'youtube.com', 'youtube.com'],
    ['https://music.youtube.com/', 'music.youtube.com', 'youtube.com'],
    ['https://www.bbc.co.uk/news', 'bbc.co.uk', 'bbc.co.uk'],
    ['https://news.bbc.co.uk/', 'news.bbc.co.uk', 'bbc.co.uk'],
    ['https://foo.github.io/x', 'foo.github.io', 'foo.github.io'],
    ['https://example.com.au', 'example.com.au', 'example.com.au'],
    ['https://Docs.Google.com/document/d/1', 'docs.google.com', 'google.com'],
    ['http://localhost:5173/', 'localhost', 'localhost'],
    ['http://192.168.1.10:8080/', '192.168.1.10', '192.168.1.10'],
  ])('%s → host %s, domain %s', (url, host, domain) => {
    expect(parseSite(url)).toMatchObject({ host, domain });
  });

  it.each([
    'chrome://newtab/',
    'chrome://extensions',
    'edge://newtab/',
    'brave://settings',
    'arc://start',
    'about:blank',
    'chrome-extension://abc/dashboard.html',
    'file:///Users/me/a.pdf',
    'https://www.google.com/_/chrome/newtab?ie=UTF-8',
    'not a url',
    undefined,
  ])('ignores %s', (url) => {
    expect(parseSite(url)).toBeNull();
  });

  it('keeps the path in memory for rules', () => {
    expect(parseSite('https://reddit.com/r/programming')?.path).toBe('/r/programming');
  });
});

describe('normalizeHost', () => {
  it('strips www/m but never strips into a bare public suffix', () => {
    expect(normalizeHost('www.example.org')).toBe('example.org');
    expect(normalizeHost('m.co')).toBe('m.co');
    expect(normalizeHost('www.co.uk')).toBe('www.co.uk');
  });
});

describe('trackingKey', () => {
  it('uses the registrable domain by default and the host for split domains', () => {
    const docs = parseSite('https://docs.google.com/')!;
    const mail = parseSite('https://mail.google.com/')!;
    const yt = parseSite('https://music.youtube.com/')!;
    expect(trackingKey(docs, ['google.com'])).toBe('docs.google.com');
    expect(trackingKey(mail, ['google.com'])).toBe('mail.google.com');
    expect(trackingKey(docs, [])).toBe('google.com');
    expect(trackingKey(yt, ['google.com'])).toBe('youtube.com');
  });
});

describe('hostMatches', () => {
  it('matches exact and subdomains only', () => {
    expect(hostMatches('news.ycombinator.com', 'ycombinator.com')).toBe(true);
    expect(hostMatches('ycombinator.com', 'ycombinator.com')).toBe(true);
    expect(hostMatches('notycombinator.com', 'ycombinator.com')).toBe(false);
  });
});
