import { NextRequest, NextResponse } from 'next/server';

// Simple in-memory rate limiter (IP -> count, reset after 1 minute)
const rateLimitMap = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const limit = 20; // 20 requests per minute
  const windowMs = 60 * 1000; // 1 minute

  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }

  const record = rateLimitMap.get(ip);

  if (now > record.resetAt) {
    // Window expired, reset
    record.count = 1;
    record.resetAt = now + windowMs;
    return true;
  }

  if (record.count >= limit) {
    return false;
  }

  record.count += 1;
  return true;
}

// Sanitize input
function sanitizeInput(text) {
  if (!text || typeof text !== 'string') return '';
  // Remove HTML tags
  let cleaned = text.replace(/<[^>]*>/g, '');
  // Limit length
  cleaned = cleaned.substring(0, 500);
  return cleaned.trim();
}

// Search dataset by keywords
function searchDataset(dataset, query) {
  if (!Array.isArray(dataset)) return [];

  const keywords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (keywords.length === 0) return [];

  const scored = dataset
    .map((item) => {
      let score = 0;
      const text = JSON.stringify(item).toLowerCase();

      keywords.forEach((keyword) => {
        const matches = text.match(new RegExp(keyword, 'g')) || [];
        score += matches.length;
      });

      return { item, score };
    })
    .filter(({ score }) => score > 0)
    .sort(({ score: a }, { score: b }) => b - a)
    .slice(0, 10); // Top 10 results

  return scored.map(({ item }) => item);
}

// Format dataset context for the system prompt
function formatDatasetContext(results) {
  if (results.length === 0) {
    return '';
  }

  const formatted = results
    .map((item) => {
      const lines = [];
      if (item.name) lines.push(`Name: ${item.name}`);
      if (item.category) lines.push(`Category: ${item.category}`);
      if (item.address) lines.push(`Address: ${item.address}`);
      if (item.phone) lines.push(`Phone: ${item.phone}`);
      if (item.hours) lines.push(`Hours: ${item.hours}`);
      if (item.description) lines.push(`Description: ${item.description}`);
      return lines.join(' | ');
    })
    .join('\n');

  return `\n\nRelevant local information:\n${formatted}`;
}

// Mock response for testing (when no API key configured)
function getMockResponse(userMessage) {
  const mocks = {
    restaurant: 'Great question! Westchester has amazing dining options. For Italian, I\'d recommend checking out some classics in Larchmont and Mamaroneck. Would you like specific recommendations?',
    event: 'There\'s always something happening in Westchester! Summer concerts, farmers markets, and community events are popular. What town are you interested in?',
    activity: 'Westchester offers everything from hiking trails at Ward Pound Ridge to water activities at the Sound. What kind of activity interests you?',
    default: 'I\'m here to help you discover great places and events in Westchester County! Ask me about restaurants, activities, events, or anything else you\'d like to know about the area.',
  };

  const lower = userMessage.toLowerCase();
  for (const [key, response] of Object.entries(mocks)) {
    if (lower.includes(key)) return response;
  }
  return mocks.default;
}

export async function POST(request) {
  try {
    // Get client IP for rate limiting
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-client-ip') || 'unknown';

    // Check rate limit
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const { message, history } = await request.json();

    // Validate input
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

    // If no API key, return mock response
    if (!apiKey) {
      const mockResponse = getMockResponse(sanitizedMessage);
      return NextResponse.json({ response: mockResponse });
    }

    // Fetch and search dataset
    let datasetContext = '';
    try {
      const datasetUrl = process.env.NEXT_PUBLIC_DATASET_URL;
      if (datasetUrl) {
        const datasetResponse = await fetch(datasetUrl);
        if (datasetResponse.ok) {
          const dataset = await datasetResponse.json();
          const results = searchDataset(dataset, sanitizedMessage);
          datasetContext = formatDatasetContext(results);
        }
      }
    } catch (err) {
      console.error('Dataset fetch error:', err);
      // Continue without dataset context
    }

    // Build system prompt
    const systemPrompt = `You are the I Live Here Westchester AI assistant. You help residents and visitors find local businesses, events, activities, restaurants, and things to do across Westchester County, NY.

Your personality: warm, knowledgeable, like a well-connected local friend. Be specific — mention business names, addresses, hours when available. Keep responses concise (3-5 sentences max). If you don't have info on something specific, say so honestly and suggest alternatives.

Towns you cover: Rye, Harrison, Port Chester, Larchmont, Mamaroneck, Rye Brook, and surrounding areas in Westchester County.${datasetContext}`;

    // Build conversation history for context
    const conversationHistory = [];
    if (Array.isArray(history)) {
      history.forEach((msg) => {
        if (msg.role && msg.content) {
          conversationHistory.push({
            role: msg.role,
            content: sanitizeInput(msg.content),
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
        max_tokens: 512,
        system: systemPrompt,
        messages: conversationHistory,
      }),
    });

    if (!response.ok) {
      console.error('Anthropic API error:', response.statusText, await response.text());

      // Return graceful fallback
      return NextResponse.json({
        response:
          'I\'m having trouble connecting right now. Please try again in a moment!',
      });
    }

    const data = await response.json();

    // Extract text from response
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
