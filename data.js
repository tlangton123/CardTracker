'use strict';

// ─────────────────────────────────────────────
//  POKÉMON RETAILERS  –  direct buy / queue links
// ─────────────────────────────────────────────
const POKEMON_RETAILERS = [
  {
    name: 'Pokémon Center',
    url: 'https://www.pokemoncenter.com/category/card-game',
    note: 'Official drops — limited, sells out fast',
    icon: '🏪',
  },
  {
    name: 'Target',
    url: 'https://www.target.com/c/pokemon-trading-card-game/-/N-4y87n',
    note: 'Use Target app to join in-store queue',
    icon: '🎯',
  },
  {
    name: 'Walmart',
    url: 'https://www.walmart.com/search?q=pokemon+trading+card+game&sort=new',
    note: 'Online drops at 12am ET on release day',
    icon: '🔵',
  },
  {
    name: 'GameStop',
    url: 'https://www.gamestop.com/trading-cards/pokemon',
    note: 'Pre-orders open before street date',
    icon: '🎮',
  },
  {
    name: 'Amazon',
    url: 'https://www.amazon.com/s?k=pokemon+tcg&s=date-desc-rank',
    note: 'Watch for pre-orders & release day drops',
    icon: '📦',
  },
  {
    name: 'Best Buy',
    url: 'https://www.bestbuy.com/site/searchpage.jsp?st=pokemon+cards',
    note: 'In-store & online — check weekly ad',
    icon: '💛',
  },
  {
    name: 'Costco',
    url: 'https://www.costco.com/pokemon.html',
    note: 'Bundle deals — warehouse & online',
    icon: '🏬',
  },
];

// ─────────────────────────────────────────────
//  SPORTS RETAILERS  –  direct buy / queue links
// ─────────────────────────────────────────────
const SPORTS_RETAILERS = [
  {
    name: 'Panini Direct',
    url: 'https://www.paniniamerica.net/',
    note: 'Timed drops direct from manufacturer',
    icon: '🏢',
  },
  {
    name: 'Topps',
    url: 'https://www.topps.com/products/baseball',
    note: 'Direct sales + Topps Now daily drops',
    icon: '⚾',
  },
  {
    name: 'Fanatics',
    url: 'https://www.fanatics.com/trading-cards/',
    note: 'Pre-orders + exclusive releases',
    icon: '🏆',
  },
  {
    name: 'Blowout Cards',
    url: 'https://www.blowoutcards.com/',
    note: 'Hobby boxes, pre-orders, group breaks',
    icon: '💥',
  },
  {
    name: "Dave & Adam's",
    url: 'https://www.dacardworld.com/',
    note: 'Boxes, cases, pre-orders ship release day',
    icon: '📬',
  },
  {
    name: 'Steel City Collectibles',
    url: 'https://www.steelcitycollectibles.com/',
    note: 'Hobby & retail boxes, pre-orders',
    icon: '🔩',
  },
  {
    name: 'Target Sports',
    url: 'https://www.target.com/c/sports-fan-shop/trading-cards/-/N-4y6d2Z55p3u',
    note: 'Retail drops — check Friday restock',
    icon: '🎯',
  },
  {
    name: 'Walmart Sports',
    url: 'https://www.walmart.com/search?q=sports+trading+cards+new+release',
    note: 'Retail & online drops',
    icon: '🔵',
  },
];

// ─────────────────────────────────────────────
//  POKÉMON — X ACCOUNTS TO FOLLOW
// ─────────────────────────────────────────────
const POKEMON_FOLLOWS = [
  { handle: '@PokemonTCG',      url: 'https://x.com/PokemonTCG',      note: 'Official TCG announcements',    verified: true  },
  { handle: '@Pokemon',         url: 'https://x.com/Pokemon',         note: 'Official Pokémon Company',      verified: true  },
  { handle: '@PokeBeach',       url: 'https://x.com/PokeBeach',       note: 'News, set reveals & spoilers',  verified: false },
  { handle: '@PokemonTCGNews',  url: 'https://x.com/PokemonTCGNews',  note: 'Release & restock alerts',      verified: false },
  { handle: '@pokejungle',      url: 'https://x.com/pokejungle',      note: 'Set reveals & hobby news',      verified: false },
  { handle: '@smpratte',        url: 'https://x.com/smpratte',        note: 'Market analysis & restocks',    verified: false },
];

// ─────────────────────────────────────────────
//  SPORTS — X ACCOUNTS TO FOLLOW
// ─────────────────────────────────────────────
const SPORTS_FOLLOWS = [
  { handle: '@PaniniAmerica',   url: 'https://x.com/PaniniAmerica',   note: 'Official drops & announcements', verified: true  },
  { handle: '@Topps',           url: 'https://x.com/Topps',           note: 'Topps Now & set drops',          verified: true  },
  { handle: '@Fanatics',        url: 'https://x.com/Fanatics',        note: 'Release announcements',          verified: true  },
  { handle: '@BlowoutCards',    url: 'https://x.com/BlowoutCards',    note: 'Pre-order & break alerts',       verified: false },
  { handle: '@Beckett_Media',   url: 'https://x.com/Beckett_Media',   note: 'Hobby news & price guides',      verified: false },
  { handle: '@CardboardConn',   url: 'https://x.com/CardboardConn',   note: 'Release dates & checklists',     verified: false },
];

// ─────────────────────────────────────────────
//  SPORTS CURATED DROPS
//  Update this list manually as new sets are announced.
//  The Pokémon side is powered by the live TCG API.
// ─────────────────────────────────────────────
const SPORTS_CURATED_DROPS = [
  {
    id: 'sp-topps-s1-2025',
    name: '2025 Topps Series 1 Baseball',
    date: '2025-02-05',
    sport: 'Baseball',
    manufacturer: 'Topps',
    hype: 'high',
    keyCards: ['Rookie Short Prints', 'Image Variations', '1990 Topps Chrome Reprints'],
    retailers: [
      { name: 'Topps.com',      url: 'https://www.topps.com/products/baseball' },
      { name: 'Blowout Cards',  url: 'https://www.blowoutcards.com/baseball-cards.html' },
      { name: "Dave & Adam's",  url: 'https://www.dacardworld.com/sports-cards/baseball-cards' },
      { name: 'Target',         url: 'https://www.target.com/c/mlb-fan-shop/trading-cards/-/N-nm7v9Z4y87p' },
    ],
    xSearch: 'https://x.com/search?q=%222025+Topps+Series+1%22',
    xAnnounce: 'https://x.com/Topps',
  },
  {
    id: 'sp-prizm-bball-2425',
    name: '2024-25 Panini Prizm Basketball',
    date: '2025-01-22',
    sport: 'Basketball',
    manufacturer: 'Panini',
    hype: 'high',
    keyCards: ['Prizm RC Autos', 'Silver Prizm Parallels', 'Gold Prizm /10'],
    retailers: [
      { name: 'Panini Direct',  url: 'https://www.paniniamerica.net/basketball/' },
      { name: 'Fanatics',       url: 'https://www.fanatics.com/trading-cards/basketball/' },
      { name: 'Blowout Cards',  url: 'https://www.blowoutcards.com/basketball-cards.html' },
      { name: 'Steel City',     url: 'https://www.steelcitycollectibles.com/basketball-cards' },
    ],
    xSearch: 'https://x.com/search?q=%22Prizm+Basketball+2025%22',
    xAnnounce: 'https://x.com/PaniniAmerica',
  },
  {
    id: 'sp-chrome-2025',
    name: '2025 Topps Chrome Baseball',
    date: '2025-08-20',
    sport: 'Baseball',
    manufacturer: 'Topps',
    hype: 'high',
    keyCards: ['Rookie Autos', 'Refractor Parallels', 'Gold Refractor /50'],
    retailers: [
      { name: 'Topps.com',      url: 'https://www.topps.com/products/baseball' },
      { name: 'Blowout Cards',  url: 'https://www.blowoutcards.com/baseball-cards.html' },
      { name: "Dave & Adam's",  url: 'https://www.dacardworld.com/sports-cards/baseball-cards' },
    ],
    xSearch: 'https://x.com/search?q=%222025+Topps+Chrome%22',
    xAnnounce: 'https://x.com/Topps',
  },
  {
    id: 'sp-prizm-draft-2025',
    name: '2025 Panini Prizm Draft Picks Football',
    date: '2025-10-08',
    sport: 'Football',
    manufacturer: 'Panini',
    hype: 'high',
    keyCards: ['Draft Pick RC Autos', 'Prizm Parallels', 'Hyper Prizm'],
    retailers: [
      { name: 'Panini Direct',  url: 'https://www.paniniamerica.net/football/' },
      { name: 'Blowout Cards',  url: 'https://www.blowoutcards.com/football-cards.html' },
      { name: 'Steel City',     url: 'https://www.steelcitycollectibles.com/football-cards' },
      { name: 'Fanatics',       url: 'https://www.fanatics.com/trading-cards/football/' },
    ],
    xSearch: 'https://x.com/search?q=%22Prizm+Draft+Football+2025%22',
    xAnnounce: 'https://x.com/PaniniAmerica',
  },
  {
    id: 'sp-prizm-football-2025',
    name: '2025 Panini Prizm Football',
    date: '2025-12-10',
    sport: 'Football',
    manufacturer: 'Panini',
    hype: 'high',
    keyCards: ['Rookie Autos', 'Silver Prizm RC', 'Mojo Prizm Parallels'],
    retailers: [
      { name: 'Panini Direct',  url: 'https://www.paniniamerica.net/football/' },
      { name: 'Blowout Cards',  url: 'https://www.blowoutcards.com/football-cards.html' },
      { name: "Dave & Adam's",  url: 'https://www.dacardworld.com/sports-cards/football-cards' },
    ],
    xSearch: 'https://x.com/search?q=%22Prizm+Football+2025%22',
    xAnnounce: 'https://x.com/PaniniAmerica',
  },
  {
    id: 'sp-optic-bball-2526',
    name: '2025-26 Panini Donruss Optic Basketball',
    date: '2026-03-18',
    sport: 'Basketball',
    manufacturer: 'Panini',
    hype: 'medium',
    keyCards: ['Rated Rookie Autos', 'Holo Parallels', 'Gold /10'],
    retailers: [
      { name: 'Panini Direct',  url: 'https://www.paniniamerica.net/basketball/' },
      { name: 'Blowout Cards',  url: 'https://www.blowoutcards.com/basketball-cards.html' },
      { name: 'Fanatics',       url: 'https://www.fanatics.com/trading-cards/basketball/' },
    ],
    xSearch: 'https://x.com/search?q=%22Donruss+Optic+Basketball+2026%22',
    xAnnounce: 'https://x.com/PaniniAmerica',
  },
];

// ─────────────────────────────────────────────
//  NEWS SOURCES
//  type:'reddit' → fetched via allorigins proxy, parsed as JSON
//  type:'rss'    → fetched via allorigins proxy, parsed as XML
// ─────────────────────────────────────────────
const NEWS_SOURCES = {
  pokemon: [
    { url: 'https://www.reddit.com/r/PokemonTCG/new.json?limit=10&raw_json=1',      label: 'r/PokemonTCG',        type: 'reddit' },
    { url: 'https://www.reddit.com/r/pokemoncardmarket/new.json?limit=8&raw_json=1', label: 'r/pokemoncardmarket', type: 'reddit' },
    { url: 'https://www.pokebeach.com/feed',                                          label: 'PokeBeach',           type: 'rss'    },
  ],
  sports: [
    { url: 'https://www.reddit.com/r/sportscards/new.json?limit=10&raw_json=1',      label: 'r/sportscards',       type: 'reddit' },
    { url: 'https://www.reddit.com/r/baseballcards/new.json?limit=6&raw_json=1',     label: 'r/baseballcards',     type: 'reddit' },
    { url: 'https://www.reddit.com/r/basketballcards/new.json?limit=6&raw_json=1',   label: 'r/basketballcards',   type: 'reddit' },
    { url: 'https://www.cardboardconnection.com/feed',                                label: 'Cardboard Connection', type: 'rss'   },
  ],
};
