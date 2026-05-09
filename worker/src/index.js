'use strict';

// ─────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────
const TCG_API  = 'https://api.pokemontcg.io/v2/sets';
const CACHE_TTL = 900; // 15 minutes

// Reddit subreddits fetched via OAuth API (no blocking)
const REDDIT_SUBS = {
  pokemon: ['PokemonTCG', 'pokemoncardmarket'],
  sports:  ['sportscards', 'baseballcards', 'basketballcards'],
};

// RSS feeds confirmed to return valid XML from Cloudflare IPs
const RSS_SOURCES = {
  pokemon: [],
  sports: [
    { url: 'https://www.cardboardconnection.com/feed',          label: 'Cardboard Connection'  },
    { url: 'https://www.sportscollectorsdaily.com/feed/',       label: 'Sports Collectors Daily' },
    { url: 'https://www.beckett.com/news/feed/',                label: 'Beckett'               },
  ],
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ─────────────────────────────────────────────
//  ENTRY POINTS
// ─────────────────────────────────────────────
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
    }

    const { pathname } = new URL(request.url);

    switch (pathname) {
      case '/api/pokemon-sets':
        return serveCached(env, 'pokemon-sets', fetchPokemonSets);
      case '/api/news/pokemon':
        return serveCached(env, 'news-pokemon', () => fetchAllNews(env, 'pokemon'));
      case '/api/news/sports':
        return serveCached(env, 'news-sports',  () => fetchAllNews(env, 'sports'));
      case '/api/health':
        return jsonOk({ status: 'ok', ts: new Date().toISOString(), reddit: !!(env.REDDIT_CLIENT_ID) });
      case '/api/debug/feeds':
        return debugFeeds(env);
      default:
        return new Response('Not found', { status: 404, headers: CORS_HEADERS });
    }
  },

  async scheduled(event, env) {
    console.log('Cron refresh started:', new Date().toISOString());
    const results = await Promise.allSettled([
      refreshKey(env, 'pokemon-sets', fetchPokemonSets),
      refreshKey(env, 'news-pokemon', () => fetchAllNews(env, 'pokemon')),
      refreshKey(env, 'news-sports',  () => fetchAllNews(env, 'sports')),
    ]);
    results.forEach((r, i) => {
      const key = ['pokemon-sets', 'news-pokemon', 'news-sports'][i];
      if (r.status === 'rejected') console.error(`Failed to refresh ${key}:`, r.reason);
      else console.log(`Refreshed ${key}`);
    });
  },
};

// ─────────────────────────────────────────────
//  CACHE LAYER
// ─────────────────────────────────────────────
async function serveCached(env, key, fetcher) {
  const cached = await env.CACHE.get(key, 'json');
  if (cached !== null) return jsonOk(cached, { 'X-Cache': 'HIT' });

  try {
    const data = await fetcher();
    await env.CACHE.put(key, JSON.stringify(data), { expirationTtl: CACHE_TTL });
    return jsonOk(data, { 'X-Cache': 'MISS' });
  } catch (err) {
    console.error(`Error fetching ${key}:`, err.message);
    return jsonOk([], {}, 500);
  }
}

async function refreshKey(env, key, fetcher) {
  const data = await fetcher();
  await env.CACHE.put(key, JSON.stringify(data), { expirationTtl: CACHE_TTL });
}

function jsonOk(data, extra = {}, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60', ...extra },
  });
}

// ─────────────────────────────────────────────
//  POKÉMON TCG API
// ─────────────────────────────────────────────
async function fetchPokemonSets() {
  const res = await fetch(`${TCG_API}?orderBy=-releaseDate&pageSize=60`, {
    headers: { 'User-Agent': 'CardTrackerBot/1.0' },
  });
  if (!res.ok) throw new Error(`TCG API ${res.status}`);
  const { data } = await res.json();
  return data || [];
}

// ─────────────────────────────────────────────
//  REDDIT OAUTH  (app-only, no user login needed)
// ─────────────────────────────────────────────
async function getRedditToken(env) {
  if (!env.REDDIT_CLIENT_ID || !env.REDDIT_CLIENT_SECRET) return null;

  // Reuse cached token if still valid
  const cached = await env.CACHE.get('reddit-token', 'json');
  if (cached && cached.expires > Date.now()) return cached.token;

  const creds = btoa(`${env.REDDIT_CLIENT_ID}:${env.REDDIT_CLIENT_SECRET}`);
  const res   = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${creds}`,
      'User-Agent':    'CardTrackerBot/1.0 by CardTrackerApp',
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) throw new Error(`Reddit token request failed: ${res.status}`);
  const { access_token, expires_in } = await res.json();

  await env.CACHE.put('reddit-token', JSON.stringify({
    token:   access_token,
    expires: Date.now() + (expires_in - 300) * 1000, // 5min buffer
  }), { expirationTtl: expires_in });

  return access_token;
}

async function fetchRedditPosts(env, subreddit) {
  const token = await getRedditToken(env);
  if (!token) return [];

  const res = await fetch(`https://oauth.reddit.com/r/${subreddit}/new.json?limit=15`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent':    'CardTrackerBot/1.0 by CardTrackerApp',
    },
  });
  if (!res.ok) throw new Error(`Reddit /r/${subreddit} ${res.status}`);

  const json = await res.json();
  return (json.data?.children || [])
    .filter(c => !c.data.stickied)
    .map(({ data: d }) => ({
      title:       d.title,
      link:        `https://www.reddit.com${d.permalink}`,
      pubDate:     new Date(d.created_utc * 1000).toISOString(),
      description: truncate(d.selftext || '', 200),
      _source:     `r/${subreddit}`,
    }));
}

// ─────────────────────────────────────────────
//  NEWS AGGREGATOR
// ─────────────────────────────────────────────
async function fetchAllNews(env, category) {
  const rssSources    = RSS_SOURCES[category]    || [];
  const redditSubs    = REDDIT_SUBS[category]    || [];

  const [rssResults, redditResults] = await Promise.all([
    Promise.allSettled(rssSources.map(({ url, label }) => fetchAndParseFeed(url, label))),
    Promise.allSettled(redditSubs.map(sub => fetchRedditPosts(env, sub))),
  ]);

  const seen  = new Set();
  const items = [];

  const add = arr => arr.forEach(item => {
    if (item.title && !seen.has(item.title)) {
      seen.add(item.title);
      items.push(item);
    }
  });

  rssResults.forEach(r => r.status === 'fulfilled' && add(r.value));
  redditResults.forEach(r => r.status === 'fulfilled' && add(r.value));

  return items
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .slice(0, 20);
}

// ─────────────────────────────────────────────
//  RSS FETCHER + PARSER
// ─────────────────────────────────────────────
async function fetchAndParseFeed(url, label) {
  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal:  controller.signal,
      headers: { 'User-Agent': 'CardTrackerBot/1.0' },
    });
    if (!res.ok) throw new Error(`Feed ${res.status}`);
    const text = await res.text();
    return parseFeed(text, label);
  } finally {
    clearTimeout(timeout);
  }
}

function parseFeed(xml, label) {
  if (/<entry[\s>]/i.test(xml)) return parseAtom(xml, label);
  if (/<item[\s>]/i.test(xml))  return parseRSS(xml, label);
  return [];
}

function parseRSS(xml, label) {
  return extractBlocks(xml, 'item').slice(0, 10).map(block => ({
    title:       decodeEntities(extractText(block, 'title')),
    link:        extractText(block, 'link') || extractText(block, 'guid'),
    pubDate:     extractText(block, 'pubDate'),
    description: truncate(stripHtml(extractText(block, 'description')), 200),
    _source:     label,
  })).filter(i => i.title && i.link);
}

function parseAtom(xml, label) {
  return extractBlocks(xml, 'entry').slice(0, 10).map(block => ({
    title:       decodeEntities(extractText(block, 'title')),
    link:        extractAttr(block, 'link', 'href'),
    pubDate:     extractText(block, 'published') || extractText(block, 'updated'),
    description: truncate(stripHtml(extractText(block, 'summary') || extractText(block, 'content')), 200),
    _source:     label,
  })).filter(i => i.title && i.link);
}

function extractBlocks(xml, tag) {
  const blocks = [];
  const open   = new RegExp(`<${tag}[\\s>]`, 'gi');
  const close  = `</${tag}>`;
  let match;
  open.lastIndex = 0;
  while ((match = open.exec(xml)) !== null) {
    const start = match.index;
    const end   = xml.indexOf(close, start);
    if (end === -1) break;
    blocks.push(xml.slice(start, end + close.length));
  }
  return blocks;
}

function extractText(block, tag) {
  const cm = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]>`, 'i'));
  if (cm) return cm[1].trim();
  const pm = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return pm ? pm[1].trim() : '';
}

function extractAttr(block, tag, attr) {
  const match = block.match(new RegExp(`<${tag}[^>]*\\s${attr}=["']([^"']*)["']`, 'i'));
  return match ? match[1].trim() : '';
}

function stripHtml(s) {
  return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function decodeEntities(s) {
  return (s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

// ─────────────────────────────────────────────
//  DEBUG ENDPOINT
// ─────────────────────────────────────────────
async function debugFeeds(env) {
  const allRss = [...RSS_SOURCES.pokemon, ...RSS_SOURCES.sports];
  const rssTests = await Promise.all(allRss.map(async ({ url, label }) => {
    try {
      const r    = await fetch(url, { headers: { 'User-Agent': 'CardTrackerBot/1.0' } });
      const text = await r.text();
      return { label, status: r.status, bytes: text.length, preview: text.slice(0, 150) };
    } catch (e) {
      return { label, status: 'error', error: e.message };
    }
  }));

  const redditOk = !!(env.REDDIT_CLIENT_ID && env.REDDIT_CLIENT_SECRET);
  let redditTest = { configured: redditOk };
  if (redditOk) {
    try {
      const token = await getRedditToken(env);
      redditTest.token = token ? 'obtained' : 'failed';
      if (token) {
        const posts = await fetchRedditPosts(env, 'PokemonTCG');
        redditTest.pokemonTCG_posts = posts.length;
      }
    } catch (e) {
      redditTest.error = e.message;
    }
  }

  return jsonOk({ rss: rssTests, reddit: redditTest });
}
