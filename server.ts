import express, { Request, Response } from 'express';


export async function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Restrict browser access to the published frontend origin.
  const allowedOrigins = new Set(
    (process.env.CORS_ALLOWED_ORIGINS || 'https://mehranbakhtarani-gif.github.io')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Max-Age', '86400');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Baseline security headers (preserve iframe embed compatibility by omitting X-Frame-Options)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Lightweight sliding-window per-IP rate limiter for API routes
  const rateBuckets = new Map<string, { count: number; resetAt: number }>();
  const createRateLimiter = (maxPerMinute: number) => (req: Request, res: Response, next: express.NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${req.path}:${ip}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
      if (rateBuckets.size > 5000) {
        for (const [k, v] of rateBuckets.entries()) {
          if (now > v.resetAt) rateBuckets.delete(k);
        }
      }
      next();
      return;
    }
    bucket.count += 1;
    if (bucket.count > maxPerMinute) {
      res.status(429).json({
        error: 'تعداد درخواست‌ها بیش از حد مجاز در دقیقه است. لطفاً کمی صبر کرده و دوباره تلاش کنید.',
      });
      return;
    }
    next();
  };

  const ALLOWED_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);
  const MAX_BASE64_IMAGE_CHARS = 7_500_000;

  // Worker-compatible JSON parser. Express's body-parser dependency is not
  // fully supported by the Cloudflare Node HTTP runtime, so parse the request
  // stream directly with an explicit size limit.
  app.use((req: Request, res: Response, next: express.NextFunction) => {
    if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH' && req.method !== 'DELETE') {
      req.body = {};
      next();
      return;
    }
    const contentType = String(req.headers['content-type'] || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      req.body = {};
      next();
      return;
    }
    let rawBody = '';
    let tooLarge = false;
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      if (tooLarge) return;
      rawBody += chunk;
      if (rawBody.length > 10 * 1024 * 1024) {
        tooLarge = true;
        rawBody = '';
      }
    });
    req.on('end', () => {
      if (tooLarge) {
        res.status(413).json({ error: 'حجم درخواست بیش از حد مجاز است.' });
        return;
      }
      try {
        req.body = rawBody ? JSON.parse(rawBody) : {};
        next();
      } catch {
        res.status(400).json({ error: 'ساختار JSON درخواست معتبر نیست.' });
      }
    });
    req.on('error', () => {
      if (!res.headersSent) res.status(400).json({ error: 'خواندن درخواست ناموفق بود.' });
    });
  });
  app.use('/api/ai', createRateLimiter(30));
  app.use('/api/images', createRateLimiter(15));
  app.use('/api/supabase', createRateLimiter(60));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'holoo-apex-corporate-erp',
      timestamp: new Date().toISOString(),
    });
  });

  // Live Tehran Free-Market FX Rate Proxy (synced with Chand / AlanChand & TGJU)
  interface LiveFxItem {
    code: 'USD' | 'EUR' | 'AED' | 'CNY';
    name: string;
    symbol: string;
    priceIrr: number;
    buyIrr?: number;
    highIrr?: number;
    lowIrr?: number;
    changeIrr: number;
    changePercent: number;
    direction: 'up' | 'down' | 'flat';
    updatedTime: string;
  }

  interface LiveFxCache {
    fetchedAt: number;
    source: string;
    sourceUrl: string;
    items: LiveFxItem[];
  }

  let liveFxCache: LiveFxCache | null = null;
  const FX_CACHE_TTL_MS = 60_000;

  const parseNumericString = (raw: unknown): number => {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw !== 'string') return 0;
    const persian = '۰۱۲۳۴۵۶۷۸۹';
    const arabic = '٠١٢٣٤٥٦٧٨٩';
    let normalized = '';
    for (const ch of raw) {
      const pIdx = persian.indexOf(ch);
      if (pIdx !== -1) {
        normalized += String(pIdx);
      } else {
        const aIdx = arabic.indexOf(ch);
        normalized += aIdx !== -1 ? String(aIdx) : ch;
      }
    }
    const cleaned = normalized.replace(/[^0-9.-]/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  };

  async function fetchLiveFxRates(): Promise<LiveFxCache> {
    const items: LiveFxItem[] = [];

    // Primary structured JSON source (Tehran Free Market — aligned with chand.app / TGJU)
    try {
      const tgjuResp = await fetch('https://call1.tgju.org/ajax.json', {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HolooApexERP/1.0)' },
        signal: AbortSignal.timeout(6000),
      });
      if (tgjuResp.ok) {
        const json = (await tgjuResp.json()) as {
          current?: Record<
            string,
            {
              p?: string;
              h?: string;
              l?: string;
              d?: string;
              dp?: number | string;
              dt?: string;
              t?: string;
              ts?: string;
            }
          >;
        };
        const cur = json?.current || {};
        const spec: {
          code: 'USD' | 'EUR' | 'AED' | 'CNY';
          key: string;
          name: string;
          symbol: string;
        }[] = [
          { code: 'USD', key: 'price_dollar_rl', name: 'دلار آمریکا', symbol: '$' },
          { code: 'EUR', key: 'price_eur', name: 'یورو اروپا', symbol: '€' },
          { code: 'AED', key: 'price_aed', name: 'درهم امارات', symbol: 'د.إ' },
          { code: 'CNY', key: 'price_cny', name: 'یوان چین', symbol: '¥' },
        ];

        for (const s of spec) {
          const row = cur[s.key];
          if (!row) continue;
          const priceIrr = Math.round(parseNumericString(row.p));
          if (priceIrr <= 0) continue;
          const highIrr = Math.round(parseNumericString(row.h)) || undefined;
          const lowIrr = Math.round(parseNumericString(row.l)) || undefined;
          const rawDelta = Math.round(parseNumericString(row.d));
          const dp = Math.abs(parseNumericString(row.dp));
          const dt = String(row.dt || '').toLowerCase();
          const direction: 'up' | 'down' | 'flat' =
            dt === 'high' ? 'up' : dt === 'low' ? 'down' : 'flat';
          const changeIrr = direction === 'down' ? -Math.abs(rawDelta) : Math.abs(rawDelta);

          items.push({
            code: s.code,
            name: s.name,
            symbol: s.symbol,
            priceIrr,
            highIrr,
            lowIrr,
            changeIrr,
            changePercent: direction === 'down' ? -dp : dp,
            direction,
            updatedTime: String(row.t || row.ts || ''),
          });
        }
      }
    } catch {
      // Fallback below
    }

    // Secondary fallback from AlanChand public currencies page if primary had fewer than 4 items
    if (items.length < 4) {
      try {
        const acResp = await fetch('https://alanchand.com/currencies-price', {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HolooApexERP/1.0)' },
          signal: AbortSignal.timeout(6000),
        });
        if (acResp.ok) {
          const html = await acResp.text();
          const existingCodes = new Set(items.map((i) => i.code));
          const fallbackSpecs: {
            code: 'USD' | 'EUR' | 'AED' | 'CNY';
            slug: string;
            name: string;
            symbol: string;
          }[] = [
            { code: 'USD', slug: 'usd', name: 'دلار آمریکا', symbol: '$' },
            { code: 'EUR', slug: 'eur', name: 'یورو اروپا', symbol: '€' },
            { code: 'AED', slug: 'aed', name: 'درهم امارات', symbol: 'د.إ' },
            { code: 'CNY', slug: 'cny', name: 'یوان چین', symbol: '¥' },
          ];
          for (const fs of fallbackSpecs) {
            if (existingCodes.has(fs.code)) continue;
            const idx = html.indexOf(`currencies-price/${fs.slug}`);
            if (idx === -1) continue;
            const textChunk = html
              .slice(idx, idx + 700)
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ');
            const numMatch = textChunk.match(/([۰-۹0-9]{2,3}[,،][۰-۹0-9]{3})/);
            if (numMatch) {
              const toman = parseNumericString(numMatch[1]);
              if (toman > 1000) {
                items.push({
                  code: fs.code,
                  name: fs.name,
                  symbol: fs.symbol,
                  priceIrr: Math.round(toman * 10),
                  changeIrr: 0,
                  changePercent: 0,
                  direction: 'flat',
                  updatedTime: new Date().toLocaleTimeString('fa-IR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                });
              }
            }
          }
        }
      } catch {
        // Ignore fallback failure
      }
    }

    return {
      fetchedAt: Date.now(),
      source: 'بازار آزاد تهران (همگام با chand.app)',
      sourceUrl: 'https://chand.app/',
      items,
    };
  }

  app.get('/api/live-fx', async (req: Request, res: Response) => {
    try {
      const forceRefresh = req.query.refresh === '1';
      if (
        !forceRefresh &&
        liveFxCache &&
        liveFxCache.items.length > 0 &&
        Date.now() - liveFxCache.fetchedAt < FX_CACHE_TTL_MS
      ) {
        res.json({
          ...liveFxCache,
          cached: true,
        });
        return;
      }

      const fresh = await fetchLiveFxRates();
      if (fresh.items.length > 0) {
        liveFxCache = fresh;
        res.json({ ...fresh, cached: false });
        return;
      }

      if (liveFxCache && liveFxCache.items.length > 0) {
        res.json({ ...liveFxCache, cached: true, stale: true });
        return;
      }

      res.status(502).json({
        error: 'امکان دریافت لحظه‌ای نرخ ارز از سرور منبع وجود ندارد.',
        items: [],
      });
    } catch {
      res.status(502).json({
        error: 'خطا در ارتباط با منبع نرخ لحظه‌ای ارز.',
        items: [],
      });
    }
  });

  app.post('/api/images/generate', async (req: Request, res: Response) => {
    try {
      const { prompt, imageSize = '1K', aspectRatio = '16:9' } = req.body ?? {};
      if (typeof prompt !== 'string' || prompt.trim().length < 4 || prompt.trim().length > 1500) {
        res.status(400).json({ error: 'شرح تصویر باید بین ۴ تا ۱۵۰۰ کاراکتر باشد.' });
        return;
      }
      const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
      if (!apiKey) {
        res.status(503).json({ error: 'کلید OPENAI_API_KEY در Secretهای Cloudflare تنظیم نشده است.', code: 'MISSING_API_KEY' });
        return;
      }
      const sizeByRatio: Record<string, string> = {
        '1:1': '1024x1024', '2:3': '1024x1536', '3:4': '1024x1536', '9:16': '1024x1536',
        '3:2': '1536x1024', '4:3': '1536x1024', '16:9': '1536x1024', '21:9': '1536x1024',
      };
      const safeRatio = Object.prototype.hasOwnProperty.call(sizeByRatio, aspectRatio) ? aspectRatio : '16:9';
      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-image-2',
          prompt: prompt.trim(),
          size: sizeByRatio[safeRatio],
          quality: imageSize === '4K' || imageSize === '2K' ? 'high' : 'medium',
          output_format: 'png',
        }),
        signal: AbortSignal.timeout(90000),
      });
      const payload = await response.json().catch(() => ({})) as {
        data?: { b64_json?: string }[];
        error?: { message?: string };
      };
      if (!response.ok) {
        const error = new Error(payload.error?.message || 'OpenAI image generation failed') as Error & { status?: number };
        error.status = response.status;
        throw error;
      }
      const imageBase64 = payload.data?.[0]?.b64_json;
      if (!imageBase64) {
        res.status(502).json({ error: 'مدل تصویری خروجی معتبر برنگرداند.' });
        return;
      }
      res.json({
        imageUrl: 'data:image/png;base64,' + imageBase64,
        caption: '',
        model: 'gpt-image-2',
        imageSize,
        aspectRatio: safeRatio,
      });
    } catch (err: unknown) {
      const status = Number((err as { status?: number })?.status || 0);
      if (status === 401 || status === 403) {
        res.status(403).json({ error: 'کلید OpenAI معتبر نیست یا دسترسی API فعال نیست.' });
      } else if (status === 429) {
        res.status(429).json({ error: 'سهمیه یا محدودیت درخواست OpenAI تکمیل شده است.' });
      } else {
        console.error('[OpenAI Image Error]', err instanceof Error ? err.message : String(err));
        res.status(status >= 400 && status < 500 ? status : 502).json({ error: 'تولید تصویر با OpenAI ناموفق بود. تنظیمات API و مدل را بررسی کنید.' });
      }
    }
  });

  // ---------------- HOLOO APEX 9.6 OPENAI FINANCIAL INTELLIGENCE ----------------
  const SMART_MODEL = String(process.env.OPENAI_MODEL || 'gpt-6.1-sol').trim();

  class OpenAiRequestError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = 'OpenAiRequestError';
      this.status = status;
    }
  }

  async function generateOpenAiJson(prompt: string, imageDataUrl?: string): Promise<Record<string, any>> {
    const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
    if (!apiKey) throw new OpenAiRequestError('OPENAI_API_KEY is not configured', 503);
    const content: Record<string, unknown>[] = [{ type: 'input_text', text: prompt }];
    if (imageDataUrl) content.push({ type: 'input_image', image_url: imageDataUrl });

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: SMART_MODEL,
        input: [{ role: 'user', content }],
        text: { format: { type: 'json_object' } },
        max_output_tokens: 5000,
      }),
      signal: AbortSignal.timeout(60000),
    });
    const payload = await response.json().catch(() => ({})) as {
      output?: { content?: { type?: string; text?: string }[] }[];
      output_text?: string;
      error?: { message?: string };
    };
    if (!response.ok) throw new OpenAiRequestError(payload.error?.message || 'OpenAI Responses API request failed', response.status);
    const outputText = payload.output_text || (payload.output || [])
      .flatMap((item) => item.content || [])
      .filter((part) => part.type === 'output_text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('\n');
    if (!outputText) throw new OpenAiRequestError('OpenAI returned an empty response', 502);
    try {
      const parsed = JSON.parse(outputText);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected JSON object');
      return parsed as Record<string, any>;
    } catch {
      throw new OpenAiRequestError('OpenAI returned invalid JSON', 502);
    }
  }

  const handleAiError = (res: Response, err: unknown, fallbackMsg: string) => {
    const status = Number((err as { status?: number })?.status || 0);
    const message = err instanceof Error ? err.message : String(err);
    console.error('[OpenAI Route Error]', fallbackMsg, message);
    if (status === 401 || status === 403) {
      res.status(403).json({ error: 'کلید OpenAI معتبر نیست یا دسترسی API فعال نیست. Secret با نام OPENAI_API_KEY را بررسی کنید.' });
    } else if (status === 429) {
      res.status(429).json({ error: 'سهمیه یا محدودیت درخواست OpenAI تکمیل شده است.' });
    } else if (status === 503) {
      res.status(503).json({ error: 'کلید OPENAI_API_KEY در Secretهای Cloudflare تنظیم نشده است.' });
    } else {
      res.status(status >= 400 && status < 500 ? status : 502).json({ error: fallbackMsg + '. لطفاً دوباره تلاش کنید.' });
    }
  };

  // 1. Persian transaction -> balanced double-entry voucher draft
  app.post('/api/ai/parse-voucher', async (req: Request, res: Response) => {
    try {
      const { text, currencyUnit = 'IRT', accounts = [], parties = [] } = req.body ?? {};
      if (typeof text !== 'string' || text.trim().length < 4 || text.trim().length > 1500) {
        res.status(400).json({ error: 'شرح رویداد مالی باید بین ۴ تا ۱۵۰۰ کاراکتر باشد.' });
        return;
      }
      const compactAccounts = Array.isArray(accounts)
        ? accounts.slice(0, 120).map((a: { code?: string; title?: string; category?: string }) =>
            String(a.code || '') + ': ' + String(a.title || '') + ' (' + String(a.category || '') + ')').join('\n')
        : '';
      const compactParties = Array.isArray(parties)
        ? parties.slice(0, 80).map((p: { id?: string; code?: string; name?: string }) =>
            String(p.id || '') + ' | ' + String(p.code || '') + ': ' + String(p.name || '')).join('\n')
        : '';
      const prompt = [
        'تو حسابدار ارشد آشنا با استانداردهای حسابداری ایران هستی. رویداد مالی را به پیش‌نویس سند دوبل تبدیل کن.',
        'مبالغ خروجی عدد صحیح ریال باشند. اگر کاربر تومان گفت در ۱۰ ضرب کن. واحد نمایش فعلی: ' + (currencyUnit === 'IRT' ? 'تومان' : 'ریال') + '.',
        'فقط از کدهای حساب فهرست استفاده کن. partyId فقط در صورت تطبیق دقیق با فهرست مقدار بگیرد.',
        'هر ردیف فقط بدهکار یا بستانکار داشته باشد. سند باید دقیقاً تراز باشد؛ اختلاف را با ساختن عدد یا تغییر مبلغ جبران نکن.',
        'اگر اطلاعات کافی نیست خطوط را خالی بگذار و reasoning را توضیح بده.',
        'فهرست کدینگ حساب:\n' + compactAccounts,
        'فهرست طرف‌حساب‌ها:\n' + compactParties,
        'رویداد مالی:\n"""' + text.trim() + '"""',
        'خروجی JSON با کلیدهای description, voucherType, reasoning, lines. هر line شامل accountCode, partyId, description, debitIrr, creditIrr باشد.',
      ].join('\n\n');

      const parsed = await generateOpenAiJson(prompt);
      const rawLines = Array.isArray(parsed.lines) ? parsed.lines : [];
      if (rawLines.length < 2 || rawLines.length > 100) {
        res.status(422).json({ error: 'امکان استخراج تعداد معتبر آرتیکل از متن وجود نداشت. شرح و مبلغ را دقیق‌تر وارد کنید.' });
        return;
      }
      const validAccountCodes = new Set(
        Array.isArray(accounts) ? accounts.map((a: { code?: string }) => String(a.code || '')) : []
      );
      const sanitized = rawLines.map((line: Record<string, unknown>) => {
        const code = String(line.accountCode || '').trim();
        const debit = Number(line.debitIrr);
        const credit = Number(line.creditIrr);
        if (!Number.isSafeInteger(debit) || !Number.isSafeInteger(credit) || debit < 0 || credit < 0 || (debit > 0 && credit > 0)) {
          throw new OpenAiRequestError('AI returned invalid voucher amounts', 422);
        }
        if (validAccountCodes.size > 0 && !validAccountCodes.has(code)) {
          throw new OpenAiRequestError('AI selected an account code outside the supplied chart of accounts', 422);
        }
        return {
          accountCode: code,
          partyId: typeof line.partyId === 'string' && line.partyId.trim() ? line.partyId.trim() : undefined,
          description: String(line.description || parsed.description || '').trim().slice(0, 300),
          debitIrr: debit,
          creditIrr: credit,
        };
      });
      const sumDebit = sanitized.reduce((sum: number, line: { debitIrr: number }) => sum + line.debitIrr, 0);
      const sumCredit = sanitized.reduce((sum: number, line: { creditIrr: number }) => sum + line.creditIrr, 0);
      if (!Number.isSafeInteger(sumDebit) || !Number.isSafeInteger(sumCredit) || sumDebit <= 0 || sumDebit !== sumCredit) {
        res.status(422).json({ error: 'پیش‌نویس تولیدشده تراز نیست؛ هیچ مبلغی به‌صورت خودکار اصلاح نشد.' });
        return;
      }
      res.json({
        description: String(parsed.description || text.trim()).slice(0, 300),
        voucherType: String(parsed.voucherType || 'general'),
        reasoning: String(parsed.reasoning || '').slice(0, 1000),
        lines: sanitized,
      });
    } catch (err: unknown) {
      handleAiError(res, err, 'خطا در تبدیل هوشمند متن به سند');
    }
  });

  // 2. Invoice / proforma extraction from text or image
  app.post('/api/ai/parse-invoice', async (req: Request, res: Response) => {
    try {
      const { text = '', imageDataUrl = '', invoiceType = 'sale', products = [], parties = [] } = req.body ?? {};
      const hasText = typeof text === 'string' && text.trim().length >= 3 && text.trim().length <= 4000;
      const hasImage = typeof imageDataUrl === 'string' && imageDataUrl.startsWith('data:image/') && imageDataUrl.length <= MAX_BASE64_IMAGE_CHARS;
      if (!hasText && !hasImage) {
        res.status(400).json({ error: 'متن سفارش/فاکتور یا تصویر معتبر PNG/JPG/WEBP لازم است.' });
        return;
      }
      let safeImage: string | undefined;
      if (hasImage) {
        const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);
        if (!match || !ALLOWED_IMAGE_MIMES.has(match[1].toLowerCase())) {
          res.status(400).json({ error: 'فقط فرمت‌های PNG، JPG و WEBP مجاز هستند.' });
          return;
        }
        safeImage = imageDataUrl;
      }
      const compactProducts = Array.isArray(products)
        ? products.slice(0, 120).map((p: { id?: string; sku?: string; name?: string; sellPrice?: number; buyPrice?: number; kgPerCarton?: number }) =>
            String(p.id || '') + ' | ' + String(p.sku || '') + ' | ' + String(p.name || '') + ' | فروش:' + String(p.sellPrice ?? '') + ' | خرید:' + String(p.buyPrice ?? '') + ' | وزن‌کارتن:' + String(p.kgPerCarton ?? 25)).join('\n')
        : '';
      const compactParties = Array.isArray(parties)
        ? parties.slice(0, 80).map((p: { id?: string; code?: string; name?: string }) =>
            String(p.id || '') + ' | ' + String(p.code || '') + ': ' + String(p.name || '')).join('\n')
        : '';
      const prompt = [
        'تو دستیار هوشمند صدور فاکتور هلو اپکس هستی. از متن یا تصویر، اقلام کالا، طرف‌حساب، تعداد کارتن، وزن و نرخ را استخراج کن.',
        'قیمت‌ها ریال باشند؛ اگر تومان بود در ۱۰ ضرب کن. productId را فقط از فهرست کالاها انتخاب کن؛ اگر تطبیق قطعی نیست productId را خالی و productNameHint را پر کن.',
        'اگر تعداد کارتن داده شده و وزن نیست، وزن را با وزن هر کارتن کالا محاسبه کن. نوع فاکتور: ' + String(invoiceType).slice(0, 32),
        'کالاها:\n' + compactProducts,
        'طرف‌حساب‌ها:\n' + compactParties,
        hasText ? 'متن فاکتور:\n"""' + text.trim() + '"""' : '',
        'خروجی JSON شامل partyId, partyNameHint, notes, items باشد. هر item شامل productId, productNameHint, cartonCount, quantityKg, unitPriceIrr, discountIrr باشد.',
      ].filter(Boolean).join('\n\n');
      const parsed = await generateOpenAiJson(prompt, safeImage);
      res.json({
        partyId: typeof parsed.partyId === 'string' ? parsed.partyId.slice(0, 180) : '',
        partyNameHint: typeof parsed.partyNameHint === 'string' ? parsed.partyNameHint.slice(0, 200) : '',
        notes: typeof parsed.notes === 'string' ? parsed.notes.slice(0, 1000) : '',
        items: Array.isArray(parsed.items) ? parsed.items.slice(0, 200) : [],
      });
    } catch (err: unknown) {
      handleAiError(res, err, 'خطا در تحلیل هوشمند فاکتور');
    }
  });

  // 3. Financial copilot
  app.post('/api/ai/copilot', async (req: Request, res: Response) => {
    try {
      const { message, history = [], snapshot = {} } = req.body ?? {};
      if (typeof message !== 'string' || message.trim().length < 2 || message.trim().length > 2000) {
        res.status(400).json({ error: 'سؤال باید بین ۲ تا ۲۰۰۰ کاراکتر باشد.' });
        return;
      }
      const historyText = Array.isArray(history)
        ? history.slice(-6).map((h: { role?: string; text?: string }) =>
            (h.role === 'user' ? 'کاربر' : 'مشاور') + ': ' + String(h.text || '').slice(0, 600)).join('\n')
        : '';
      let safeSnapshot = '{}';
      try { safeSnapshot = JSON.stringify(snapshot ?? {}).slice(0, 35000); } catch { safeSnapshot = '{}'; }
      const prompt = [
        'تو مشاور هوشمند مالی و مالیاتی هلو اپکس برای مدیرعامل و مدیر مالی هستی.',
        'پاسخ فقط متکی به اعداد واقعی JSON باشد و هیچ عددی نساز. کوتاه، دقیق، اجرایی و به فارسی حرفه‌ای پاسخ بده.',
        'حداکثر ۳ اقدام از این ماژول‌ها پیشنهاد بده: dashboard, invoices, vouchers, audit, accounts, parties, inventory, treasury, currencies, commercial, corporate, reports, settings.',
        'اطلاعات دفاتر:\n' + safeSnapshot,
        historyText ? 'سابقه گفتگو:\n' + historyText : '',
        'سؤال:\n' + message.trim(),
        'خروجی JSON با reply و suggestedActions (آرایه‌ای از label, module, intent) برگردان.',
      ].filter(Boolean).join('\n\n');
      const parsed = await generateOpenAiJson(prompt);
      const allowedModules = new Set(['dashboard', 'invoices', 'vouchers', 'audit', 'accounts', 'parties', 'inventory', 'treasury', 'currencies', 'commercial', 'corporate', 'reports', 'settings']);
      const actions = Array.isArray(parsed.suggestedActions)
        ? parsed.suggestedActions.filter((a: Record<string, unknown>) => allowedModules.has(String(a.module || ''))).slice(0, 3).map((a: Record<string, unknown>) => ({
            label: String(a.label || '').slice(0, 80),
            module: String(a.module || ''),
            intent: String(a.intent || '').slice(0, 240),
          }))
        : [];
      res.json({ reply: String(parsed.reply || 'پاسخی تولید نشد.').slice(0, 5000), suggestedActions: actions });
    } catch (err: unknown) {
      handleAiError(res, err, 'خطا در پاسخ‌گویی مشاور هوشمند مالی');
    }
  });

  // 4. OCR for cheques, bank receipts and expense bills
  app.post('/api/ai/scan-document', async (req: Request, res: Response) => {
    try {
      const { imageDataUrl = '', hintKind = 'auto', parties = [], accounts = [] } = req.body ?? {};
      if (typeof imageDataUrl !== 'string' || !imageDataUrl.startsWith('data:image/') || imageDataUrl.length > MAX_BASE64_IMAGE_CHARS) {
        res.status(400).json({ error: 'تصویر معتبر PNG/JPG/WEBP از چک یا رسید لازم است.' });
        return;
      }
      const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);
      if (!match || !ALLOWED_IMAGE_MIMES.has(match[1].toLowerCase())) {
        res.status(400).json({ error: 'فقط فرمت‌های PNG، JPG و WEBP مجاز هستند.' });
        return;
      }
      const compactParties = Array.isArray(parties)
        ? parties.slice(0, 80).map((p: { id?: string; name?: string }) => String(p.id || '') + ' | ' + String(p.name || '')).join('\n')
        : '';
      const compactAccounts = Array.isArray(accounts)
        ? accounts.filter((a: { code?: string }) => String(a.code || '').startsWith('8') || String(a.code || '').startsWith('102')).slice(0, 40).map((a: { code?: string; title?: string }) => String(a.code || '') + ': ' + String(a.title || '')).join('\n')
        : '';
      const prompt = [
        'تو سیستم OCR حسابداری ایرانی هستی. تصویر می‌تواند چک صیادی، فیش بانکی یا قبض هزینه باشد. نوع پیشنهادی: ' + String(hintKind).slice(0, 40),
        'amountIrr عدد صحیح ریال باشد؛ اگر روی رسید تومان بود در ۱۰ ضرب کن. تاریخ‌ها شمسی YYYY/MM/DD با ارقام انگلیسی باشند.',
        'برای چک صیادی شناسه ۱۶ رقمی، سریال، بانک و شعبه را بخوان. partyId فقط در صورت تطبیق با فهرست طرف‌حساب‌ها تعیین شود.',
        'suggestedAccountCode فقط از کدینگ ارسالی انتخاب شود.',
        'طرف‌حساب‌ها:\n' + compactParties,
        'کدهای هزینه و بانک:\n' + compactAccounts,
        'خروجی JSON شامل documentKind, sayadiId, serial, bankName, branch, partyId, partyNameHint, amountIrr, issueDate, dueDate, trackingNumber, description, suggestedAccountCode باشد.',
      ].join('\n\n');
      const parsed = await generateOpenAiJson(prompt, imageDataUrl);
      const amount = Number(parsed.amountIrr);
      res.json({
        documentKind: String(parsed.documentKind || 'bank_receipt'),
        sayadiId: String(parsed.sayadiId || '').replace(/[^0-9]/g, '').slice(0, 16),
        serial: String(parsed.serial || '').slice(0, 48),
        bankName: String(parsed.bankName || '').slice(0, 100),
        branch: String(parsed.branch || '').slice(0, 100),
        partyId: String(parsed.partyId || '').slice(0, 180),
        partyNameHint: String(parsed.partyNameHint || '').slice(0, 200),
        amountIrr: Number.isSafeInteger(amount) && amount > 0 ? amount : 0,
        issueDate: String(parsed.issueDate || '').slice(0, 20),
        dueDate: String(parsed.dueDate || '').slice(0, 20),
        trackingNumber: String(parsed.trackingNumber || '').slice(0, 80),
        description: String(parsed.description || '').slice(0, 500),
        suggestedAccountCode: String(parsed.suggestedAccountCode || '').slice(0, 32),
      });
    } catch (err: unknown) {
      handleAiError(res, err, 'خطا در اسکن هوشمند تصویر چک/رسید');
    }
  });

  // ---------------- DUAL-CLOUD SUPABASE POSTGRESQL SYNC PROXY ----------------
  // Keeps SUPABASE_SERVICE_ROLE_KEY strictly on the server and verifies Firebase ID Tokens
  // on every protected sync/pull request before accessing owner-scoped PostgreSQL rows.
  // Firebase Web API key is public configuration, injected as a Worker variable.
  const firebaseWebApiKey = String(process.env.FIREBASE_WEB_API_KEY || '').trim();

  function isPrivateOrBlockedHost(hostname: string): boolean {
    const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (
      h === 'localhost' ||
      h === '::1' ||
      h.endsWith('.local') ||
      h.endsWith('.internal') ||
      /^127\./.test(h) ||
      /^10\./.test(h) ||
      /^192\.168\./.test(h) ||
      /^169\.254\./.test(h) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(h) ||
      h === '0.0.0.0'
    ) {
      return true;
    }
    return false;
  }

  interface ValidatedSupabaseConfig {
    baseUrl: string;
    serviceRoleKey: string;
    tableName: string;
    auditTableName: string;
    projectRef: string;
  }

  function getValidatedSupabaseConfig(): ValidatedSupabaseConfig | null {
    const rawUrl = String(process.env.SUPABASE_URL || '').trim();
    const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!rawUrl || !serviceRoleKey) return null;

    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'https:') return null;
      if (isPrivateOrBlockedHost(parsed.hostname)) return null;

      const rawTable = String(process.env.SUPABASE_TABLE_NAME || 'holoo_apex_workspaces').trim();
      const tableName = /^[a-z][a-z0-9_]{2,60}$/.test(rawTable)
        ? rawTable
        : 'holoo_apex_workspaces';

      const projectRef = parsed.hostname.split('.')[0] || parsed.hostname;
      return {
        baseUrl: `${parsed.origin}`,
        serviceRoleKey,
        tableName,
        auditTableName: 'holoo_apex_audit_log',
        projectRef,
      };
    } catch {
      return null;
    }
  }

  async function verifyFirebaseBearerToken(
    req: Request
  ): Promise<{ uid: string; email: string } | null> {
    const authHeader = String(req.headers.authorization || '');
    if (!authHeader.startsWith('Bearer ')) return null;
    const idToken = authHeader.slice(7).trim();
    if (!idToken || idToken.length > 8192 || !firebaseWebApiKey) return null;

    try {
      const lookupUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseWebApiKey)}`;
      const resp = await fetch(lookupUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
        signal: AbortSignal.timeout(7000),
      });
      if (!resp.ok) return null;
      const data = (await resp.json()) as {
        users?: { localId?: string; email?: string }[];
      };
      const userRec = data?.users?.[0];
      if (!userRec?.localId) return null;
      return {
        uid: String(userRec.localId),
        email: String(userRec.email || ''),
      };
    } catch {
      return null;
    }
  }

  function buildSupabaseHeaders(cfg: ValidatedSupabaseConfig, extra?: Record<string, string>) {
    return {
      apikey: cfg.serviceRoleKey,
      Authorization: `Bearer ${cfg.serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  async function sha256Hex(value: string): Promise<string> {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  function randomDeviceToken(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function verifySupabaseBearerToken(
    req: Request
  ): Promise<{ uid: string; email: string; authType: 'firebase' | 'device' } | null> {
    const firebaseUser = await verifyFirebaseBearerToken(req);
    if (firebaseUser) return { ...firebaseUser, authType: 'firebase' };

    const authHeader = String(req.headers.authorization || '');
    if (!authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7).trim();
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const cfg = getValidatedSupabaseConfig();
    if (!cfg) return null;

    try {
      const tokenHash = await sha256Hex(token);
      const url = `${cfg.baseUrl}/rest/v1/holoo_apex_device_tokens?token_hash=eq.${tokenHash}&revoked_at=is.null&select=owner_id,device_id,device_label&limit=1`;
      const resp = await fetch(url, {
        headers: buildSupabaseHeaders(cfg),
        signal: AbortSignal.timeout(6000),
      });
      if (!resp.ok) return null;
      const rows = (await resp.json()) as { owner_id?: string; device_id?: string }[];
      const row = rows?.[0];
      if (!row?.owner_id || !/^[a-zA-Z0-9_-]{4,180}$/.test(row.owner_id)) return null;
      void fetch(`${cfg.baseUrl}/rest/v1/holoo_apex_device_tokens?token_hash=eq.${tokenHash}`, {
        method: 'PATCH',
        headers: buildSupabaseHeaders(cfg, { Prefer: 'return=minimal' }),
        body: JSON.stringify({ last_used_at: new Date().toISOString() }),
      }).catch(() => undefined);
      return { uid: row.owner_id, email: '', authType: 'device' };
    } catch {
      return null;
    }
  }

  // Issue a separate persistent Supabase device credential while Firebase is signed in.
  // This lets Supabase continue after Firebase is later signed out or temporarily unavailable.
  app.post('/api/supabase/device-token', async (req: Request, res: Response) => {
    const cfg = getValidatedSupabaseConfig();
    if (!cfg) {
      res.status(503).json({ error: 'Supabase در تنظیمات سرور پیکربندی نشده است.' });
      return;
    }
    const owner = await verifyFirebaseBearerToken(req);
    if (!owner || !/^[a-zA-Z0-9_-]{4,180}$/.test(owner.uid)) {
      res.status(401).json({ error: 'ورود گوگل برای ثبت اولیه این دستگاه لازم است.' });
      return;
    }
    const body = (req.body || {}) as { deviceId?: unknown; deviceLabel?: unknown };
    const deviceId = String(body.deviceId || '').slice(0, 128);
    const deviceLabel = String(body.deviceLabel || 'دستگاه کاری').slice(0, 80);
    if (deviceId.length < 8) {
      res.status(400).json({ error: 'شناسه دستگاه معتبر نیست.' });
      return;
    }
    try {
      const token = randomDeviceToken();
      const tokenHash = await sha256Hex(token);
      await fetch(`${cfg.baseUrl}/rest/v1/holoo_apex_device_tokens?owner_id=eq.${encodeURIComponent(owner.uid)}&device_id=eq.${encodeURIComponent(deviceId)}&revoked_at=is.null`, {
        method: 'PATCH',
        headers: buildSupabaseHeaders(cfg, { Prefer: 'return=minimal' }),
        body: JSON.stringify({ revoked_at: new Date().toISOString() }),
      });
      const saved = await fetch(`${cfg.baseUrl}/rest/v1/holoo_apex_device_tokens`, {
        method: 'POST',
        headers: buildSupabaseHeaders(cfg, { Prefer: 'return=minimal' }),
        body: JSON.stringify({ token_hash: tokenHash, owner_id: owner.uid, device_id: deviceId, device_label: deviceLabel }),
      });
      if (!saved.ok) {
        res.status(502).json({ error: 'ثبت مجوز مستقل دستگاه ناموفق بود.' });
        return;
      }
      res.json({ ok: true, deviceToken: token });
    } catch {
      res.status(502).json({ error: 'ارتباط با Supabase برقرار نشد.' });
    }
  });

  // A Firebase-authenticated owner creates a short-lived, single-use pairing code.
  app.post('/api/supabase/pair-code', async (req: Request, res: Response) => {
    const cfg = getValidatedSupabaseConfig();
    if (!cfg) {
      res.status(503).json({ error: 'Supabase در تنظیمات سرور پیکربندی نشده است.' });
      return;
    }
    const owner = await verifyFirebaseBearerToken(req);
    if (!owner || !/^[a-zA-Z0-9_-]{4,180}$/.test(owner.uid)) {
      res.status(401).json({ error: 'برای ساخت کد جفت‌سازی، ورود گوگل در دستگاه اصلی لازم است.' });
      return;
    }
    const body = (req.body || {}) as { deviceId?: unknown };
    const deviceId = String(body.deviceId || '').slice(0, 128);
    if (deviceId.length < 8) {
      res.status(400).json({ error: 'شناسه دستگاه معتبر نیست.' });
      return;
    }
    try {
      await fetch(`${cfg.baseUrl}/rest/v1/holoo_apex_pair_codes?owner_id=eq.${encodeURIComponent(owner.uid)}&expires_at=lt.${encodeURIComponent(new Date().toISOString())}`, {
        method: 'DELETE',
        headers: buildSupabaseHeaders(cfg, { Prefer: 'return=minimal' }),
      });
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const code = String(10_000_000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 90_000_000));
        const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
        const resp = await fetch(`${cfg.baseUrl}/rest/v1/holoo_apex_pair_codes`, {
          method: 'POST',
          headers: buildSupabaseHeaders(cfg, { Prefer: 'return=minimal' }),
          body: JSON.stringify({
            code_hash: await sha256Hex(code),
            owner_id: owner.uid,
            created_by_device_id: deviceId,
            expires_at: expiresAt,
          }),
        });
        if (resp.ok) {
          res.json({ code, expiresAt, expiresInSeconds: 300 });
          return;
        }
        if (resp.status !== 409) break;
      }
      res.status(502).json({ error: 'ساخت کد جفت‌سازی ناموفق بود.' });
    } catch {
      res.status(502).json({ error: 'ارتباط با Supabase برقرار نشد.' });
    }
  });

  // Redeem a pairing code once; the resulting device token is shown only in this response.
  app.post('/api/supabase/pair', async (req: Request, res: Response) => {
    const cfg = getValidatedSupabaseConfig();
    if (!cfg) {
      res.status(503).json({ error: 'Supabase در تنظیمات سرور پیکربندی نشده است.' });
      return;
    }
    const body = (req.body || {}) as { code?: unknown; deviceId?: unknown; deviceLabel?: unknown };
    const code = String(body.code || '').replace(/\D/g, '');
    const deviceId = String(body.deviceId || '').slice(0, 128);
    const deviceLabel = String(body.deviceLabel || 'دستگاه کاری').slice(0, 80);
    if (!/^\d{8}$/.test(code) || deviceId.length < 8) {
      res.status(400).json({ error: 'کد یا شناسه دستگاه معتبر نیست.' });
      return;
    }
    try {
      const codeHash = await sha256Hex(code);
      const lookup = await fetch(`${cfg.baseUrl}/rest/v1/holoo_apex_pair_codes?code_hash=eq.${codeHash}&used_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=owner_id&limit=1`, {
        headers: buildSupabaseHeaders(cfg),
        signal: AbortSignal.timeout(6000),
      });
      if (!lookup.ok) {
        res.status(502).json({ error: 'بررسی کد جفت‌سازی ناموفق بود.' });
        return;
      }
      const rows = (await lookup.json()) as { owner_id?: string }[];
      const ownerId = rows?.[0]?.owner_id;
      if (!ownerId) {
        res.status(400).json({ error: 'کد منقضی شده، قبلاً استفاده شده یا نادرست است.' });
        return;
      }
      const consume = await fetch(`${cfg.baseUrl}/rest/v1/holoo_apex_pair_codes?code_hash=eq.${codeHash}&used_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=code_hash`, {
        method: 'PATCH',
        headers: buildSupabaseHeaders(cfg, { Prefer: 'return=representation' }),
        body: JSON.stringify({ used_at: new Date().toISOString() }),
      });
      const consumed = consume.ok ? ((await consume.json().catch(() => [])) as unknown[]) : [];
      if (!Array.isArray(consumed) || consumed.length !== 1) {
        res.status(409).json({ error: 'این کد قبلاً در دستگاه دیگری استفاده شده است.' });
        return;
      }
      const deviceToken = randomDeviceToken();
      const tokenHash = await sha256Hex(deviceToken);
      await fetch(`${cfg.baseUrl}/rest/v1/holoo_apex_device_tokens?owner_id=eq.${encodeURIComponent(ownerId)}&device_id=eq.${encodeURIComponent(deviceId)}&revoked_at=is.null`, {
        method: 'PATCH',
        headers: buildSupabaseHeaders(cfg, { Prefer: 'return=minimal' }),
        body: JSON.stringify({ revoked_at: new Date().toISOString() }),
      });
      const saveToken = await fetch(`${cfg.baseUrl}/rest/v1/holoo_apex_device_tokens`, {
        method: 'POST',
        headers: buildSupabaseHeaders(cfg, { Prefer: 'return=minimal' }),
        body: JSON.stringify({ token_hash: tokenHash, owner_id: ownerId, device_id: deviceId, device_label: deviceLabel }),
      });
      if (!saveToken.ok) {
        res.status(502).json({ error: 'ثبت مجوز دستگاه جدید ناموفق بود.' });
        return;
      }
      res.json({ ok: true, deviceToken, ownerId, deviceId, deviceLabel });
    } catch {
      res.status(502).json({ error: 'ارتباط با سرور Supabase برقرار نشد.' });
    }
  });

  // Public health check for Supabase connectivity (never returns secrets)
  app.get('/api/supabase/status', async (_req: Request, res: Response) => {
    const cfg = getValidatedSupabaseConfig();
    if (!cfg) {
      res.json({
        configured: false,
        connected: false,
        tableReady: false,
        projectRef: null,
        tableName: 'holoo_apex_workspaces',
        latencyMs: null,
        errorCode: 'NOT_CONFIGURED',
      });
      return;
    }

    const t0 = Date.now();
    try {
      const checkUrl = `${cfg.baseUrl}/rest/v1/${encodeURIComponent(cfg.tableName)}?select=owner_id&limit=1`;
      const resp = await fetch(checkUrl, {
        method: 'GET',
        headers: buildSupabaseHeaders(cfg),
        signal: AbortSignal.timeout(6000),
      });
      const latencyMs = Math.max(1, Date.now() - t0);

      if (resp.ok) {
        res.json({
          configured: true,
          connected: true,
          tableReady: true,
          projectRef: cfg.projectRef,
          tableName: cfg.tableName,
          latencyMs,
          errorCode: null,
        });
        return;
      }

      if (resp.status === 404 || resp.status === 400) {
        res.json({
          configured: true,
          connected: true,
          tableReady: false,
          projectRef: cfg.projectRef,
          tableName: cfg.tableName,
          latencyMs,
          errorCode: 'TABLE_MISSING',
        });
        return;
      }

      res.json({
        configured: true,
        connected: false,
        tableReady: false,
        projectRef: cfg.projectRef,
        tableName: cfg.tableName,
        latencyMs,
        errorCode: resp.status === 401 || resp.status === 403 ? 'AUTH_FAILED' : `HTTP_${resp.status}`,
      });
    } catch {
      res.json({
        configured: true,
        connected: false,
        tableReady: false,
        projectRef: cfg.projectRef,
        tableName: cfg.tableName,
        latencyMs: null,
        errorCode: 'NETWORK_UNREACHABLE',
      });
    }
  });

  const MAX_SUPABASE_CLOUD_BACKUPS = 3;
  const isValidSafeId = (val: string) => /^[a-zA-Z0-9_-]{4,180}$/.test(val);

  interface SupabaseBackupRowMeta {
    owner_id: string;
    revision?: number;
    company_name?: string;
    fiscal_year?: string;
    last_device_label?: string;
    voucher_count?: number;
    invoice_count?: number;
    product_count?: number;
    updated_at?: string;
    created_at?: string;
  }

  function mapSupabaseBackupMeta(row: SupabaseBackupRowMeta) {
    return {
      id: row.owner_id,
      provider: 'supabase' as const,
      revision: Number(row.revision) || 1,
      savedAt: row.created_at || row.updated_at || new Date().toISOString(),
      deviceLabel: row.last_device_label || 'دستگاه کاری',
      companyName: row.company_name || '',
      fiscalYear: row.fiscal_year || '1405',
      voucherCount: Number(row.voucher_count) || 0,
      invoiceCount: Number(row.invoice_count) || 0,
      productCount: Number(row.product_count) || 0,
    };
  }

  async function listAndPruneSupabaseBackups(
    cfg: ValidatedSupabaseConfig,
    ownerUid: string
  ): Promise<{ backups: ReturnType<typeof mapSupabaseBackupMeta>[]; prunedCount: number }> {
    if (!isValidSafeId(ownerUid)) return { backups: [], prunedCount: 0 };
    const prefix = `${ownerUid}__bak__`;
    const listUrl = `${cfg.baseUrl}/rest/v1/${encodeURIComponent(cfg.tableName)}?owner_id=like.${encodeURIComponent(prefix + '*')}&select=owner_id,revision,company_name,fiscal_year,last_device_label,voucher_count,invoice_count,product_count,updated_at,created_at&order=created_at.desc&limit=30`;

    const resp = await fetch(listUrl, {
      method: 'GET',
      headers: buildSupabaseHeaders(cfg),
      signal: AbortSignal.timeout(7000),
    });
    if (!resp.ok) return { backups: [], prunedCount: 0 };

    const rawRows = (await resp.json().catch(() => [])) as SupabaseBackupRowMeta[];
    // Strict prefix check in code so PostgreSQL LIKE underscore wildcards can never cross-match
    const ownedRows = rawRows
      .filter((r) => typeof r.owner_id === 'string' && r.owner_id.startsWith(prefix))
      .sort((a, b) => String(b.created_at || b.updated_at || '').localeCompare(String(a.created_at || a.updated_at || '')));

    const toKeep = ownedRows.slice(0, MAX_SUPABASE_CLOUD_BACKUPS);
    const toDelete = ownedRows.slice(MAX_SUPABASE_CLOUD_BACKUPS);

    let prunedCount = 0;
    for (const oldRow of toDelete) {
      try {
        const delUrl = `${cfg.baseUrl}/rest/v1/${encodeURIComponent(cfg.tableName)}?owner_id=eq.${encodeURIComponent(oldRow.owner_id)}`;
        const delResp = await fetch(delUrl, {
          method: 'DELETE',
          headers: buildSupabaseHeaders(cfg, { Prefer: 'return=minimal' }),
          signal: AbortSignal.timeout(5000),
        });
        if (delResp.ok) prunedCount += 1;
      } catch {
        // Continue pruning remaining stale backups
      }
    }

    return {
      backups: toKeep.map(mapSupabaseBackupMeta),
      prunedCount,
    };
  }

  // List current workspace revision metadata + up to 3 retained Supabase cloud backups (lightweight, no snapshot_json)
  app.get('/api/supabase/backups', async (req: Request, res: Response) => {
    const cfg = getValidatedSupabaseConfig();
    if (!cfg) {
      res.status(503).json({ error: 'Supabase در تنظیمات سرور پیکربندی نشده است.', code: 'NOT_CONFIGURED' });
      return;
    }

    const verified = await verifySupabaseBearerToken(req);
    if (!verified || !isValidSafeId(verified.uid)) {
      res.status(401).json({ error: 'برای مشاهده پشتیبان‌های Supabase ابتدا وارد حساب ابری شوید.' });
      return;
    }

    try {
      const currentUrl = `${cfg.baseUrl}/rest/v1/${encodeURIComponent(cfg.tableName)}?owner_id=eq.${encodeURIComponent(verified.uid)}&select=revision,last_device_id,last_device_label,updated_at&limit=1`;
      const [currentResp, backupResult] = await Promise.all([
        fetch(currentUrl, {
          method: 'GET',
          headers: buildSupabaseHeaders(cfg),
          signal: AbortSignal.timeout(7000),
        }),
        listAndPruneSupabaseBackups(cfg, verified.uid),
      ]);

      let currentRevision = 0;
      let currentUpdatedAt: string | null = null;
      let currentDeviceId = '';
      let currentDeviceLabel = '';

      if (currentResp.ok) {
        const rows = (await currentResp.json().catch(() => [])) as {
          revision?: number;
          last_device_id?: string;
          last_device_label?: string;
          updated_at?: string;
        }[];
        if (rows?.[0]) {
          currentRevision = Number(rows[0].revision) || 0;
          currentUpdatedAt = rows[0].updated_at || null;
          currentDeviceId = rows[0].last_device_id || '';
          currentDeviceLabel = rows[0].last_device_label || '';
        }
      }

      res.json({
        maxBackups: MAX_SUPABASE_CLOUD_BACKUPS,
        currentRevision,
        currentUpdatedAt,
        currentDeviceId,
        currentDeviceLabel,
        prunedCount: backupResult.prunedCount,
        backups: backupResult.backups,
      });
    } catch {
      res.status(502).json({ error: 'خطا در دریافت لیست نسخه‌های پشتیبان Supabase.' });
    }
  });

  // Delete a specific owner-scoped Supabase backup version
  app.delete('/api/supabase/backups/:backupId', async (req: Request, res: Response) => {
    const cfg = getValidatedSupabaseConfig();
    if (!cfg) {
      res.status(503).json({ error: 'Supabase در تنظیمات سرور پیکربندی نشده است.', code: 'NOT_CONFIGURED' });
      return;
    }

    const verified = await verifySupabaseBearerToken(req);
    if (!verified || !isValidSafeId(verified.uid)) {
      res.status(401).json({ error: 'احراز هویت ابری الزامی است.' });
      return;
    }

    const backupId = String(req.params.backupId || '').trim();
    const requiredPrefix = `${verified.uid}__bak__`;
    if (!isValidSafeId(backupId) || !backupId.startsWith(requiredPrefix)) {
      res.status(403).json({ error: 'شناسه نسخه پشتیبان معتبر نیست یا متعلق به این حساب نمی‌باشد.' });
      return;
    }

    try {
      const delUrl = `${cfg.baseUrl}/rest/v1/${encodeURIComponent(cfg.tableName)}?owner_id=eq.${encodeURIComponent(backupId)}`;
      const delResp = await fetch(delUrl, {
        method: 'DELETE',
        headers: buildSupabaseHeaders(cfg, { Prefer: 'return=minimal' }),
        signal: AbortSignal.timeout(7000),
      });
      if (!delResp.ok) {
        res.status(delResp.status).json({ error: 'خطا در حذف نسخه پشتیبان از Supabase.' });
        return;
      }
      const updated = await listAndPruneSupabaseBackups(cfg, verified.uid);
      res.json({ ok: true, backups: updated.backups });
    } catch {
      res.status(502).json({ error: 'ارتباط با سرور Supabase برقرار نشد.' });
    }
  });

  // Pull latest workspace snapshot (or a specific retained backup via ?backupId=...) from Supabase PostgreSQL
  app.get('/api/supabase/pull', async (req: Request, res: Response) => {
    const cfg = getValidatedSupabaseConfig();
    if (!cfg) {
      res.status(503).json({ error: 'Supabase در تنظیمات سرور پیکربندی نشده است.', code: 'NOT_CONFIGURED' });
      return;
    }

    const verified = await verifySupabaseBearerToken(req);
    if (!verified || !isValidSafeId(verified.uid)) {
      res.status(401).json({ error: 'برای خواندن از Supabase ابتدا با حساب ابری وارد شوید.' });
      return;
    }

    const requestedBackupId = typeof req.query.backupId === 'string' ? req.query.backupId.trim() : '';
    let targetOwnerKey = verified.uid;
    if (requestedBackupId) {
      const requiredPrefix = `${verified.uid}__bak__`;
      if (!isValidSafeId(requestedBackupId) || !requestedBackupId.startsWith(requiredPrefix)) {
        res.status(403).json({ error: 'دسترسی به این نسخه پشتیبان مجاز نیست.' });
        return;
      }
      targetOwnerKey = requestedBackupId;
    }

    try {
      const url = `${cfg.baseUrl}/rest/v1/${encodeURIComponent(cfg.tableName)}?owner_id=eq.${encodeURIComponent(targetOwnerKey)}&limit=1`;
      const resp = await fetch(url, {
        method: 'GET',
        headers: buildSupabaseHeaders(cfg),
        signal: AbortSignal.timeout(8000),
      });

      if (!resp.ok) {
        res.status(resp.status).json({ error: 'خطا در بازیابی اطلاعات از Supabase.' });
        return;
      }

      const rows = (await resp.json()) as {
        revision?: number;
        conflict_policy?: string;
        last_device_id?: string;
        last_device_label?: string;
        updated_at?: string;
        snapshot_json?: unknown;
      }[];

      const row = rows?.[0];
      if (!row || !row.snapshot_json) {
        res.json({ found: false, revision: 0 });
        return;
      }

      res.json({
        found: true,
        backupId: requestedBackupId || undefined,
        revision: Number(row.revision) || 1,
        conflictPolicy: row.conflict_policy || 'last_write_wins',
        lastDeviceId: row.last_device_id || '',
        lastDeviceLabel: row.last_device_label || '',
        updatedAt: row.updated_at || new Date().toISOString(),
        snapshotJson:
          typeof row.snapshot_json === 'string'
            ? row.snapshot_json
            : JSON.stringify(row.snapshot_json),
      });
    } catch {
      res.status(502).json({ error: 'ارتباط با سرور Supabase برقرار نشد.' });
    }
  });

  // Sync workspace snapshot to Supabase PostgreSQL + retain strictly last 3 cloud backups with automatic pruning
  app.post('/api/supabase/sync', async (req: Request, res: Response) => {
    const cfg = getValidatedSupabaseConfig();
    if (!cfg) {
      res.status(503).json({ error: 'Supabase در تنظیمات سرور پیکربندی نشده است.', code: 'NOT_CONFIGURED' });
      return;
    }

    const verified = await verifySupabaseBearerToken(req);
    if (!verified || !isValidSafeId(verified.uid)) {
      res.status(401).json({ error: 'احراز هویت ابری برای همگام‌سازی Supabase الزامی است.' });
      return;
    }

    const body = req.body as {
      deviceId?: unknown;
      deviceLabel?: unknown;
      conflictPolicy?: unknown;
      clientRevision?: unknown;
      clientUpdatedAt?: unknown;
      companyName?: unknown;
      fiscalYear?: unknown;
      voucherCount?: unknown;
      invoiceCount?: unknown;
      productCount?: unknown;
      snapshotJson?: unknown;
    };

    const conflictPolicy: 'last_write_wins' | 'first_write_wins' =
      body.conflictPolicy === 'first_write_wins' ? 'first_write_wins' : 'last_write_wins';
    const deviceId = String(body.deviceId || 'unknown').slice(0, 64);
    const deviceLabel = String(body.deviceLabel || 'دستگاه کاری').slice(0, 80);
    const clientRevision = Math.max(0, Math.floor(Number(body.clientRevision) || 0));
    const clientUpdatedAt =
      typeof body.clientUpdatedAt === 'string' && !Number.isNaN(Date.parse(body.clientUpdatedAt))
        ? body.clientUpdatedAt
        : new Date().toISOString();

    if (typeof body.snapshotJson !== 'string' || body.snapshotJson.length === 0) {
      res.status(400).json({ error: 'محتوای اسنپ‌شات برای همگام‌سازی خالی است.' });
      return;
    }
    if (body.snapshotJson.length > 6_000_000) {
      res.status(413).json({ error: 'حجم داده بیش از حد مجاز است.' });
      return;
    }

    let parsedSnapshot: unknown;
    try {
      parsedSnapshot = JSON.parse(body.snapshotJson);
    } catch {
      res.status(400).json({ error: 'فرمت JSON اسنپ‌شات نامعتبر است.' });
      return;
    }

    try {
      // 1. Read existing server row to evaluate concurrent edit conflicts
      const existingUrl = `${cfg.baseUrl}/rest/v1/${encodeURIComponent(cfg.tableName)}?owner_id=eq.${encodeURIComponent(verified.uid)}&limit=1`;
      const existingResp = await fetch(existingUrl, {
        method: 'GET',
        headers: buildSupabaseHeaders(cfg),
        signal: AbortSignal.timeout(8000),
      });

      if (!existingResp.ok) {
        res.status(existingResp.status).json({
          error:
            existingResp.status === 404
              ? 'جدول holoo_apex_workspaces در Supabase ایجاد نشده است (فایل supabase/schema.sql را اجرا کنید).'
              : 'خطا در بررسی نسخه فعلی روی Supabase.',
          code: existingResp.status === 404 ? 'TABLE_MISSING' : 'READ_ERROR',
        });
        return;
      }

      const existingRows = (await existingResp.json()) as {
        revision?: number;
        last_device_id?: string;
        last_device_label?: string;
        updated_at?: string;
        snapshot_json?: unknown;
      }[];
      const existing = existingRows?.[0];
      const serverRev = Number(existing?.revision) || 0;
      const hasRemoteConflict =
        Boolean(existing) &&
        serverRev > clientRevision &&
        existing?.last_device_id !== deviceId;

      const writeAuditLog = async (outcome: string, nextRev: number, details: string) => {
        try {
          await fetch(`${cfg.baseUrl}/rest/v1/${encodeURIComponent(cfg.auditTableName)}`, {
            method: 'POST',
            headers: buildSupabaseHeaders(cfg, { Prefer: 'return=minimal' }),
            body: JSON.stringify({
              owner_id: verified.uid,
              device_id: deviceId,
              device_label: deviceLabel,
              action: 'workspace_sync',
              conflict_policy: conflictPolicy,
              client_revision: clientRevision,
              server_revision: nextRev,
              outcome,
              details: details.slice(0, 300),
            }),
            signal: AbortSignal.timeout(4000),
          });
        } catch {
          // Non-blocking audit log insert
        }
      };

      // 2. Enforce First-Write-Wins when a conflicting newer remote commit exists
      if (hasRemoteConflict && conflictPolicy === 'first_write_wins') {
        await writeAuditLog(
          'conflict_kept_remote',
          serverRev,
          `First-Write-Wins preserved rev ${serverRev} from ${existing?.last_device_label || 'another device'}`
        );
        const backupState = await listAndPruneSupabaseBackups(cfg, verified.uid);
        res.json({
          status: 'conflict_kept_remote',
          serverRevision: serverRev,
          conflictPolicy,
          remoteDeviceLabel: existing?.last_device_label || 'دستگاه دیگر',
          syncedAt: existing?.updated_at || new Date().toISOString(),
          retainedBackups: backupState.backups,
          prunedBackupsCount: backupState.prunedCount,
          remoteSnapshotJson:
            typeof existing?.snapshot_json === 'string'
              ? existing.snapshot_json
              : JSON.stringify(existing?.snapshot_json),
        });
        return;
      }

      // 3. Upsert or Atomic Compare-And-Swap (CAS) update to prevent concurrent lost updates
      const nextRevision = Math.max(serverRev, clientRevision) + 1;
      const nowIso = new Date().toISOString();
      const upsertPayload = {
        owner_id: verified.uid,
        owner_email: verified.email.slice(0, 200),
        company_name: String(body.companyName || '').slice(0, 160),
        fiscal_year: String(body.fiscalYear || '1405').slice(0, 16),
        revision: nextRevision,
        conflict_policy: conflictPolicy,
        last_device_id: deviceId,
        last_device_label: deviceLabel,
        voucher_count: Math.max(0, Math.floor(Number(body.voucherCount) || 0)),
        invoice_count: Math.max(0, Math.floor(Number(body.invoiceCount) || 0)),
        product_count: Math.max(0, Math.floor(Number(body.productCount) || 0)),
        snapshot_json: parsedSnapshot,
        client_updated_at: clientUpdatedAt,
        updated_at: nowIso,
      };

      if (existing && conflictPolicy === 'first_write_wins') {
        // Atomic CAS PATCH: only succeeds if server revision has not changed since our read
        const casUrl = `${cfg.baseUrl}/rest/v1/${encodeURIComponent(cfg.tableName)}?owner_id=eq.${encodeURIComponent(verified.uid)}&revision=eq.${serverRev}`;
        const casResp = await fetch(casUrl, {
          method: 'PATCH',
          headers: buildSupabaseHeaders(cfg, {
            Prefer: 'return=representation',
          }),
          body: JSON.stringify(upsertPayload),
          signal: AbortSignal.timeout(10000),
        });

        if (!casResp.ok) {
          res.status(casResp.status).json({ error: 'خطا در ثبت همزمان نسخه روی Supabase.' });
          return;
        }

        const updatedRows = (await casResp.json().catch(() => [])) as unknown[];
        if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
          // Concurrent write won the race — re-fetch authoritative winning row and preserve it
          const latestResp = await fetch(existingUrl, {
            method: 'GET',
            headers: buildSupabaseHeaders(cfg),
            signal: AbortSignal.timeout(6000),
          });
          const latestRows = latestResp.ok
            ? ((await latestResp.json().catch(() => [])) as typeof existingRows)
            : [];
          const winner = latestRows?.[0] || existing;
          const winnerRev = Number(winner?.revision) || serverRev;
          await writeAuditLog(
            'conflict_kept_remote',
            winnerRev,
            `Atomic CAS prevented overwrite of concurrent rev ${winnerRev}`
          );
          const backupState = await listAndPruneSupabaseBackups(cfg, verified.uid);
          res.json({
            status: 'conflict_kept_remote',
            serverRevision: winnerRev,
            conflictPolicy,
            remoteDeviceLabel: winner?.last_device_label || 'دستگاه دیگر',
            syncedAt: winner?.updated_at || nowIso,
            retainedBackups: backupState.backups,
            prunedBackupsCount: backupState.prunedCount,
            remoteSnapshotJson:
              typeof winner?.snapshot_json === 'string'
                ? winner.snapshot_json
                : JSON.stringify(winner?.snapshot_json),
          });
          return;
        }
      } else {
        const upsertUrl = `${cfg.baseUrl}/rest/v1/${encodeURIComponent(cfg.tableName)}?on_conflict=owner_id`;
        const upsertResp = await fetch(upsertUrl, {
          method: 'POST',
          headers: buildSupabaseHeaders(cfg, {
            Prefer: 'resolution=merge-duplicates,return=minimal',
          }),
          body: JSON.stringify(upsertPayload),
          signal: AbortSignal.timeout(10000),
        });

        if (!upsertResp.ok) {
          res.status(upsertResp.status).json({ error: 'خطا در ذخیره نسخه روی Supabase.' });
          return;
        }
      }

      // 4. Rolling 3-Version Cloud Backup Retention: store versioned backup & auto-prune older versions (> 3)
      const backupKey = `${verified.uid}__bak__${Date.now()}_${nextRevision}`;
      let retainedBackups: ReturnType<typeof mapSupabaseBackupMeta>[] = [];
      let prunedBackupsCount = 0;
      try {
        await fetch(`${cfg.baseUrl}/rest/v1/${encodeURIComponent(cfg.tableName)}`, {
          method: 'POST',
          headers: buildSupabaseHeaders(cfg, { Prefer: 'return=minimal' }),
          body: JSON.stringify({
            ...upsertPayload,
            owner_id: backupKey,
            created_at: nowIso,
          }),
          signal: AbortSignal.timeout(8000),
        });
        const pruned = await listAndPruneSupabaseBackups(cfg, verified.uid);
        retainedBackups = pruned.backups;
        prunedBackupsCount = pruned.prunedCount;
      } catch {
        // Non-blocking rolling backup cleanup
      }

      const outcome = hasRemoteConflict ? 'conflict_overwrote_remote' : 'synced';
      await writeAuditLog(
        outcome,
        nextRevision,
        hasRemoteConflict
          ? `Last-Write-Wins resolved conflict over rev ${serverRev} (retained ${retainedBackups.length}/${MAX_SUPABASE_CLOUD_BACKUPS}, pruned ${prunedBackupsCount})`
          : `Synced rev ${nextRevision} from ${deviceLabel} (retained ${retainedBackups.length}/${MAX_SUPABASE_CLOUD_BACKUPS}, pruned ${prunedBackupsCount})`
      );

      res.json({
        status: outcome,
        serverRevision: nextRevision,
        conflictPolicy,
        syncedAt: nowIso,
        retainedBackups,
        prunedBackupsCount,
      });
    } catch {
      res.status(502).json({ error: 'ارتباط با سرور Supabase برقرار نشد.' });
    }
  });

  return app;
}
