// Simple Express server for local development
// This mimics the Vercel serverless function locally
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import {
  RATE_LIMIT,
  getRateLimitKey,
  detectBot,
  checkRateLimit,
  validateInput,
  callOpenAI,
} from './api/shared.js';

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

app.post('/api/review', async (req, res) => {
  // Bot detection
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
    console.error('OPENAI_API_KEY is not set in .env');
    return res.status(500).json({ error: 'Server configuration error. Please set OPENAI_API_KEY in .env file' });
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
    return res.status(500).json({
      error: 'Failed to review code',
      message: error.message || 'Internal server error',
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Local API server running on http://localhost:${PORT}`);
  console.log(`📝 Make sure OPENAI_API_KEY is set in .env`);
});

