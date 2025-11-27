import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  RATE_LIMIT,
  getRateLimitKey,
  detectBot,
  checkRateLimit,
  validateInput,
  callOpenAI,
} from './shared.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Bot detection - stricter limits for bots
  const isBot = detectBot(req);
  const rateLimitKey = getRateLimitKey(req);
  const effectiveMaxRequests = isBot ? Math.floor(RATE_LIMIT.MAX_REQUESTS / 2) : RATE_LIMIT.MAX_REQUESTS;
  
  // Check rate limit
  const rateLimit = checkRateLimit(rateLimitKey, effectiveMaxRequests);

  if (!rateLimit.allowed) {
    const resetDate = new Date(rateLimit.resetTime);
    const message = isBot 
      ? 'Bot detected. Rate limit exceeded for automated requests.'
      : `Too many requests. Please try again after ${resetDate.toISOString()}`;
    
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message,
      resetTime: rateLimit.resetTime,
      isBot,
    });
  }

  // Validate input
  const { code } = req.body;
  const validation = validateInput(code);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  // Check API key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY is not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const review = await callOpenAI(code, apiKey);
    
    return res.status(200).json({
      review,
      rateLimit: {
        remaining: rateLimit.remaining,
        resetTime: rateLimit.resetTime,
      },
    });
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({
      error: 'Failed to review code',
      message: errorMessage,
    });
  }
}

