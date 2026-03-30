import { NextResponse } from 'next/server';

// ============================================================
// RATE LIMITING
// ============================================================
const rateLimitMap = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const limit = 20;
  const windowMs = 60 * 1000;

  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }

  const record = rateLimitMap.get(ip);
  if (now > record.resetAt) {
    record.count = 1;
    record.resetAt = now + windowMs;
    return true;
  }

  if (record.count >= limit) return false;
  record.count += 1;
  return true;
}

// ============================================================
// INPUT SANITIZATION
// ============================================================
function sanitizeInput(text) {
  if (!text || typeof text !== 'string') return '';
  let cleaned = text.replace(/<[^>]*>/g, '');
  cleaned = cleaned.substring(0, 500);
  return cleaned.trim();
}

// ============================================================
// DATASET CACHE — load once, reuse across requests
// ============================================================
let cachedDataset = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getDataset() {
  const now = Date.now();
  if (cachedDataset && now - cacheTimestamp < CACHE_TTL) {
    return cachedDataset;
  }

  const datasetUrl = process.env.NEXT_PUBLIC_DATASET_URL;
  if (!datasetUrl) return null;

  try {
    const res = await fetch(datasetUrl);
    if (res.ok) {
      cachedDataset = await res.json();
      cacheTimestamp = now;
      return cachedDataset;
    }
  } catch (err) {
    console.error('Dataset fetch error:', err);
  }
  return cachedDataset; // Return stale cache if fetch fails
}

// ============================================================
// SEARCH ENGINE — ported from main chatbot
// ============================================================

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
  'her', 'was', 'one', 'our', 'out', 'has', 'have', 'from', 'they',
  'been', 'said', 'each', 'she', 'which', 'their', 'will', 'other',
  'about', 'many', 'then', 'them', 'these', 'some', 'would', 'make',
  'like', 'into', 'time', 'very', 'when', 'come', 'could', 'more',
  'what', 'where', 'who', 'how', 'there', 'any', 'also', 'just',
  'with', 'this', 'that', 'does', 'should', 'need', 'want', 'good',
  'best', 'great', 'nice', 'around', 'here', 'near'
]);

const INTENT_ONLY_WORDS = new Set([
  'food', 'restaurant', 'restaurants', 'eat', 'eating', 'place', 'places',
  'shop', 'shops', 'store', 'stores', 'spot', 'spots', 'service', 'services',
  'find', 'looking', 'recommend', 'recommendation', 'suggestions',
  'port', 'chester', 'rye', 'harrison', 'brook', 'white', 'plains'
]);

const TOWN_ALIASES = {
  'port chester': 'Port Chester', 'portchester': 'Port Chester', 'pc': 'Port Chester',
  'rye': 'Rye', 'rye brook': 'Rye Brook', 'rb': 'Rye Brook',
  'harrison': 'Harrison', 'white plains': 'White Plains',
  'larchmont': 'Larchmont', 'mamaroneck': 'Mamaroneck',
  'new rochelle': 'New Rochelle', 'scarsdale': 'Scarsdale',
  'bronxville': 'Bronxville', 'tarrytown': 'Tarrytown',
  'yonkers': 'Yonkers', 'mount kisco': 'Mount Kisco',
};

function detectTown(query) {
  const q = query.toLowerCase();
  // Check longer aliases first to avoid partial matches
  const sorted = Object.entries(TOWN_ALIASES).sort((a, b) => b[0].length - a[0].length);
  for (const [alias, town] of sorted) {
    if (q.includes(alias)) return town;
  }
  return null;
}

function tokenize(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function searchTokens(tokens) {
  return tokens.filter(t => !INTENT_ONLY_WORDS.has(t));
}

const SYNONYMS = {
  'eat': ['restaurant', 'dining', 'food', 'dinner', 'lunch', 'brunch'],
  'restaurant': ['eat', 'dining', 'food', 'dinner'],
  'park': ['parking', 'garage', 'meter', 'lot'],
  'parking': ['park', 'garage', 'meter', 'lot'],
  'kids': ['youth', 'children', 'child', 'family', 'kid'],
  'children': ['youth', 'kids', 'child', 'family'],
  'sports': ['soccer', 'baseball', 'basketball', 'lacrosse', 'football', 'swim', 'tennis', 'athletic'],
  'camp': ['summer', 'day camp', 'camps'],
  'senior': ['elderly', 'older', 'aging', 'retired'],
  'art': ['arts', 'painting', 'ceramics', 'drawing', 'creative', 'music', 'theater'],
  'music': ['concert', 'show', 'band', 'live', 'performing'],
  'playing': ['concert', 'show', 'performing', 'music', 'live', 'event'],
  'capitol': ['capitol theatre', 'garcias', 'garcia'],
  'school': ['education', 'after-school', 'preschool', 'afterschool'],
  'doctor': ['medical', 'health', 'clinic', 'healthcare'],
  'trash': ['garbage', 'recycling', 'pickup', 'waste', 'sanitation'],
  'library': ['reading', 'books', 'storytime'],
  'swim': ['pool', 'swimming', 'aquatic', 'water'],
  'gym': ['fitness', 'exercise', 'workout', 'yoga', 'pilates'],
  'italian': ['pasta', 'pizza'],
  'mexican': ['tacos', 'latin', 'salvadoran'],
  'haircut': ['barber', 'salon', 'hair', 'grooming'],
  'moved': ['new resident', 'moving', 'relocat'],
  'free': ['no cost', 'complimentary'],
  'help': ['assistance', 'support', 'resource', 'service'],
  'food pantry': ['hunger', 'meal', 'snap', 'food assistance'],
  'news': ['update', 'latest', 'happening', 'announcement', 'alert'],
  'construction': ['building', 'development', 'project', 'infrastructure'],
  'safety': ['alert', 'warning', 'scam', 'crime', 'police'],
  'waterfront': ['promenade', 'loop', 'harbor', 'water'],
  'pc': ['port chester'],
  'rb': ['rye brook'],
  'hockey': ['ice', 'skating', 'rink', 'puck'],
  'skating': ['ice', 'rink', 'figure skating', 'hockey'],
  'wine': ['liquor', 'spirits', 'bottle'],
  'deal': ['discount', 'coupon', 'promotion', 'sale', 'percent off'],
  'birthday': ['party', 'celebration'],
};

function expandQuery(tokens) {
  const expanded = new Set(tokens);
  for (const token of tokens) {
    if (SYNONYMS[token]) {
      SYNONYMS[token].forEach(s => expanded.add(s));
    }
  }
  return [...expanded];
}

function detectIntent(tokens) {
  const intents = { events: 0, restaurants: 0, programs: 0, municipal: 0, news: 0, resources: 0 };
  const signals = {
    events: ['show', 'playing', 'concert', 'music', 'live', 'performing', 'event', 'theatre', 'theater', 'capitol', 'ticket', 'garcia', 'garcias', 'band', 'tonight', 'weekend', 'deal', 'discount', 'promotion', 'sale', 'coupon', 'tryout', 'tryouts'],
    restaurants: ['eat', 'restaurant', 'food', 'dinner', 'lunch', 'brunch', 'cuisine', 'dining', 'pizza', 'tacos', 'sushi', 'italian', 'mexican', 'bar', 'drinks', 'coffee', 'wine', 'liquor', 'spirits'],
    programs: ['class', 'program', 'camp', 'lesson', 'yoga', 'swim', 'sport', 'kids', 'children', 'teen', 'senior', 'pottery', 'clay', 'register', 'enroll', 'spring', 'summer', 'break', 'hockey', 'skating', 'ice', 'figure', 'league', 'clinic', 'birthday', 'party'],
    municipal: ['parking', 'permit', 'trash', 'recycling', 'tax', 'village', 'town', 'government', 'meeting', 'board', 'zoning', 'police', 'fire'],
    news: ['news', 'update', 'latest', 'happening', 'announcement', 'construction', 'development', 'alert', 'warning', 'scam', 'spring', 'seized', 'shooting', 'homicide', 'crash', 'injury'],
    resources: ['help', 'assistance', 'pantry', 'shelter', 'library', 'support', 'resource', 'service']
  };
  for (const [cat, words] of Object.entries(signals)) {
    for (const t of tokens) {
      if (words.includes(t)) intents[cat] += 2;
    }
  }
  return intents;
}

function getKeyFields(entry, category) {
  const kw = Array.isArray(entry.keywords) ? entry.keywords.join(' ') : (entry.keywords || '');
  switch (category) {
    case 'events':
      return [entry.event_name, entry.venue_name, entry.description, kw, entry.town, entry.local_tip, entry.category].filter(Boolean).join(' ');
    case 'businesses':
      return [entry.business_name, entry.category, entry.subcategory, entry.description, kw, entry.specialties, entry.nearby, entry.local_tip].filter(Boolean).join(' ');
    case 'programs':
      return [entry.program_name, entry.provider_name, entry.category, entry.subcategory, entry.description, kw, entry.town, entry.skill_level, entry.session_dates].filter(Boolean).join(' ');
    case 'news':
      return [entry.headline, entry.summary, entry.category, kw, entry.town, entry.source].filter(Boolean).join(' ');
    case 'municipal':
      return [entry.topic, entry.question, entry.answer, entry.applies_to, entry.contact_department, entry.name, entry.category, entry.description, kw, entry.town, entry.details].filter(Boolean).join(' ');
    case 'resources':
      return [entry.organization_name, entry.program_name, entry.category, entry.description, kw, entry.town, entry.services].filter(Boolean).join(' ');
    default:
      return Object.values(entry).join(' ');
  }
}

function resolveDateRange(tokens, today) {
  const d = new Date(today + 'T12:00:00');
  const dow = d.getDay();
  const fmt = (dt) => dt.toISOString().split('T')[0];
  const addDays = (dt, n) => { const r = new Date(dt); r.setDate(r.getDate() + n); return r; };
  const joined = tokens.join(' ');

  if (tokens.includes('tonight') || tokens.includes('today')) {
    return { start: today, end: today, label: 'today' };
  }
  if (tokens.includes('tomorrow')) {
    const tom = fmt(addDays(d, 1));
    return { start: tom, end: tom, label: 'tomorrow' };
  }
  if ((tokens.includes('weekend') && !joined.includes('next weekend')) || joined.includes('this weekend')) {
    if (dow === 0) return { start: fmt(addDays(d, -1)), end: today, label: 'this weekend' };
    if (dow === 6) return { start: today, end: fmt(addDays(d, 1)), label: 'this weekend' };
    const daysToSat = 6 - dow;
    const satDate = addDays(d, daysToSat);
    const sunDate = addDays(satDate, 1);
    return { start: fmt(satDate), end: fmt(sunDate), label: 'this weekend' };
  }
  if (joined.includes('next weekend')) {
    let daysToNextSat = 6 - dow;
    if (daysToNextSat <= 0) daysToNextSat += 7;
    else daysToNextSat += 7;
    const satDate = addDays(d, daysToNextSat);
    const sunDate = addDays(satDate, 1);
    return { start: fmt(satDate), end: fmt(sunDate), label: 'next weekend' };
  }
  if (joined.includes('this week')) {
    const sunDate = addDays(d, 7 - dow);
    return { start: today, end: fmt(sunDate), label: 'this week' };
  }
  if (joined.includes('next week')) {
    const nextMon = addDays(d, 8 - dow);
    const nextSun = addDays(nextMon, 6);
    return { start: fmt(nextMon), end: fmt(nextSun), label: 'next week' };
  }
  if (joined.includes('this month')) {
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { start: today, end: fmt(lastDay), label: 'this month' };
  }
  if (tokens.includes('upcoming') || tokens.includes('soon')) {
    return { start: today, end: fmt(addDays(d, 14)), label: 'upcoming' };
  }
  return null;
}

// Intent-only query handler (e.g., "where should I eat")
function buildIntentOnlySample(intents, queryTown, dataset) {
  const topIntent = Object.entries(intents).sort((a, b) => b[1] - a[1])[0];
  const intentName = topIntent[0];

  const intentToCategory = {
    restaurants: 'businesses', programs: 'programs', municipal: 'municipal',
    events: 'events', resources: 'resources', news: 'news'
  };

  const catName = intentToCategory[intentName] || 'businesses';
  let pool = dataset[catName] || [];

  if (queryTown) {
    const townFiltered = pool.filter(e => e.town === queryTown);
    if (townFiltered.length > 0) pool = townFiltered;
  }

  if (intentName === 'restaurants') {
    const restaurants = pool.filter(e => e.category === 'Restaurant');
    if (restaurants.length > 0) pool = restaurants;
  }

  // Diverse sampling by subcategory
  const bySubcat = {};
  for (const entry of pool) {
    const sub = entry.subcategory || entry.category || 'Other';
    if (!bySubcat[sub]) bySubcat[sub] = [];
    bySubcat[sub].push(entry);
  }

  const subcategories = Object.keys(bySubcat).sort((a, b) => bySubcat[b].length - bySubcat[a].length);
  const sample = [];
  let round = 0;
  while (sample.length < 12 && round < 3) {
    for (const sub of subcategories) {
      if (sample.length >= 12) break;
      if (bySubcat[sub].length > round) {
        const idx = Math.min(round, bySubcat[sub].length - 1);
        sample.push({ score: 5, category: catName, entry: bySubcat[sub][idx] });
      }
    }
    round++;
  }

  const subcategoryCounts = {};
  for (const sub of subcategories) subcategoryCounts[sub] = bySubcat[sub].length;
  const townCounts = {};
  for (const entry of pool) { townCounts[entry.town] = (townCounts[entry.town] || 0) + 1; }

  sample._highDensity = true;
  sample._totalBizMatches = pool.length;
  sample._subcategoryCounts = subcategoryCounts;
  sample._townCounts = townCounts;
  sample._queryTown = queryTown;
  sample._intentOnly = true;

  return sample;
}

// Main search function
function searchDataset(query, dataset) {
  if (!dataset) return [];

  const tokens = tokenize(query);
  const sTokens = searchTokens(tokens);
  const expanded = expandQuery(sTokens);
  const intents = detectIntent(tokens);
  const today = new Date().toISOString().split('T')[0];
  const queryTown = detectTown(query);

  // Intent-only query
  const maxIntent = Math.max(...Object.values(intents));
  if (sTokens.length === 0 && maxIntent > 0) {
    return buildIntentOnlySample(intents, queryTown, dataset);
  }

  const timeWords = ['tonight', 'today', 'tomorrow', 'weekend', 'week', 'month', 'upcoming', 'soon', 'next'];
  const isTimeSensitive = tokens.some(t => timeWords.includes(t));
  const dateRange = resolveDateRange(tokens, today);

  const results = [];

  const categories = [
    { name: 'programs', data: dataset.programs || [] },
    { name: 'businesses', data: dataset.businesses || [] },
    { name: 'municipal', data: dataset.municipal || [] },
    { name: 'events', data: dataset.events || [] },
    { name: 'resources', data: dataset.resources || [] },
    { name: 'news', data: dataset.news || [] },
  ];

  const catToIntent = { programs: 'programs', businesses: 'restaurants', municipal: 'municipal', events: 'events', resources: 'resources', news: 'news' };

  for (const cat of categories) {
    const intentBoost = intents[catToIntent[cat.name]] || 0;

    for (const entry of cat.data) {
      // Time-aware filtering for events
      if (cat.name === 'events' && entry.event_date) {
        const eventDate = entry.event_date;
        if (eventDate < today) {
          const daysPast = Math.floor((new Date(today) - new Date(eventDate)) / 86400000);
          if (daysPast > 7 && !entry.recurring) continue;
        }
        if (eventDate > today && !entry.recurring) {
          const daysAhead = Math.floor((new Date(eventDate) - new Date(today)) / 86400000);
          if (daysAhead > 14) {
            entry._beyondWindow = true;
            entry._daysAhead = daysAhead;
          }
        }
      }

      // Skip expired news
      if (cat.name === 'news' && entry.expires && entry.expires < today) {
        continue;
      }

      const text = getKeyFields(entry, cat.name).toLowerCase();
      const kwText = (Array.isArray(entry.keywords) ? entry.keywords.join(' ') : (entry.keywords || '')).toLowerCase();
      let score = 0;

      // Text matching
      for (const token of sTokens) {
        if (text.includes(token)) score += 3;
      }

      for (const token of expanded) {
        if (!sTokens.includes(token) && text.includes(token)) score += 1;
        if (kwText && kwText.includes(token)) score += 2;
      }

      if (score > 0 && intentBoost > 0) {
        score += intentBoost;
      }

      // Town boost
      if (score > 0 && queryTown) {
        if (entry.town === queryTown) {
          score += 5;
        } else if (Array.isArray(entry.service_towns) && entry.service_towns.includes(queryTown)) {
          score += 4;
        }
      }

      // Emergency boost
      const urgentWords = ['emergency', 'urgent', 'asap', 'now', 'broken', 'died', 'flood', 'leak', 'burst', '24/7', '24 hour'];
      if (score > 0 && entry.emergency_response && tokens.some(t => urgentWords.includes(t))) {
        score += 6;
      }

      // Mobile service boost
      const mobileWords = ['come to', 'at home', 'at my house', 'travel to', 'mobile', 'delivery', 'house call'];
      if (score > 0 && entry.mobile_service === true && mobileWords.some(w => query.toLowerCase().includes(w))) {
        score += 3;
      }

      // Stale data penalty
      if (score > 0 && entry.flagged_stale === true) {
        score = Math.max(1, score - 3);
      }

      // Verified/claimed boost
      if (score > 0) {
        if (entry.verified === true) score += 2;
        else if (entry.claimed === true) score += 1;
      }

      // Date range matching for events
      if (cat.name === 'events' && entry.event_date && dateRange) {
        if (entry.event_date >= dateRange.start && entry.event_date <= dateRange.end) {
          score = Math.max(score, 5) + 10;
          entry._inDateRange = true;
        }
      }

      // Boost upcoming events for time-sensitive queries
      if (score > 0 && !dateRange && isTimeSensitive && cat.name === 'events' && entry.event_date) {
        if (entry.event_date >= today) score += 3;
      }

      // Boost fresher news
      if (score > 0 && cat.name === 'news' && entry.date_published) {
        const daysOld = Math.floor((new Date(today) - new Date(entry.date_published)) / 86400000);
        if (daysOld <= 7) score += 2;
      }

      if (score > 0) {
        if (entry._beyondWindow && !entry._inDateRange) {
          if (!results._beyondWindowEvents) results._beyondWindowEvents = [];
          results._beyondWindowEvents.push({ score, category: cat.name, entry });
        } else {
          results.push({ score, category: cat.name, entry });
        }
      }
    }
  }

  // Event window expansion
  const eventResults = results.filter(r => r.category === 'events');
  if (eventResults.length < 3 && results._beyondWindowEvents) {
    const expandable = results._beyondWindowEvents.filter(r => r.entry._daysAhead <= 30);
    expandable.sort((a, b) => b.score - a.score);
    for (const r of expandable) {
      results.push(r);
      if (results.filter(x => x.category === 'events').length >= 3) break;
    }
    if (expandable.length > 0) results._windowExpanded = true;
  }
  if (results._beyondWindowEvents && results._beyondWindowEvents.length > 0) {
    results._hasMoreEvents = true;
  }
  if (dateRange) results._dateRangeLabel = dateRange.label;

  results.sort((a, b) => b.score - a.score);

  // Density-aware result selection
  const bizResults = results.filter(r => r.category === 'businesses');
  const nonBizResults = results.filter(r => r.category !== 'businesses');
  const totalBizMatches = bizResults.length;

  const subcategoryCounts = {};
  for (const r of bizResults) {
    const sub = r.entry.subcategory || r.entry.category || 'Other';
    subcategoryCounts[sub] = (subcategoryCounts[sub] || 0) + 1;
  }

  const townCounts = {};
  for (const r of bizResults) {
    const t = r.entry.town || 'Unknown';
    townCounts[t] = (townCounts[t] || 0) + 1;
  }

  let finalResults;
  const MAX_RESULTS = dateRange ? 20 : 15;

  if (totalBizMatches > 25) {
    const nonBizSlice = nonBizResults.slice(0, 5);
    const bizBudget = MAX_RESULTS - nonBizSlice.length;
    const subcategories = Object.keys(subcategoryCounts).sort(
      (a, b) => subcategoryCounts[b] - subcategoryCounts[a]
    );

    const bySubcat = {};
    for (const r of bizResults) {
      const sub = r.entry.subcategory || r.entry.category || 'Other';
      if (!bySubcat[sub]) bySubcat[sub] = [];
      bySubcat[sub].push(r);
    }

    const diverseBiz = [];
    let round = 0;
    while (diverseBiz.length < bizBudget && round < 5) {
      for (const sub of subcategories) {
        if (diverseBiz.length >= bizBudget) break;
        if (bySubcat[sub] && bySubcat[sub].length > round) {
          diverseBiz.push(bySubcat[sub][round]);
        }
      }
      round++;
    }

    finalResults = [...nonBizSlice, ...diverseBiz];
    finalResults._highDensity = true;
    finalResults._totalBizMatches = totalBizMatches;
    finalResults._subcategoryCounts = subcategoryCounts;
    finalResults._townCounts = townCounts;
    finalResults._queryTown = queryTown;
  } else {
    finalResults = results.slice(0, MAX_RESULTS);
    if (totalBizMatches > 10) {
      finalResults._moderateDensity = true;
      finalResults._totalBizMatches = totalBizMatches;
      finalResults._subcategoryCounts = subcategoryCounts;
    }
  }

  finalResults._beyondWindowEvents = results._beyondWindowEvents;
  finalResults._hasMoreEvents = results._hasMoreEvents;
  finalResults._windowExpanded = results._windowExpanded;
  finalResults._dateRangeLabel = results._dateRangeLabel;

  return finalResults;
}

// ============================================================
// FORMAT CONTEXT FOR LLM — category-specific formatting
// ============================================================

function formatEntry(e, category) {
  switch (category) {
    case 'events':
      return [e.event_name, e.venue_name, e.description, e.address ? 'at ' + e.address : '', e.event_date ? 'Date: ' + e.event_date : '', e.end_date ? 'Through: ' + e.end_date : '', e.event_time ? 'Time: ' + e.event_time : '', e.cost || '', e.cost_notes || '', e.recurrence_pattern ? 'Recurring: ' + e.recurrence_pattern : '', e.confidence ? 'Confidence: ' + e.confidence : '', e.nearby ? 'Nearby: ' + e.nearby : '', e.local_tip ? 'Tip: ' + e.local_tip : ''].filter(Boolean).join(' | ');
    case 'businesses':
      return [e.business_name, e.category, e.subcategory, e.description, e.address ? 'at ' + e.address : '', e.phone || '', e.website ? 'Web: ' + e.website : '', e.hours ? 'Hours: ' + e.hours : '', e.price_range || '', e.local_tip ? 'Tip: ' + e.local_tip : ''].filter(Boolean).join(' | ');
    case 'programs':
      return [e.program_name, e.provider_name, e.description, e.address ? 'at ' + e.address : '', e.contact_phone || '', e.contact_email ? 'Email: ' + e.contact_email : '', e.cost ? 'Cost: ' + e.cost : '', e.cost_details || '', e.age_min ? 'Ages ' + e.age_min + '-' + (e.age_max || '') : '', e.session_dates ? 'Dates: ' + e.session_dates : '', e.registration_deadline ? 'Deadline: ' + e.registration_deadline : '', e.skill_level ? 'Level: ' + e.skill_level : '', e.parent_tip ? 'Tip: ' + e.parent_tip : '', e.source || ''].filter(Boolean).join(' | ');
    case 'news':
      return [e.headline, e.summary, e.town || '', e.date_published ? 'Published: ' + e.date_published : '', e.source ? 'Source: ' + e.source : '', e.source_url ? 'URL: ' + e.source_url : '', e.expires ? 'Expires: ' + e.expires : ''].filter(Boolean).join(' | ');
    case 'municipal':
      return [e.topic || '', e.question ? 'Q: ' + e.question : '', e.answer ? 'A: ' + e.answer : '', e.applies_to ? 'Applies to: ' + e.applies_to : '', e.contact_department ? 'Dept: ' + e.contact_department : '', e.contact_phone ? 'Phone: ' + e.contact_phone : ''].filter(v => v.length > 0).join(' | ');
    case 'resources':
      return [e.organization_name, e.program_name, e.description, e.address ? 'at ' + e.address : '', e.phone || '', e.website ? 'Web: ' + e.website : '', e.services || '', e.eligibility || ''].filter(Boolean).join(' | ');
    default:
      return Object.values(e).filter(v => typeof v === 'string' && v.length < 200).join(' | ');
  }
}

function formatContext(results) {
  if (results.length === 0) return 'No relevant entries found in the database.';

  const sections = {};
  for (const r of results) {
    if (!sections[r.category]) sections[r.category] = [];
    sections[r.category].push(r.entry);
  }

  let ctx = '';
  const labels = {
    programs: 'PROGRAMS & ACTIVITIES',
    businesses: 'BUSINESSES & RESTAURANTS',
    municipal: 'MUNICIPAL INFO',
    events: 'EVENTS',
    resources: 'COMMUNITY RESOURCES',
    news: 'LOCAL NEWS & UPDATES',
  };

  for (const [cat, entries] of Object.entries(sections)) {
    ctx += `\n--- ${labels[cat] || cat.toUpperCase()} ---\n`;
    for (const e of entries) {
      ctx += formatEntry(e, cat) + '\n';
    }
  }

  // Event windowing notes
  if (results._dateRangeLabel) {
    ctx += '\n--- NOTE: The user is asking about ' + results._dateRangeLabel + '. Prioritize events shown above that fall within this time range. ---\n';
  }

  if (results._hasMoreEvents) {
    ctx += '\n--- NOTE: The events shown above are limited to the next 2 weeks. There are additional events further out. If the user asks to see more or wants events beyond this window, let them know you can show more upcoming events. ---\n';
  }

  // High-density business query metadata
  if (results._highDensity) {
    const total = results._totalBizMatches;
    const subs = results._subcategoryCounts;
    const topSubs = Object.entries(subs)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => `${name} (${count})`)
      .join(', ');
    const towns = results._townCounts;
    const townBreak = Object.entries(towns)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => `${name}: ${count}`)
      .join(', ');
    ctx += `\n--- SEARCH DENSITY NOTE ---\n`;
    ctx += `Total matching businesses: ${total} (only a diverse sample of ${results.filter(r => r.category === 'businesses').length} shown above)\n`;
    ctx += `Subcategory breakdown: ${topSubs}\n`;
    ctx += `By town: ${townBreak}\n`;
    if (results._queryTown) {
      ctx += `User specified town: ${results._queryTown}\n`;
      ctx += `INSTRUCTION: There are too many matches to list. You MUST ask a qualifying question to narrow results. Ask about cuisine type, price range, occasion, or neighborhood preference. Show 2-3 representative picks across different subcategories to ground the conversation, then ask the user to narrow down. Do NOT try to list everything.\n`;
    } else {
      ctx += `User did NOT specify a town.\n`;
      ctx += `INSTRUCTION: There are too many matches to list. You MUST ask a qualifying question to narrow results. IMPORTANT: Since the user did not specify a town, you MUST ask which town they are interested in (Port Chester, Rye, or Harrison) as part of your qualifying question. Also ask about cuisine type, price range, or occasion. Show 2-3 representative picks from DIFFERENT towns to ground the conversation. Do NOT assume Port Chester or any default town.\n`;
    }
    ctx += `--- END DENSITY NOTE ---\n`;
  } else if (results._moderateDensity) {
    const total = results._totalBizMatches;
    const subs = results._subcategoryCounts;
    const topSubs = Object.entries(subs)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => `${name} (${count})`)
      .join(', ');
    ctx += `\n--- NOTE: ${total} total business matches found (${topSubs}). The top results are shown above. If the user wants more specific options, you can suggest narrowing by subcategory, price range, or location. ---\n`;
  }

  return ctx;
}

// ============================================================
// SYSTEM PROMPT — full version from main chatbot
// ============================================================

function buildSystemPrompt(context) {
  const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return `You are the I Live Here Westchester local assistant. You help residents and visitors of Port Chester, Rye, Harrison, and Rye Brook find local information about businesses, programs, municipal services, events, community resources, and local news.

Today's date is ${todayStr}. Use this to determine what is current, upcoming, or expired.

IDENTITY: You are a knowledgeable, warm neighbor — not a search engine. You give opinionated, specific, curated recommendations. You speak with the confidence of someone who has lived in these towns for 20 years. Use phrases like "your best bet is..." and "locals love this place because..." and "heads up, this fills up fast."

DATA RULES:
1. Only recommend businesses, programs, services, and resources from your data below. Never fabricate or invent listings.
2. If you don't have information, say so honestly: "I don't have that in my database yet, but here's what I'd suggest..."
3. When recommending, always include: name, address, phone (if available), and one editorial tip or local insight.
4. Use the local_tip or parent_tip field when available — it adds the neighbor perspective that makes this tool different from Google.
5. CONFIDENCE TIERS: Each business has a confidence field. Use language that matches the confidence level:
   - "confirmed": Speak with full authority. "Your best bet is..." "Locals love this place."
   - "indexed": Speak confidently but factually. "They offer..." "Located at..."
   - "unverified": Soften slightly. "I've heard good things about..." "Worth checking out..." Never present unverified listings with the same certainty as confirmed ones.
6. When a listing has a "nearby" field, mention proximity naturally. "While you're there..." or "Right next door..." Cross-selling between neighboring businesses is a key feature.
5. Never say "based on my database" or "according to my records" — just answer naturally.

BILINGUAL RULES:
6. If asked a question in Spanish, respond entirely in Spanish with the same level of detail.
7. For municipal information, use the summary_es field when responding in Spanish rather than translating on the fly — this ensures accuracy for critical civic information.

QUERY HANDLING:
8. For time-sensitive queries ("what's happening tonight," "this weekend"), only show current/upcoming events. Flag anything that may have already passed.
8b. Event results are pre-filtered to the next 2 weeks by default. If the NOTE at the bottom of the data says there are more events beyond this window, mention it naturally: "Those are the highlights for the next couple of weeks. Want me to look further out?" Do NOT mention the 2-week window unprompted if there are no additional events.
8c. For BROAD time-based queries with no specific intent (e.g., "what's happening this weekend," "anything going on tonight," "what's there to do Saturday") where the results span DIFFERENT types of activities (concerts, family events, markets, sports, etc.), do NOT list everything. Instead, briefly acknowledge the variety and ask a quick clarifying question to narrow it down. Keep it natural, not like a menu.
8d. HIGH-DENSITY BUSINESS QUERIES: When the SEARCH DENSITY NOTE appears in the data, there are far more matches than shown. You MUST ask a qualifying question before listing results. Show 2-3 representative picks from different subcategories to give the user a taste, then ask what they're looking for.
   CRITICAL: If the DENSITY NOTE says "User did NOT specify a town," you MUST ask which town (Port Chester, Rye, or Harrison) as part of your qualifying question. NEVER assume Port Chester. Show picks from different towns.
9. For "open now" or time-specific queries, use the structured hours fields to filter.
10. For age-specific queries ("programs for my 6 year old"), filter by age_min/age_max fields.

RECOMMENDATIONS:
12. When recommending restaurants, provide context: price tier, cuisine style, what makes each place distinctive, and proximity to landmarks.
13. When recommending programs, always include: registration deadline, phone number, and whether spots tend to fill early.
14. For municipal questions, provide the specific answer plus the department phone number so the resident can verify.
15. For community resources, always mention: eligibility requirements, whether walk-ins are accepted, what languages are spoken, and cost.

TONE:
16. Be warm, specific, and confident. Never sound corporate or robotic. Never say "I'd recommend checking their website for more details" — that's what Google says. Instead, give the actual details.

ENTITY-TYPE AWARENESS:
17b. Your database contains five distinct types of information: Businesses (restaurants, shops, services), Programs (youth sports, classes, camps with age ranges and registration), Events (concerts, markets, shows with specific dates), Municipal Info (permits, parking, sanitation schedules), and Community Resources (food pantries, legal aid, clinics).
17c. For cross-entity queries like "what can I do with my kids this weekend," pull from BOTH Events and Programs.
17d. ALWAYS include the town name when mentioning any business, venue, program, or event location. Say "Playland Park in Rye" not just "Playland Park (1 Playland Pkwy)."
17e. FORMATTING: Do NOT stack address, town, and phone number inside parentheses in the same sentence. Lead with the name and town naturally, weave in one or two key details, then put the address and phone at the end after a dash. Keep it conversational first, logistics second.

FOLLOW-UP & ENGAGEMENT:
18. End responses with a specific, contextual follow-up based on what the user asked about.
19. For events/shows: suggest nearby dining, parking, or related events.
20. For restaurants: suggest nearby events, other cuisine options, or neighborhood tips.
21. For programs/classes: suggest related programs, registration tips, or nearby activities.
22. Keep follow-ups conversational and specific. "Need a dinner spot near the Capitol Theatre?" beats "Can I help with anything else?"

FORMAT:
- Use short paragraphs, not walls of text
- Bold venue/business names with **name**
- Include practical details (address, phone, hours) inline
- Keep responses under 300 words unless the question requires more

COVERAGE: Core towns: Port Chester (10573), Rye (10580), Harrison (10528), Rye Brook (10573). Extended coverage: White Plains, Larchmont, Mamaroneck, New Rochelle, Scarsdale, Bronxville, and other Westchester towns.
Many businesses are headquartered outside the core towns but service them. Check the service_towns field. When recommending a mobile/service business from another town, mention that they serve the user's area.

DATA FRESHNESS FIELDS:
- created_date: When this entry was added
- last_verified_date: Last time confirmed accurate
- owner_updated_date: Last time owner updated their listing
- next_review_date: When due for re-verification
- flagged_stale: true if overdue for verification

TRUST TIERS:
- Owner Verified: Most reliable.
- Owner Claimed: Claimed but not fully verified.
- Community Sourced: Good faith data but not owner-confirmed.

If a listing is flagged_stale, mention that the info may need updating and suggest the user call ahead to confirm details.

RELEVANT LOCAL DATA:
${context}

CRITICAL INSTRUCTION - DATA USAGE:
The RELEVANT LOCAL DATA above is your primary knowledge base. It contains real, curated local information.

RULES:
1. You MUST reference and cite entries from the data above when they match the user question. NEVER say you do not have information about a topic if matching entries exist in the data.
2. The LOCAL NEWS & UPDATES section contains real, recently reported alerts and news items. Treat them as facts you know.
3. Present data confidently — do not say "based on my database" or "according to my records." Just answer naturally.
4. If the data does not fully answer the question, you may supplement with general knowledge but note when you are going beyond the local directory.

NEVER SAY THESE THINGS:
- "I don't have X in my database yet" or "my directory doesn't cover that yet" — NEVER expose gaps.
- "Check Facebook groups" or "Try Nextdoor" — NEVER punt the user to another platform.
- "Based on my records" / "according to my data" / "in my database" — you are a local expert, not a search engine.
- Do NOT ask more than ONE follow-up question per response.

WHEN DATA IS THIN:
If you have few or no matches for a query, do NOT apologize or admit gaps. Instead:
1. Lead with whatever relevant data you DO have, even if it's adjacent.
2. Supplement with your general knowledge about the area.
3. Be specific — name real towns, real streets, real types of businesses.
4. If truly nothing is relevant, pivot to a helpful adjacent suggestion.

RESPONSE QUALITY:
- Match recommendations to the actual context. Do not suggest all-you-can-eat sushi for a children's birthday party unless the user asked for it.
- Think about what a thoughtful local friend would actually recommend.
- Keep answers focused and practical. Three great suggestions beat six mediocre ones.

CLARIFICATION RULES - DO NOT ASSUME:
When a user asks about planning a party, celebration, event, or activity, NEVER assume the age group, audience, or style. A birthday party could be for a toddler, a teenager, a 40-year-old, or a grandmother. Ask one short clarifying question before making recommendations. Keep the clarifying question brief and warm. Do not ask more than one question at a time.`;
}

// ============================================================
// API HANDLER
// ============================================================

export async function POST(request) {
  try {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-client-ip') || 'unknown';

    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const { message, history } = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Invalid message format.' },
        { status: 400 }
      );
    }

    const sanitizedMessage = sanitizeInput(message);
    if (!sanitizedMessage) {
      return NextResponse.json(
        { error: 'Message is empty after sanitization.' },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return NextResponse.json({
        response: 'I\'m having trouble connecting right now. Please try again in a moment!',
      });
    }

    // Fetch dataset (cached) and run search engine
    let context = 'No relevant entries found in the database.';
    try {
      const dataset = await getDataset();
      if (dataset) {
        const results = searchDataset(sanitizedMessage, dataset);
        context = formatContext(results);
      }
    } catch (err) {
      console.error('Search error:', err);
    }

    const systemPrompt = buildSystemPrompt(context);

    // Build conversation history
    const conversationHistory = [];
    if (Array.isArray(history)) {
      // Keep last 12 messages (6 exchanges)
      const trimmed = history.slice(-12);
      trimmed.forEach((msg) => {
        if (msg.role && msg.content) {
          conversationHistory.push({
            role: msg.role,
            content: String(msg.content).slice(0, 4000),
          });
        }
      });
    }

    // Call Anthropic API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system: systemPrompt,
        messages: conversationHistory,
      }),
    });

    if (!response.ok) {
      console.error('Anthropic API error:', response.statusText, await response.text());
      return NextResponse.json({
        response: 'I\'m having trouble connecting right now. Please try again in a moment!',
      });
    }

    const data = await response.json();

    const assistantMessage =
      data.content && data.content[0] && data.content[0].text
        ? data.content[0].text
        : 'Sorry, I couldn\'t generate a response. Please try again.';

    return NextResponse.json({ response: assistantMessage });
  } catch (error) {
    console.error('Chat API error:', error);

    return NextResponse.json(
      {
        error: 'An error occurred while processing your request.',
        response: 'Sorry, something went wrong. Please try again later.',
      },
      { status: 500 }
    );
  }
}
