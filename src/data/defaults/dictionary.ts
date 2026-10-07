import type { Dictionary } from '../../core/rules';

const P = 'productive';
const E = 'entertainment';
const N = 'neutral';

/**
 * Built-in starting point for ~150 popular sites. User rules always take
 * precedence. Keys are hosts or registrable domains; the most specific wins.
 */
export const DEFAULT_DICTIONARY: Dictionary = Object.freeze({
  // Code & dev
  'github.com': P, 'gitlab.com': P, 'bitbucket.org': P, 'stackoverflow.com': P, 'stackexchange.com': P,
  'superuser.com': P, 'serverfault.com': P, 'askubuntu.com': P, 'developer.mozilla.org': P, 'mdn.dev': P,
  'npmjs.com': P, 'pypi.org': P, 'crates.io': P, 'pkg.go.dev': P, 'docs.python.org': P,
  'readthedocs.io': P, 'readthedocs.org': P, 'devdocs.io': P, 'w3schools.com': P, 'geeksforgeeks.org': P,
  'leetcode.com': P, 'hackerrank.com': P, 'codepen.io': P, 'codesandbox.io': P, 'stackblitz.com': P,
  'replit.com': P, 'vercel.com': P, 'netlify.com': P, 'heroku.com': P, 'cloudflare.com': P,
  'console.aws.amazon.com': P, 'aws.amazon.com': P, 'portal.azure.com': P, 'console.cloud.google.com': P, 'cloud.google.com': P,
  'docker.com': P, 'hub.docker.com': P, 'kubernetes.io': P, 'sentry.io': P, 'datadoghq.com': P,
  'localhost': P, 'regex101.com': P, 'jsfiddle.net': P, 'typescriptlang.org': P, 'react.dev': P,
  'huggingface.co': P, 'kaggle.com': P, 'colab.research.google.com': P, 'arxiv.org': P, 'paperswithcode.com': P,
  // AI assistants
  'claude.ai': P, 'chatgpt.com': P, 'chat.openai.com': P, 'gemini.google.com': P, 'perplexity.ai': P,
  'anthropic.com': P, 'platform.openai.com': P,
  // Docs, notes, PM
  'docs.google.com': P, 'sheets.google.com': P, 'slides.google.com': P, 'drive.google.com': P, 'calendar.google.com': P,
  'mail.google.com': P, 'meet.google.com': P, 'notion.so': P, 'notion.site': P, 'coda.io': P,
  'obsidian.md': P, 'evernote.com': P, 'dropbox.com': P, 'box.com': P, 'office.com': P,
  'office365.com': P, 'sharepoint.com': P, 'outlook.office.com': P, 'outlook.live.com': P, 'onedrive.live.com': P,
  'atlassian.net': P, 'atlassian.com': P, 'trello.com': P, 'asana.com': P, 'linear.app': P,
  'clickup.com': P, 'monday.com': P, 'airtable.com': P, 'miro.com': P, 'figma.com': P,
  'canva.com': P, 'zoom.us': P, 'slack.com': P, 'app.slack.com': P, 'teams.microsoft.com': P,
  'loom.com': P, 'calendly.com': P, 'overleaf.com': P, 'grammarly.com': P, 'deepl.com': P,
  // Learning & career
  'linkedin.com': P, 'coursera.org': P, 'udemy.com': P, 'edx.org': P, 'khanacademy.org': P,
  'duolingo.com': P, 'codecademy.com': P, 'freecodecamp.org': P, 'pluralsight.com': P, 'brilliant.org': P,
  'scholar.google.com': P, 'indeed.com': P, 'glassdoor.com': P,

  // Video & streaming
  'youtube.com': E, 'netflix.com': E, 'twitch.tv': E, 'hulu.com': E, 'disneyplus.com': E,
  'primevideo.com': E, 'max.com': E, 'hbomax.com': E, 'peacocktv.com': E, 'paramountplus.com': E,
  'tv.apple.com': E, 'crunchyroll.com': E, 'vimeo.com': E, 'dailymotion.com': E, 'kick.com': E,
  'hotstar.com': E, 'jiocinema.com': E,
  // Social
  'x.com': E, 'twitter.com': E, 'instagram.com': E, 'facebook.com': E, 'tiktok.com': E,
  'reddit.com': E, 'snapchat.com': E, 'pinterest.com': E, 'tumblr.com': E, 'threads.net': E,
  'bsky.app': E, 'mastodon.social': E, '9gag.com': E, 'imgur.com': E, 'discord.com': E,
  'quora.com': E,
  // Music, games, shopping
  'open.spotify.com': E, 'spotify.com': E, 'soundcloud.com': E, 'music.apple.com': E, 'music.youtube.com': E,
  'store.steampowered.com': E, 'steamcommunity.com': E, 'epicgames.com': E, 'roblox.com': E, 'chess.com': E,
  'lichess.org': E, 'ign.com': E, 'amazon.com': E, 'ebay.com': E, 'etsy.com': E,
  'aliexpress.com': E, 'temu.com': E, 'buzzfeed.com': E, 'espn.com': E,

  // Neutral: news, reference, utilities
  'google.com': N, 'bing.com': N, 'duckduckgo.com': N, 'search.brave.com': N,
  'wikipedia.org': N, 'wikimedia.org': N, 'maps.google.com': N, 'translate.google.com': N, 'news.google.com': N,
  'nytimes.com': N, 'theguardian.com': N, 'bbc.co.uk': N, 'bbc.com': N, 'cnn.com': N,
  'reuters.com': N, 'apnews.com': N, 'bloomberg.com': N, 'wsj.com': N, 'ft.com': N,
  'economist.com': N, 'medium.com': N, 'substack.com': N, 'news.ycombinator.com': N, 'weather.com': N,
  'paypal.com': N, 'icloud.com': N, 'apple.com': N, 'microsoft.com': N, 'accounts.google.com': N,
  'myaccount.google.com': N, 'photos.google.com': N, 'keep.google.com': N, 'web.whatsapp.com': N, 'messenger.com': N,
  'web.telegram.org': N, 'proton.me': N,
});
