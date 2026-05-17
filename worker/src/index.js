'use strict';

// ─────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────
const TCG_API  = 'https://api.pokemontcg.io/v2/sets';
const CACHE_TTL = 900; // 15 minutes

// Reddit subreddits — fetched via public JSON API (no OAuth needed)
const REDDIT_SUBS = {
  pokemon: ['PokemonTCG', 'pokemoncardmarket'],
  sports:  ['sportscards', 'baseballcards', 'basketballcards'],
};

// RSS feeds confirmed to return valid XML from Cloudflare IPs
const RSS_SOURCES = {
  pokemon: [
    { url: 'https://www.pokeguardian.com/feed/',          label: 'PokéGuardian'          },
  ],
  sports: [
    { url: 'https://www.cardboardconnection.com/feed',    label: 'Cardboard Connection'  },
    { url: 'https://www.sportscollectorsdaily.com/feed/', label: 'Sports Collectors Daily' },
    { url: 'https://www.beckett.com/news/feed/',          label: 'Beckett'               },
  ],
};

// Browser-like UA for sites that block generic bot strings
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const BOT_UA     = 'CardTrackerBot/1.0 (https://tlangton123.github.io/CardTracker)';

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
        return jsonOk({ status: 'ok', ts: new Date().toISOString() });
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
//  REDDIT  (public JSON API — no OAuth required)
// ─────────────────────────────────────────────
async function fetchRedditPosts(env, subreddit) {
  const res = await fetch(
    `https://www.reddit.com/r/${subreddit}/new.json?limit=15&raw_json=1`,
    { headers: { 'User-Agent': BOT_UA } }
  );
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
  // Some sites (e.g. PokéGuardian) require a browser-like UA to serve RSS
  const ua = url.includes('pokeguardian') ? BROWSER_UA : BOT_UA;
  try {
    const res = await fetch(url, {
      signal:  controller.signal,
      headers: { 'User-Agent': ua },
    });
    if (!res.ok) throw new Error(`Feed ${res.status}`);
    const text = await res.text();
    // If response looks like HTML rather than XML, bail out
    if (text.trimStart().startsWith('<!')) throw new Error('Feed returned HTML, not XML');
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
      const ua   = url.includes('pokeguardian') ? BROWSER_UA : BOT_UA;
      const r    = await fetch(url, { headers: { 'User-Agent': ua } });
      const text = await r.text();
      const isXml = !text.trimStart().startsWith('<!');
      return { label, status: r.status, bytes: text.length, xml: isXml, preview: text.slice(0, 150) };
    } catch (e) {
      return { label, status: 'error', error: e.message };
    }
  }));

  const redditTests = await Promise.all(
    ['PokemonTCG', 'sportscards'].map(async sub => {
      try {
        const posts = await fetchRedditPosts(env, sub);
        return { sub, posts: posts.length, sample: posts[0]?.title || null };
      } catch (e) {
        return { sub, error: e.message };
      }
    })
  );

  return jsonOk({ rss: rssTests, reddit: redditTests });
}
