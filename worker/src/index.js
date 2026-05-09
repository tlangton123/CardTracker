'use strict';

// ─────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────
const TCG_API = 'https://api.pokemontcg.io/v2/sets';
const CACHE_TTL = 900; // 15 minutes

const NEWS_SOURCES = {
  pokemon: [
    { url: 'https://www.reddit.com/r/PokemonTCG/new/.rss',       label: 'r/PokemonTCG'        },
    { url: 'https://www.reddit.com/r/pokemoncardmarket/new/.rss', label: 'r/pokemoncardmarket' },
    { url: 'https://www.pokebeach.com/feed',                      label: 'PokeBeach'           },
  ],
  sports: [
    { url: 'https://www.reddit.com/r/sportscards/new/.rss',       label: 'r/sportscards'       },
    { url: 'https://www.reddit.com/r/baseballcards/new/.rss',     label: 'r/baseballcards'     },
    { url: 'https://www.reddit.com/r/basketballcards/new/.rss',   label: 'r/basketballcards'   },
    { url: 'https://www.cardboardconnection.com/feed',            label: 'Cardboard Connection' },
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
        return serveCached(env, 'news-pokemon', () => fetchAllNews('pokemon'));
      case '/api/news/sports':
        return serveCached(env, 'news-sports', () => fetchAllNews('sports'));
      case '/api/health':
        return jsonOk({ status: 'ok', ts: new Date().toISOString() });
      case '/api/debug/feeds': {
        const tests = await Promise.all(
          [...NEWS_SOURCES.pokemon, ...NEWS_SOURCES.sports].map(async ({ url, label }) => {
            try {
              const r = await fetch(url, { headers: { 'User-Agent': 'CardTrackerBot/1.0' } });
              const text = await r.text();
              return { label, url, status: r.status, bytes: text.length, preview: text.slice(0, 200) };
            } catch (e) {
              return { label, url, status: 'error', error: e.message };
            }
          })
        );
        return jsonOk(tests);
      }
      default:
        return new Response('Not found', { status: 404, headers: CORS_HEADERS });
    }
  },

  // Cron trigger — refreshes all KV cache every 15 minutes
  async scheduled(event, env) {
    console.log('Cron refresh started:', new Date().toISOString());
    const results = await Promise.allSettled([
      refreshKey(env, 'pokemon-sets', fetchPokemonSets),
      refreshKey(env, 'news-pokemon', () => fetchAllNews('pokemon')),
      refreshKey(env, 'news-sports',  () => fetchAllNews('sports')),
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
  if (cached !== null) {
    return jsonOk(cached, { 'X-Cache': 'HIT' });
  }

  try {
    const data = await fetcher();
    await env.CACHE.put(key, JSON.stringify(data), { expirationTtl: CACHE_TTL });
    return jsonOk(data, { 'X-Cache': 'MISS' });
  } catch (err) {
    console.error(`Error fetching ${key}:`, err.message);
    return jsonOk({ error: err.message }, {}, 500);
  }
}

async function refreshKey(env, key, fetcher) {
  const data = await fetcher();
  await env.CACHE.put(key, JSON.stringify(data), { expirationTtl: CACHE_TTL });
}

function jsonOk(data, extra = {}, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60',
      ...extra,
    },
  });
}

// ─────────────────────────────────────────────
//  POKÉMON TCG API
// ─────────────────────────────────────────────
async function fetchPokemonSets() {
  const res = await fetch(`${TCG_API}?orderBy=-releaseDate&pageSize=60`, {
    headers: { 'User-Agent': 'CardTrackerBot/1.0' },
  });
  if (!res.ok) throw new Error(`TCG API responded with ${res.status}`);
  const { data } = await res.json();
  return data || [];
}

// ─────────────────────────────────────────────
//  NEWS FEEDS
// ─────────────────────────────────────────────
async function fetchAllNews(category) {
  const sources = NEWS_SOURCES[category] || [];

  const results = await Promise.allSettled(
    sources.map(({ url, label }) => fetchAndParseFeed(url, label))
  );

  const seen  = new Set();
  const items = [];

  results.forEach(r => {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) {
      r.value.forEach(item => {
        if (item.title && !seen.has(item.title)) {
          seen.add(item.title);
          items.push(item);
        }
      });
    }
  });

  return items
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .slice(0, 20);
}

async function fetchAndParseFeed(url, label) {
  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'CardTrackerBot/1.0' },
    });
    if (!res.ok) throw new Error(`Feed returned ${res.status}`);
    const text = await res.text();
    return parseFeed(text, label);
  } finally {
    clearTimeout(timeout);
  }
}

// ─────────────────────────────────────────────
//  FEED PARSER  (RSS 2.0 + Atom — no DOMParser in Workers)
// ─────────────────────────────────────────────
function parseFeed(xml, label) {
  // Detect format by presence of <entry> vs <item>
  const hasEntries = /<entry[\s>]/i.test(xml);
  const hasItems   = /<item[\s>]/i.test(xml);

  if (hasEntries) return parseAtom(xml, label);
  if (hasItems)   return parseRSS(xml, label);
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

// Pull all <tag>...</tag> top-level blocks out of xml string
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

// Extract inner text of first matching tag (handles CDATA)
function extractText(block, tag) {
  const cdata = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]>`, 'i');
  const plain = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const cm = block.match(cdata);
  if (cm) return cm[1].trim();
  const pm = block.match(plain);
  return pm ? pm[1].trim() : '';
}

// Extract an attribute value from the first matching tag
function extractAttr(block, tag, attr) {
  const re    = new RegExp(`<${tag}[^>]*\\s${attr}=["']([^"']*)["']`, 'i');
  const match = block.match(re);
  return match ? match[1].trim() : '';
}

function stripHtml(s) {
  return (s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(s) {
  return (s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g,  '<')
    .replace(/&gt;/g,  '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&apos;/g, "'");
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
