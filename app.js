'use strict';

const TCG_API  = 'https://api.pokemontcg.io/v2/sets';
const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

let countdownTimers = {};

// ─────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────
function init() {
  initTabs();
  renderRetailers('pokemon-retailers', POKEMON_RETAILERS);
  renderRetailers('sports-retailers',  SPORTS_RETAILERS);
  renderFollows('pokemon-follows', POKEMON_FOLLOWS);
  renderFollows('sports-follows',  SPORTS_FOLLOWS);
  renderSportsDrops();
  loadAll();

  document.getElementById('refreshBtn').addEventListener('click', () => {
    const btn = document.getElementById('refreshBtn');
    btn.classList.add('spinning');
    clearCountdowns();
    loadAll().finally(() => setTimeout(() => btn.classList.remove('spinning'), 600));
  });

  setInterval(() => { clearCountdowns(); loadAll(); }, 10 * 60 * 1000);
}

async function loadAll() {
  await Promise.allSettled([
    loadPokemonSets(),
    loadNewsFeeds('pokemon-news', NEWS_SOURCES.pokemon),
    loadNewsFeeds('sports-news',  NEWS_SOURCES.sports),
  ]);
  setLastUpdated();
}

// ─────────────────────────────────────────────
//  TABS  (mobile)
// ─────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.dataset.target;
      document.querySelectorAll('.pane').forEach(p => {
        p.classList.toggle('pane--active', p.id === target);
      });
    });
  });
}

// ─────────────────────────────────────────────
//  POKÉMON TCG API
// ─────────────────────────────────────────────
async function loadPokemonSets() {
  const el = document.getElementById('pokemon-drops');
  el.innerHTML = skeletons(3);

  try {
    const res = await fetch(`${TCG_API}?orderBy=-releaseDate&pageSize=60`);
    if (!res.ok) throw new Error(`TCG API ${res.status}`);
    const { data } = await res.json();

    const now    = new Date();
    const cutoff = daysAgo(60);

    const sets = (data || [])
      .filter(s => {
        const d = parseSetDate(s.releaseDate);
        return d >= now || d >= cutoff; // all upcoming OR past 60 days
      })
      .sort((a, b) => parseSetDate(a.releaseDate) - parseSetDate(b.releaseDate));

    if (!sets.length) {
      el.innerHTML = emptyState('No recent or upcoming Pokémon sets found.');
      return;
    }

    const next = sets.find(s => parseSetDate(s.releaseDate) >= now);
    if (next) startCountdown('pokemon', next.name, parseSetDate(next.releaseDate));

    el.innerHTML = '';
    sets.forEach((s, i) => {
      const card = buildPokemonCard(s, s.id === next?.id);
      card.style.animationDelay = `${i * 40}ms`;
      el.appendChild(card);
    });
  } catch (err) {
    el.innerHTML = errorState('Could not load Pokémon sets. ', 'Check PokeBeach →', 'https://www.pokebeach.com');
  }
}

function buildPokemonCard(set, isFeatured = false) {
  const date   = parseSetDate(set.releaseDate);
  const now    = new Date();
  const isPast = date < now;
  const diff   = date - now;
  const isNew  = !isPast && diff < 7 * 86400000;
  const isSoon = !isPast && diff < 30 * 86400000;

  const div = document.createElement('div');
  div.className = `drop-card drop-card--pokemon ${isPast ? 'is-past' : 'is-upcoming'} ${isFeatured ? 'is-featured' : ''}`;

  div.innerHTML = `
    <div class="drop-card__symbol">
      ${set.images?.symbol
        ? `<img class="set-symbol" src="${set.images.symbol}" alt="${esc(set.name)}" loading="lazy" />`
        : `<span class="set-symbol-placeholder">⚡</span>`}
    </div>
    <div class="drop-card__main">
      <div class="drop-card__top-row">
        <div class="drop-card__name">${esc(set.name)}</div>
        <div class="drop-card__badges">
          ${isFeatured && !isPast      ? '<span class="badge-featured">NEXT DROP</span>' : ''}
          ${isNew      && !isFeatured  ? '<span class="badge-new">NEW</span>'            : ''}
          ${isSoon     && !isNew && !isFeatured ? '<span class="badge-upcoming">SOON</span>' : ''}
          ${isPast                     ? '<span class="badge-out">OUT NOW</span>'        : ''}
          <a href="https://x.com/search?q=${encodeURIComponent(set.name + ' pokemon tcg')}"
             target="_blank" rel="noopener" class="x-search-link" title="Search on X">𝕏</a>
        </div>
      </div>
      <div class="drop-card__meta">
        <span>${esc(set.series)}</span>
        ${set.printedTotal ? `<span class="meta-dot">·</span><span>${set.printedTotal} cards</span>` : ''}
        ${set.ptcgoCode    ? `<span class="meta-dot">·</span><span>${esc(set.ptcgoCode)}</span>`     : ''}
      </div>
      <div class="drop-card__date">
        <span class="date-label">${isPast ? 'Released' : 'Releases'}</span>
        <span class="date-value">${fmtDate(date)}</span>
        <span class="date-relative ${isPast ? 'is-past' : 'is-future'}">${relDate(date)}</span>
      </div>
    </div>`;

  return div;
}

// ─────────────────────────────────────────────
//  SPORTS  (curated — no date cutoff)
// ─────────────────────────────────────────────
function renderSportsDrops() {
  const el  = document.getElementById('sports-drops');
  const now = new Date();

  const drops = [...SPORTS_CURATED_DROPS]
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (!drops.length) {
    el.innerHTML = emptyState('No sports drops found. Edit data.js to add releases.');
    return;
  }

  const next = drops.find(d => new Date(d.date) >= now);
  if (next) startCountdown('sports', next.name, new Date(next.date));

  el.innerHTML = '';
  drops.forEach((d, i) => {
    const card = buildSportsCard(d, d.id === next?.id);
    card.style.animationDelay = `${i * 40}ms`;
    el.appendChild(card);
  });
}

function buildSportsCard(drop, isFeatured = false) {
  const date   = new Date(drop.date);
  const now    = new Date();
  const isPast = date < now;
  const diff   = date - now;
  const isNew  = !isPast && diff < 7 * 86400000;

  const hueCls = { high: 'hype-high', medium: 'hype-medium', low: 'hype-low' };

  const retailerLinks = (drop.retailers || []).map(r =>
    `<a href="${r.url}" target="_blank" rel="noopener" class="retailer-link">${esc(r.name)}</a>`
  ).join('');

  const keyChips = (drop.keyCards || []).map(c =>
    `<span class="key-card">${esc(c)}</span>`
  ).join('');

  const div = document.createElement('div');
  div.className = `drop-card drop-card--sports ${isPast ? 'is-past' : 'is-upcoming'} ${isFeatured ? 'is-featured' : ''}`;

  div.innerHTML = `
    <div class="drop-card__main">
      <div class="drop-card__top-row">
        <div class="drop-card__name">${esc(drop.name)}</div>
        <div class="drop-card__badges">
          ${isFeatured && !isPast     ? '<span class="badge-featured">NEXT DROP</span>'                                                    : ''}
          ${isNew      && !isFeatured ? '<span class="badge-new">NEW</span>'                                                               : ''}
          ${!isPast                   ? `<span class="hype-badge ${hueCls[drop.hype] || 'hype-medium'}">${(drop.hype||'mid').toUpperCase()} HYPE</span>` : ''}
          ${isPast                    ? '<span class="badge-out">OUT NOW</span>'                                                           : ''}
        </div>
      </div>
      <div class="drop-card__meta">
        <span>${esc(drop.sport)}</span>
        <span class="meta-dot">·</span>
        <span>${esc(drop.manufacturer)}</span>
      </div>
      <div class="drop-card__date">
        <span class="date-label">${isPast ? 'Released' : 'Releases'}</span>
        <span class="date-value">${fmtDate(date)}</span>
        <span class="date-relative ${isPast ? 'is-past' : 'is-future'}">${relDate(date)}</span>
      </div>
      ${keyChips ? `<div class="key-cards">${keyChips}</div>` : ''}
      <div class="drop-card__links">
        ${retailerLinks}
        <a href="${drop.xSearch}"   target="_blank" rel="noopener" class="x-search-link">𝕏 Search</a>
        <a href="${drop.xAnnounce}" target="_blank" rel="noopener" class="x-search-link">𝕏 Official</a>
      </div>
    </div>`;

  return div;
}

// ─────────────────────────────────────────────
//  NEWS FEEDS  (Reddit JSON + RSS XML via allorigins proxy)
// ─────────────────────────────────────────────
async function loadNewsFeeds(containerId, sources) {
  const el = document.getElementById(containerId);
  el.innerHTML = skeletons(3);

  const results = await Promise.allSettled(
    sources.map(({ url, label, type }) =>
      fetch(CORS_PROXY + encodeURIComponent(url))
        .then(r => r.ok ? r.text() : Promise.reject(r.status))
        .then(text => type === 'reddit' ? parseReddit(text, label) : parseRSS(text, label))
    )
  );

  const seen  = new Set();
  let   items = [];

  results.forEach(r => {
    if (r.status === 'fulfilled' && r.value?.length) {
      r.value.forEach(item => {
        if (!seen.has(item.title)) {
          seen.add(item.title);
          items.push(item);
        }
      });
    }
  });

  if (!items.length) {
    el.innerHTML = errorState('Could not load news feed — sources may be temporarily unavailable.');
    return;
  }

  items = items
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .slice(0, 14);

  el.innerHTML = '';
  items.forEach((item, i) => {
    const card = buildNewsCard(item);
    card.style.animationDelay = `${i * 30}ms`;
    el.appendChild(card);
  });
}

function parseReddit(text, label) {
  try {
    const json = JSON.parse(text);
    if (!json?.data?.children) return [];
    return json.data.children
      .filter(c => c.kind === 't3' && !c.data.stickied)
      .map(({ data: d }) => ({
        title:       d.title,
        link:        `https://www.reddit.com${d.permalink}`,
        pubDate:     new Date(d.created_utc * 1000).toISOString(),
        description: d.selftext || '',
        _source:     label,
      }));
  } catch { return []; }
}

function parseRSS(xmlText, label) {
  try {
    const doc   = new DOMParser().parseFromString(xmlText, 'text/xml');
    const items = [...doc.querySelectorAll('item')];
    return items.slice(0, 8).map(item => {
      const linkEl = item.querySelector('link');
      const link   = linkEl?.textContent?.trim()
                  || linkEl?.nextSibling?.textContent?.trim()
                  || item.querySelector('guid')?.textContent?.trim()
                  || '';
      return {
        title:       item.querySelector('title')?.textContent?.trim() || '',
        link,
        pubDate:     item.querySelector('pubDate')?.textContent?.trim() || '',
        description: stripHtml(item.querySelector('description')?.textContent || ''),
        _source:     label,
      };
    }).filter(i => i.title && i.link);
  } catch { return []; }
}

function buildNewsCard(item) {
  const pubDate = item.pubDate ? new Date(item.pubDate) : null;
  const domain  = tryDomain(item.link);
  const desc    = (item.description || '').slice(0, 130).trim();

  const div = document.createElement('div');
  div.className = 'news-card';
  div.innerHTML = `
    <a href="${item.link}" target="_blank" rel="noopener" class="news-card__title">${esc(item.title || 'Untitled')}</a>
    ${desc ? `<div class="news-card__desc">${esc(desc)}…</div>` : ''}
    <div class="news-card__meta">
      <span class="news-source">${esc(item._source || domain)}</span>
      ${pubDate && !isNaN(pubDate) ? `<span class="news-date">${relDate(pubDate)}</span>` : ''}
    </div>`;
  return div;
}

// ─────────────────────────────────────────────
//  RETAILERS
// ─────────────────────────────────────────────
function renderRetailers(id, list) {
  document.getElementById(id).innerHTML = list.map(r => `
    <a href="${r.url}" target="_blank" rel="noopener" class="retailer-card">
      <span class="retailer-icon">${r.icon}</span>
      <div class="retailer-info">
        <div class="retailer-name">${esc(r.name)}</div>
        <div class="retailer-note">${esc(r.note)}</div>
      </div>
      <span class="retailer-arrow">→</span>
    </a>`).join('');
}

// ─────────────────────────────────────────────
//  X FOLLOWS
// ─────────────────────────────────────────────
function renderFollows(id, list) {
  document.getElementById(id).innerHTML = list.map(f => `
    <a href="${f.url}" target="_blank" rel="noopener" class="follow-card">
      <div class="follow-handle">${esc(f.handle)}${f.verified ? ' ✓' : ''}</div>
      <div class="follow-note">${esc(f.note)}</div>
    </a>`).join('');
}

// ─────────────────────────────────────────────
//  COUNTDOWN TIMERS
// ─────────────────────────────────────────────
function startCountdown(key, name, targetDate) {
  const banner  = document.getElementById(`${key}-countdown-banner`);
  const nameEl  = document.getElementById(`${key}-countdown-name`);
  const timerEl = document.getElementById(`${key}-countdown-timer`);
  if (!banner || targetDate <= new Date()) return;

  nameEl.textContent   = name;
  banner.style.display = 'flex';
  if (countdownTimers[key]) clearInterval(countdownTimers[key]);

  const tick = () => {
    const ms = targetDate - new Date();
    if (ms <= 0) { timerEl.textContent = 'OUT NOW'; clearInterval(countdownTimers[key]); return; }
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000)  / 60000);
    const s = Math.floor((ms % 60000)    / 1000);
    timerEl.textContent = d > 0
      ? `${d}d ${pad(h)}h ${pad(m)}m`
      : `${pad(h)}h ${pad(m)}m ${pad(s)}s`;
  };
  tick();
  countdownTimers[key] = setInterval(tick, 1000);
}

function clearCountdowns() {
  Object.values(countdownTimers).forEach(clearInterval);
  countdownTimers = {};
  ['pokemon', 'sports'].forEach(k => {
    const b = document.getElementById(`${k}-countdown-banner`);
    if (b) b.style.display = 'none';
  });
}

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function parseSetDate(str) {
  return new Date(String(str).replace(/\//g, '-'));
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function fmtDate(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function relDate(d) {
  const diff = d - new Date();
  const abs  = Math.abs(diff);
  const days = Math.floor(abs / 86400000);
  if (diff < 0) {
    if (days  ===  0) return 'today';
    if (days  ===  1) return 'yesterday';
    if (days  <   7) return `${days}d ago`;
    if (days  <  30) return `${Math.floor(days / 7)}w ago`;
    if (days  < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
  } else {
    if (days  ===  0) return 'today';
    if (days  ===  1) return 'tomorrow';
    if (days  <   7) return `in ${days}d`;
    if (days  <  30) return `in ${Math.floor(days / 7)}w`;
    if (days  < 365) return `in ${Math.floor(days / 30)}mo`;
    return `in ${Math.floor(days / 365)}y`;
  }
}

function stripHtml(s) {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function tryDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return ''; }
}

function skeletons(n) {
  return Array(n).fill(0).map(() => `
    <div class="skeleton-card">
      <div class="sk sk-title"></div>
      <div class="sk sk-line"></div>
      <div class="sk sk-line sk-short"></div>
    </div>`).join('');
}

function emptyState(msg) { return `<div class="empty-state">${msg}</div>`; }

function errorState(msg, linkText, linkHref) {
  const link = linkText ? `<a href="${linkHref}" target="_blank" rel="noopener">${linkText}</a>` : '';
  return `<div class="error-state">⚠️ ${msg}${link}</div>`;
}

function setLastUpdated() {
  const el = document.getElementById('last-updated');
  if (el) el.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

document.addEventListener('DOMContentLoaded', init);
