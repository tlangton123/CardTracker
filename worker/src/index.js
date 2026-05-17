'use strict';

// ─────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────
const TCG_API  = 'https://api.pokemontcg.io/v2/sets';
const CACHE_TTL = 900; // 15 minutes

// RSS feeds — only sources confirmed or likely to serve XML from Cloudflare IPs
const RSS_SOURCES = {
  pokemon: [
    { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCFctpiB_Hnlk3ejWfHqSm6Q', label: 'Pokémon Official' },
    { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCnwlWgbcxwpsnB7LtOL1kPg', label: 'PTCGRadio'        },
    { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCBHD6Yg8R1yS9akfGm4mecQ', label: 'Leonhart'         },
    { url: 'https://sixprizes.com/feed/',                                                   label: 'Six Prizes'       },
  ],
  sports: [
    { url: 'https://www.cardboardconnection.com/feed',    label: 'Cardboard Connection'  },
    { url: 'https://www.sportscollectorsdaily.com/feed/', label: 'Sports Collectors Daily' },
    { url: 'https://www.beckett.com/news/feed/',          label: 'Beckett'               },
  ],
};

const BOT_UA = 'CardTrackerBot/1.0 (https://tlangton123.github.io/CardTracker)';

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
//  NEWS AGGREGATOR
// ─────────────────────────────────────────────
async function fetchAllNews(env, category) {
  const sources = RSS_SOURCES[category] || [];
  const results = await Promise.allSettled(
    sources.map(({ url, label }) => fetchAndParseFeed(url, label))
  );

  const seen  = new Set();
  const items = [];

  results.forEach(r => {
    if (r.status === 'fulfilled') {
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

// ─────────────────────────────────────────────
//  RSS FETCHER + PARSER
// ─────────────────────────────────────────────
async function fetchAndParseFeed(url, label) {
  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 8000);
  const ua = BOT_UA;
  try {
    const res = await fetch(url, {
      signal:  controller.signal,
      headers: { 'User-Agent': ua },
    });
    if (!res.ok) throw new Error(`Feed ${res.status}`);
    // Read at most 300 KB to avoid huge feeds stalling the Worker
    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done || total > 300_000) break;
      chunks.push(value);
      total += value.length;
    }
    reader.cancel();
    const text = new TextDecoder().decode(
      chunks.reduce((a, b) => { const c = new Uint8Array(a.length + b.length); c.set(a); c.set(b, a.length); return c; }, new Uint8Array(0))
    );
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
  const allRss   = [...RSS_SOURCES.pokemon, ...RSS_SOURCES.sports];
  const rssTests = await Promise.all(allRss.map(async ({ url, label }) => {
    try {
      const r    = await fetch(url, { headers: { 'User-Agent': BOT_UA } });
      const text = await r.text();
      const isXml = !text.trimStart().startsWith('<!');
      return { label, status: r.status, bytes: text.length, xml: isXml, preview: text.slice(0, 150) };
    } catch (e) {
      return { label, status: 'error', error: e.message };
    }
  }));
  return jsonOk({ rss: rssTests });
}
