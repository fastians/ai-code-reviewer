// Shared logic for both local development and Vercel serverless function

export const RATE_LIMIT = {
  MAX_REQUESTS: 10,
  WINDOW_MS: 60 * 60 * 1000, // 1 hour
  MAX_CODE_LENGTH: 10000,
};

// Rate limiting store (in-memory)
export const rateLimitStore = new Map();

export function getRateLimitKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const realIp = req.headers['x-real-ip'];
  const connectionIp = req.socket?.remoteAddress;
  
  let ip = 'unknown';
  if (forwarded) {
    ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0].trim();
  } else if (realIp) {
    ip = Array.isArray(realIp) ? realIp[0] : realIp;
  } else if (connectionIp) {
    ip = connectionIp;
  } else {
    ip = 'local';
  }
  
  return ip;
}

export function detectBot(req) {
  const userAgent = req.headers['user-agent']?.toLowerCase() || '';
  const referer = req.headers['referer'] || '';
  
  const botPatterns = [
    'bot', 'crawler', 'spider', 'scraper', 'curl', 'wget', 
    'python', 'java', 'go-http', 'postman', 'insomnia',
    'headless', 'phantom', 'selenium', 'puppeteer'
  ];
  
  const isBotUA = botPatterns.some(pattern => userAgent.includes(pattern));
  const hasAcceptHeader = !!req.headers['accept'];
  const hasAcceptLanguage = !!req.headers['accept-language'];
  const suspiciousHeaders = !hasAcceptHeader && !hasAcceptLanguage;
  const noReferer = !referer && req.method === 'POST';
  
  return isBotUA || (suspiciousHeaders && noReferer);
}

export function checkRateLimit(key, maxRequests = RATE_LIMIT.MAX_REQUESTS) {
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record || now > record.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + RATE_LIMIT.WINDOW_MS });
    return { allowed: true, remaining: maxRequests - 1, resetTime: now + RATE_LIMIT.WINDOW_MS };
  }

  if (record.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetTime: record.resetTime };
  }

  record.count++;
  return { allowed: true, remaining: maxRequests - record.count, resetTime: record.resetTime };
}

export function validateInput(code) {
  if (!code || typeof code !== 'string') {
    return { valid: false, error: 'Code is required' };
  }

  if (code.trim().length === 0) {
    return { valid: false, error: 'Code cannot be empty' };
  }

  if (code.length > RATE_LIMIT.MAX_CODE_LENGTH) {
    return { 
      valid: false, 
      error: `Code is too long. Maximum ${RATE_LIMIT.MAX_CODE_LENGTH} characters allowed.` 
    };
  }

  return { valid: true };
}

export async function callOpenAI(code, apiKey) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a senior software engineer. Review the code and provide specific feedback on: bugs, performance, security, and best practices. Be concise but actionable. Format with markdown.',
        },
        {
          role: 'user',
          content: `Review this code:\n\n${code}`,
        },
      ],
      max_tokens: 1000,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || 'OpenAI API error');
  }

  return data.choices[0].message.content;
}

