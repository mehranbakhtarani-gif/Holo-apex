import express, { Request, Response } from 'express';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const ALLOWED_SIZES = new Set(['1K', '2K', '4K']);
const ALLOWED_ASPECT_RATIOS = new Set([
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '9:16',
  '16:9',
  '21:9',
]);
const ALLOWED_MODELS = new Set([
  'gemini-3-pro-image-preview',
  'gemini-nano-banana-2.1',
  'gemini-3.1-flash-lite-image',
]);

function createGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // CORS is restricted to the published frontend origin; no wildcard credentials.
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

  app.use(express.json({ limit: '10mb' }));
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
      ) {        res.json({
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
      const {
        prompt,
        imageSize = '1K',
        aspectRatio = '16:9',
        model = 'gemini-3-pro-image-preview',
      } = req.body ?? {};

      if (typeof prompt !== 'string' || prompt.trim().length < 4 || prompt.trim().length > 1500) {
        res.status(400).json({
          error: 'شرح تصویر (Prompt) باید بین ۴ تا ۱۵۰۰ کاراکتر باشد.',
        });
        return;
      }

      const safeSize = ALLOWED_SIZES.has(imageSize) ? imageSize : '1K';
      const safeRatio = ALLOWED_ASPECT_RATIOS.has(aspectRatio) ? aspectRatio : '16:9';
      const safeModel = ALLOWED_MODELS.has(model) ? model : 'gemini-3-pro-image-preview';

      const ai = createGeminiClient();
      if (!ai) {
        res.status(503).json({
          error:
            'کلید API جمنای تنظیم نشده است. لطفاً از بخش Settings > Secrets در محیط اجرا، کلید API معتبر را متصل کنید.',
          code: 'MISSING_API_KEY',
        });
        return;
      }

      const response = await ai.models.generateContent({
        model: safeModel,
        contents: {
          parts: [{ text: prompt.trim() }],
        },
        config: {
          imageConfig: {
            aspectRatio: safeRatio,
            imageSize: safeSize,
          },
        },
      });

      const parts = response.candidates?.[0]?.content?.parts ?? [];
      let imageDataUrl: string | null = null;
      let textCaption = '';

      for (const part of parts) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType ?? 'image/png';
          imageDataUrl = `data:${mime};base64,${part.inlineData.data}`;
        } else if (part.text) {
          textCaption += part.text;
        }
      }

      if (!imageDataUrl) {
        res.status(502).json({
          error: 'مدل تصویری خروجی گرافیکی تولید نکرد. لطفاً شرح تصویر را دقیق‌تر وارد کرده و دوباره تلاش کنید.',
          caption: textCaption,
        });
        return;
      }

      res.json({
        imageUrl: imageDataUrl,
        caption: textCaption.trim(),
        model: safeModel,
        imageSize: safeSize,
        aspectRatio: safeRatio,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      let status = 500;
      let userMessage = `خطا در تولید تصویر: ${message}`;

      if (message.includes('403') || message.includes('PERMISSION_DENIED') || message.includes('API_KEY_INVALID')) {
        status = 403;
        userMessage =
          'دسترسی به مدل تصویرسازی رد شد (403/400). لطفاً کلید API دارای صورت‌حساب فعال را در بخش Settings > Secrets بررسی و انتخاب کنید.';
      } else if (message.includes('429') || message.includes('RESOURCE_EXHAUSTED')) {
        status = 429;
        userMessage =
          'سهمیه استفاده از مدل تصویرسازی با کیفیت بالا به پایان رسیده است (429). لطفاً در بخش Settings > Secrets یک کلید API دارای پلن پرداختی متصل کنید.';
      } else if (message.includes('404') || message.includes('NOT_FOUND')) {
        status = 404;
        userMessage =
          'مدل انتخاب‌شده در دسترس نیست. لطفاً مدل gemini-nano-banana-2.1 یا gemini-3-pro-image-preview را بررسی کنید.';
      }

      res.status(status).json({ error: userMessage });
    }
  });

  // ---------------- HOLOO APEX 9.6 GEMINI AI FINANCIAL INTELLIGENCE ----------------
  const SMART_MODEL = 'gemini-4-hydrogen';

  const handleAiError = (res: Response, err: unknown, fallbackMsg: string) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[AI Route Error]', fallbackMsg, message);
    if (message.includes('429') || message.includes('RESOURCE_EXHAUSTED')) {
      res.status(429).json({
        error: 'سهمیه موقت سرویس هوش مصنوعی تکمیل شده است (429). چند لحظه بعد دوباره تلاش کنید.',
      });
      return;
    }
    if (message.includes('403') || message.includes('API_KEY_INVALID')) {
      res.status(403).json({
        error: 'کلید API هوش مصنوعی معتبر نیست یا دسترسی ندارد. لطفاً کلید GEMINI_API_KEY را بررسی کنید.',
      });
      return;
    }
    res.status(500).json({ error: `${fallbackMsg}. لطفاً دوباره تلاش کنید.` });
  };

  // 1. Natural-Language Persian Transaction -> Balanced Double-Entry Voucher
  app.post('/api/ai/parse-voucher', async (req: Request, res: Response) => {
    try {
      const { text, currencyUnit = 'IRT', accounts = [], parties = [] } = req.body ?? {};
      if (typeof text !== 'string' || text.trim().length < 4 || text.trim().length > 1500) {
        res.status(400).json({ error: 'لطفاً شرح فارسی رویداد مالی را حداقل با ۴ کاراکتر وارد کنید.' });
        return;
      }

      const ai = createGeminiClient();
      if (!ai) {
        res.status(503).json({
          error: 'کلید GEMINI_API_KEY تنظیم نشده است. پس از تنظیم کلید، قابلیت تبدیل هوشمند متن به سند فعال می‌شود.',
        });
        return;
      }

      const compactAccounts = Array.isArray(accounts)
        ? accounts.slice(0, 120).map((a: { code?: string; title?: string; category?: string }) => `${a.code}: ${a.title} (${a.category})`).join('\n')
        : '';
      const compactParties = Array.isArray(parties)
        ? parties.slice(0, 80).map((p: { id?: string; code?: string; name?: string }) => `${p.id} | ${p.code}: ${p.name}`).join('\n')
        : '';

      const prompt = `تو یک حسابدار ارشد شرکتی متخصص نرم‌افزار هلو اپکس ۹.۶ و استانداردهای حسابداری ایران هستی.
متن فارسی زیر را به یک سند حسابداری دوبل کاملاً تراز (جمع بدهکار = جمع بستانکار) تبدیل کن.
قوانین حیاتی:
1. تمام مبالغ خروجی (debitIrr و creditIrr) باید به **ریال** (عدد صحیح مثبت) باشند. اگر کاربر مبلغ را به «تومان» یا «میلیون تومان» گفت حتماً در ۱۰ ضرب کن تا به ریال تبدیل شود (واحد نمایش فعلی کاربر: ${currencyUnit === 'IRT' ? 'تومان' : 'ریال'}).
2. فقط از کدهای حساب معین موجود در لیست زیر استفاده کن و مناسب‌ترین کد را انتخاب کن.
3. اگر نام طرف‌حساب در متن آمده و در لیست زیر هست، partyId دقیق آن را بگذار؛ در غیر این صورت رشته خالی "" بگذار.
4. در هر ردیف فقط یکی از debitIrr یا creditIrr بزرگ‌تر از صفر باشد و دیگری ۰ باشد.
5. مجموع debitIrr همه ردیف‌ها باید دقیقاً برابر مجموع creditIrr باشد.

کدینگ حساب‌های شرکت:
${compactAccounts}

لیست طرف‌حساب‌ها (id | code: name):
${compactParties}

متن رویداد مالی کاربر:
"""${text.trim()}"""`;

      const response = await ai.models.generateContent({
        model: SMART_MODEL,
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              description: { type: Type.STRING, description: 'شرح رسمی کلی سند به فارسی' },
              voucherType: {
                type: Type.STRING,
                description: 'یکی از: general, sales, purchase, treasury, payroll, depreciation, opening',
              },
              reasoning: { type: Type.STRING, description: 'توضیح کوتاه ۱ جمله‌ای درباره نحوه سندزدن' },
              lines: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    accountCode: { type: Type.STRING },
                    partyId: { type: Type.STRING },
                    description: { type: Type.STRING },
                    debitIrr: { type: Type.INTEGER },
                    creditIrr: { type: Type.INTEGER },
                  },
                  required: ['accountCode', 'description', 'debitIrr', 'creditIrr'],
                },
              },
            },
            required: ['description', 'voucherType', 'lines'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      const rawLines = Array.isArray(parsed.lines) ? parsed.lines : [];
      if (rawLines.length < 2) {
        res.status(422).json({ error: 'امکان استخراج حداقل ۲ آرتیکل معتبر از متن وجود نداشت. لطفاً مبلغ و شرح را دقیق‌تر بنویسید.' });
        return;
      }

      const validAccountCodes = new Set(
        Array.isArray(accounts) ? accounts.map((a: { code?: string }) => String(a.code || '')) : []
      );
      const fallbackCode = accounts[0]?.code || '10101';

      const sanitized = rawLines.map((l: Record<string, unknown>) => {
        const code = String(l.accountCode || '').trim();
        const d = Math.max(0, Math.round(Number(l.debitIrr) || 0));
        const c = Math.max(0, Math.round(Number(l.creditIrr) || 0));
        return {
          accountCode: validAccountCodes.size === 0 || validAccountCodes.has(code) ? code : fallbackCode,
          partyId: typeof l.partyId === 'string' && l.partyId.trim() ? l.partyId.trim() : undefined,
          description: String(l.description || parsed.description || '').trim(),
          debitIrr: d > 0 && c > 0 ? (d >= c ? d : 0) : d,
          creditIrr: d > 0 && c > 0 ? (c > d ? c : 0) : c,
        };
      });

      const sumD = sanitized.reduce((s: number, l: { debitIrr: number }) => s + l.debitIrr, 0);
      const sumC = sanitized.reduce((s: number, l: { creditIrr: number }) => s + l.creditIrr, 0);
      if (sumD !== sumC && sanitized.length >= 2) {
        const last = sanitized[sanitized.length - 1];
        if (sumD > sumC && last.creditIrr > 0) {
          last.creditIrr += sumD - sumC;
        } else if (sumC > sumD && last.debitIrr > 0) {
          last.debitIrr += sumC - sumD;
        }
      }

      res.json({
        description: String(parsed.description || text.trim()),
        voucherType: String(parsed.voucherType || 'general'),
        reasoning: String(parsed.reasoning || ''),
        lines: sanitized,
      });
    } catch (err: unknown) {
      handleAiError(res, err, 'خطا در تبدیل هوشمند متن به سند');
    }
  });

  // 2. Multimodal AI Invoice / Proforma Reader (Text or Photo -> Structured Invoice Rows)
  app.post('/api/ai/parse-invoice', async (req: Request, res: Response) => {
    try {
      const { text = '', imageDataUrl = '', invoiceType = 'sale', products = [], parties = [] } = req.body ?? {};
      const hasText = typeof text === 'string' && text.trim().length >= 3 && text.trim().length <= 4000;
      const hasImage =
        typeof imageDataUrl === 'string' &&
        imageDataUrl.startsWith('data:image/') &&
        imageDataUrl.length <= MAX_BASE64_IMAGE_CHARS;

      if (!hasText && !hasImage) {
        res.status(400).json({ error: 'لطفاً متن معتبر سفارش/فاکتور (حداکثر ۴۰۰۰ کاراکتر) وارد کنید یا تصویر PNG/JPG/WEBP بارگذاری نمایید.' });
        return;
      }

      const ai = createGeminiClient();
      if (!ai) {
        res.status(503).json({
          error: 'کلید GEMINI_API_KEY تنظیم نشده است. پس از تنظیم کلید، خواندن هوشمند فاکتور فعال می‌شود.',
        });
        return;
      }

      const compactProducts = Array.isArray(products)
        ? products.slice(0, 120).map((p: { id?: string; sku?: string; name?: string; sellPrice?: number; buyPrice?: number; kgPerCarton?: number }) =>
            `${p.id} | ${p.sku} | ${p.name} | فروش:${p.sellPrice} | خرید:${p.buyPrice} | وزن‌کارتن:${p.kgPerCarton ?? 25}`
          ).join('\n')
        : '';
      const compactParties = Array.isArray(parties)
        ? parties.slice(0, 80).map((p: { id?: string; code?: string; name?: string }) => `${p.id} | ${p.code}: ${p.name}`).join('\n')
        : '';
      const instruction = `تو دستیار هوشمند صدور فاکتور هلو اپکس ۹.۶ هستی. از متن یا تصویر فاکتور/سفارش ارسالی، اقلام کالا، طرف‌حساب، وزن/کارتن و نرخ هر کیلوگرم را استخراج کن.
قوانین:
1. قیمت‌های خروجی (unitPriceIrr و discountIrr) باید به **ریال** باشند (اگر تومان بود در ۱۰ ضرب کن).
2. بهترین productId را از لیست کالاهای انبار زیر پیدا کن و تطبیق بده؛ اگر دقیقاً نبود نزدیک‌ترین کالا را انتخاب کن و نام خوانده‌شده را در productNameHint بنویس.
3. اگر تعداد کارتن داده شده ولی وزن داده نشده، وزن را برابر تعداد کارتن ضربدر وزن‌کارتن کالا حساب کن.
4. نوع فاکتور فعلی کاربر: ${String(invoiceType).slice(0, 32)}.

لیست کالاهای انبار (id | sku | name | sellPrice | buyPrice | kgPerCarton):
${compactProducts}

لیست طرف‌حساب‌ها (id | code: name):
${compactParties}${hasText ? `\nمتن سفارش/فاکتور:\n"""${text.trim()}"""` : ''}`;

      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
        { text: instruction },
      ];

      if (hasImage) {
        const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);
        if (!match || !ALLOWED_IMAGE_MIMES.has(match[1].toLowerCase())) {
          res.status(400).json({ error: 'فقط فرمت‌های تصویری PNG، JPG و WEBP مجاز هستند.' });
          return;
        }
        parts.push({
          inlineData: {
            mimeType: match[1].toLowerCase(),
            data: match[2],
          },
        });
      }

      const response = await ai.models.generateContent({
        model: SMART_MODEL,
        contents: { parts },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              partyId: { type: Type.STRING },
              partyNameHint: { type: Type.STRING },
              notes: { type: Type.STRING },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    productId: { type: Type.STRING },
                    productNameHint: { type: Type.STRING },
                    cartonCount: { type: Type.NUMBER },
                    quantityKg: { type: Type.NUMBER },
                    unitPriceIrr: { type: Type.INTEGER },
                    discountIrr: { type: Type.INTEGER },
                  },
                  required: ['productId', 'quantityKg', 'unitPriceIrr'],
                },
              },
            },
            required: ['items'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      res.json({
        partyId: typeof parsed.partyId === 'string' ? parsed.partyId : '',
        partyNameHint: typeof parsed.partyNameHint === 'string' ? parsed.partyNameHint : '',
        notes: typeof parsed.notes === 'string' ? parsed.notes : '',
        items: Array.isArray(parsed.items) ? parsed.items : [],
      });
    } catch (err: unknown) {
      handleAiError(res, err, 'خطا در تحلیل هوشمند فاکتور');
    }
  });

  // 3. Holoo Apex 9.6 Smart Financial Copilot Chat
  app.post('/api/ai/copilot', async (req: Request, res: Response) => {
    try {
      const { message, history = [], snapshot = {} } = req.body ?? {};
      if (typeof message !== 'string' || message.trim().length < 2 || message.trim().length > 2000) {
        res.status(400).json({ error: 'لطفاً سؤال خود را بین ۲ تا ۲۰۰۰ کاراکتر وارد کنید.' });
        return;
      }

      const ai = createGeminiClient();
      if (!ai) {
        res.status(503).json({
          error: 'کلید GEMINI_API_KEY تنظیم نشده است. لطفاً کلید API را در تنظیمات محیط اجرا وارد کنید.',
        });
        return;
      }

      const historyText = Array.isArray(history)
        ? history
            .slice(-6)
            .map((h: { role?: string; text?: string }) => `${h.role === 'user' ? 'کاربر' : 'مشاور'}: ${String(h.text || '').slice(0, 600)}`)
            .join('\n')
        : '';

      const safeSnapshotStr = JSON.stringify(snapshot ?? {}).slice(0, 35_000);

      const prompt = `تو «مشاور هوشمند مالی و مالیاتی هلو اپکس ۹.۶» برای مدیرعامل و مدیر مالی این شرکت بازرگانی نخ هستی.
پاسخ تو باید:
- کاملاً مستند به اعداد واقعی داده‌شده در JSON زیر باشد (هیچ عددی از خودت نساز).
- کوتاه، دقیق، اجرایی، به فارسی روان و حرفه‌ای با بولت‌پوینت‌های تمیز باشد.
- در صورت نیاز، حداکثر ۳ دکمه اقدام مستقیم (suggestedActions) به ماژول‌های واقعی برنامه پیشنهاد بده.
ماژول‌های مجاز: dashboard, invoices, vouchers, audit, accounts, parties, inventory, treasury, currencies, commercial, corporate, reports, settings.

اطلاعات زنده دفاتر مالی شرکت (JSON):
${safeSnapshotStr}

${historyText ? `سابقه گفتگوی اخیر:\n${historyText}\n` : ''}
سؤال فعلی کاربر:
${message.trim()}`;

      const response = await ai.models.generateContent({
        model: SMART_MODEL,
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: { type: Type.STRING, description: 'پاسخ دقیق تحلیلی به زبان فارسی' },
              suggestedActions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    label: { type: Type.STRING },
                    module: { type: Type.STRING },
                    intent: { type: Type.STRING },
                  },
                  required: ['label', 'module'],
                },
              },
            },
            required: ['reply'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      res.json({
        reply: String(parsed.reply || 'پاسخی تولید نشد.'),
        suggestedActions: Array.isArray(parsed.suggestedActions)
          ? parsed.suggestedActions.slice(0, 3)
          : [],
      });
    } catch (err: unknown) {
      handleAiError(res, err, 'خطا در پاسخ‌گویی مشاور هوشمند مالی');
    }
  });

  // 4. Multimodal AI OCR Scanner for Sayadi Cheques, Bank Transfer Receipts & Expense Bills
  app.post('/api/ai/scan-document', async (req: Request, res: Response) => {
    try {
      const { imageDataUrl = '', hintKind = 'auto', parties = [], accounts = [] } = req.body ?? {};
      if (
        typeof imageDataUrl !== 'string' ||
        !imageDataUrl.startsWith('data:image/') ||
        imageDataUrl.length > MAX_BASE64_IMAGE_CHARS
      ) {
        res.status(400).json({ error: 'لطفاً تصویر واضح و کم‌حجم (PNG/JPG/WEBP) از چک یا رسید بارگذاری کنید.' });
        return;
      }

      const ai = createGeminiClient();
      if (!ai) {
        res.status(503).json({
          error: 'کلید GEMINI_API_KEY تنظیم نشده است. پس از تنظیم کلید، اسکن هوشمند اسناد فعال می‌شود.',
        });
        return;
      }

      const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);
      if (!match || !ALLOWED_IMAGE_MIMES.has(match[1].toLowerCase())) {
        res.status(400).json({ error: 'فقط فرمت‌های تصویری PNG، JPG و WEBP برای اسکن مجاز هستند.' });
        return;
      }

      const compactParties = Array.isArray(parties)
        ? parties.slice(0, 80).map((p: { id?: string; name?: string }) => `${p.id} | ${p.name}`).join('\n')
        : '';
      const compactAccounts = Array.isArray(accounts)
        ? accounts
            .filter((a: { code?: string }) => String(a.code || '').startsWith('8') || String(a.code || '').startsWith('102'))
            .slice(0, 40)
            .map((a: { code?: string; title?: string }) => `${a.code}: ${a.title}`)
            .join('\n')
        : '';

      const prompt = `تو یک سیستم دقیق OCR حسابداری ایرانی برای نرم‌افزار هلو اپکس ۹.۶ هستی.
این تصویر می‌تواند برگه چک صیادی (بنفش/صیاد)، فیش واریزی/کارت‌به‌کارت/پایا/ساتنا بانکی، یا رسید و قبض هزینه تنخواه باشد (نوع پیشنهادی کاربر: ${hintKind}).
تمام اطلاعات کلیدی را دقیق استخراج کن:
1. مبلغ (amountIrr) حتماً به **ریال** (عدد صحیح مثبت) برگردانده شود. اگر روی رسید به تومان بود در ۱۰ ضرب کن.
2. تاریخ‌ها (issueDate و dueDate) به فرمت شمسی YYYY/MM/DD با ارقام انگلیسی باشند (مثلاً 1405/03/25).
3. برای چک صیادی، شناسه ۱۶ رقمی صیاد (sayadiId) و شماره سریال چک (serial) و نام بانک (bankName) و شعبه (branch) را دقیق بخوان.
4. اگر نام شخص/شرکت با لیست طرف‌حساب‌های زیر تطابق دارد، partyId دقیق آن را برگردان.
5. برای رسید هزینه تنخواه، نزدیک‌ترین کد هزینه (suggestedAccountCode) از کدینگ زیر را انتخاب کن.

طرف‌حساب‌ها:
${compactParties}

کدهای هزینه/بانک:
${compactAccounts}`;

      const response = await ai.models.generateContent({
        model: SMART_MODEL,
        contents: {
          parts: [
            { text: prompt },
            { inlineData: { mimeType: match[1], data: match[2] } },
          ],
        },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              documentKind: {
                type: Type.STRING,
                description: 'یکی از: cheque, bank_receipt, expense_bill',
              },
              sayadiId: { type: Type.STRING },
              serial: { type: Type.STRING },
              bankName: { type: Type.STRING },
              branch: { type: Type.STRING },
              partyId: { type: Type.STRING },
              partyNameHint: { type: Type.STRING },
              amountIrr: { type: Type.INTEGER },
              issueDate: { type: Type.STRING },
              dueDate: { type: Type.STRING },
              trackingNumber: { type: Type.STRING },
              description: { type: Type.STRING },
              suggestedAccountCode: { type: Type.STRING },
            },
            required: ['documentKind', 'amountIrr', 'description'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      res.json({
        documentKind: String(parsed.documentKind || 'bank_receipt'),
        sayadiId: String(parsed.sayadiId || '').replace(/[^0-9]/g, '').slice(0, 16),
        serial: String(parsed.serial || '').slice(0, 48),
        bankName: String(parsed.bankName || '').slice(0, 100),
        branch: String(parsed.branch || '').slice(0, 100),
        partyId: String(parsed.partyId || ''),
        partyNameHint: String(parsed.partyNameHint || ''),
        amountIrr: Math.max(0, Math.round(Number(parsed.amountIrr) || 0)),
        issueDate: String(parsed.issueDate || ''),
        dueDate: String(parsed.dueDate || ''),
        trackingNumber: String(parsed.trackingNumber || ''),
        description: String(parsed.description || ''),
        suggestedAccountCode: String(parsed.suggestedAccountCode || '80105'),
      });
    } catch (err: unknown) {
      handleAiError(res, err, 'خطا در اسکن هوشمند تصویر چک/رسید');
    }
  });

  // ---------------- DUAL-CLOUD SUPABASE POSTGRESQL SYNC PROXY ----------------
  // Keeps SUPABASE_SERVICE_ROLE_KEY strictly on the server and verifies Firebase ID Tokens
  // on every protected sync/pull request before accessing owner-scoped PostgreSQL rows.
  // Supplied as a non-secret Worker variable; Node development loads it in server.node.ts.
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

    const verified = await verifyFirebaseBearerToken(req);
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

    const verified = await verifyFirebaseBearerToken(req);
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
      const delResp = await fetch(delUrl, {        method: 'DELETE',
        headers: buildSupabaseHeaders(cfg, { Prefer: 'return=minimal' }),
        signal: AbortSignal.timeout(7000),      });
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

    const verified = await verifyFirebaseBearerToken(req);
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

    const verified = await verifyFirebaseBearerToken(req);
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
          body: JSON.stringify(upsertPayload),          signal: AbortSignal.timeout(10000),
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
