import React, { useState } from 'react';
import { AlertCircle, Download, Image as ImageIcon, Loader2, Wand2 } from 'lucide-react';

const IMAGE_SIZES = ['1K', '2K', '4K'] as const;
const ASPECT_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9', '21:9'] as const;

const STUDIO_PRESETS = [
  {
    label: 'سربرگ رسمی فاکتور شرکتی',
    ratio: '21:9' as const,
    prompt:
      'Minimalist executive corporate letterhead header design with architectural geometric lines in deep teal and slate gray on crisp white paper texture, ultra-clean luxury B2B branding aesthetic, no text',
  },
  {
    label: 'تصویر کاتالوگ تجهیزات سرور',
    ratio: '4:3' as const,
    prompt:
      'Studio product photography of a sleek enterprise rackmount network server hardware unit on a neutral light travertine desk, soft diffused side lighting, crisp metallic edges, commercial 8k catalog quality',
  },
  {
    label: 'جلد گزارش مالی سالانه هیئت‌مدیره',
    ratio: '3:4' as const,
    prompt:
      'Editorial architectural photography of a modern glass and limestone corporate headquarters facade at golden hour, balanced geometric composition for an annual financial report cover, no text',
  },
  {
    label: 'بنر معرفی خدمات سازمانی',
    ratio: '16:9' as const,
    prompt:
      'Wide-angle editorial view of a contemporary executive boardroom with warm oak table, soft natural daylight, glass walls, refined neutral architectural tones, 8k commercial photography',
  },
];

export const BrandStudioView: React.FC = () => {
  const [prompt, setPrompt] = useState(STUDIO_PRESETS[0].prompt);
  const [imageSize, setImageSize] = useState<(typeof IMAGE_SIZES)[number]>('2K');
  const [aspectRatio, setAspectRatio] = useState<(typeof ASPECT_RATIOS)[number]>('16:9');
  const [model, setModel] = useState<'gemini-3-pro-image-preview' | 'gemini-nano-banana-2.1'>(
    'gemini-3-pro-image-preview'
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [imgFallback, setImgFallback] = useState(false);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          imageSize,
          aspectRatio,
          model,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'تولید تصویر با خطا مواجه شد.');
        return;
      }
      setGeneratedUrl(data.imageUrl);
      setCaption(data.caption || '');
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'خطای ارتباط با سرور تولید تصویر رخ داد.'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          استودیو طراحی بصری اسناد، کاتالوگ کالا و هویت شرکتی
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          تولید تصاویر اختصاصی با وضوح ۱K، ۲K و ۴K و ۸ نسبت تصویر استاندارد برای سربرگ فاکتور رسمی، کاتالوگ انبار و گزارش‌های هیئت‌مدیره
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Controls Column */}
        <form
          onSubmit={handleGenerate}
          className="xl:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5"
        >
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              الگوهای آماده سازمانی
            </label>
            <div className="grid grid-cols-2 gap-2">
              {STUDIO_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setPrompt(preset.prompt);
                    setAspectRatio(preset.ratio);
                  }}
                  className="text-right p-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 hover:border-teal-600 dark:hover:border-teal-500 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              شرح تصویر مورد نظر (فارسی یا انگلیسی)
            </label>
            <textarea
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="شرح دقیق سربرگ فاکتور، محصول انبار یا جلد گزارش مالی..."
              className="w-full p-3 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white leading-6 focus:outline-none focus:ring-2 focus:ring-teal-600/30"
            />
          </div>

          {/* Model Selector */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              موتور تصویرسازی
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setModel('gemini-3-pro-image-preview')}
                className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                  model === 'gemini-3-pro-image-preview'
                    ? 'border-teal-700 bg-teal-50 dark:bg-teal-950/40 text-teal-900 dark:text-teal-200'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                کیفیت استودیویی Pro
              </button>
              <button
                type="button"
                onClick={() => setModel('gemini-nano-banana-2.1')}
                className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                  model === 'gemini-nano-banana-2.1'
                    ? 'border-teal-700 bg-teal-50 dark:bg-teal-950/40 text-teal-900 dark:text-teal-200'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                تولید سریع عمومی
              </button>
            </div>
          </div>

          {/* Resolution (1K / 2K / 4K) */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              وضوح خروجی تصویر (Resolution)
            </label>
            <div className="grid grid-cols-3 gap-2" dir="ltr">
              {IMAGE_SIZES.map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setImageSize(sz)}
                  className={`py-2 text-xs font-code font-semibold rounded-lg border transition-colors ${
                    imageSize === sz
                      ? 'border-teal-700 bg-teal-700 text-white'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {sz}
                </button>
              ))}
            </div>
          </div>

          {/* Aspect Ratio (1:1, 2:3, 3:2, 3:4, 4:3, 9:16, 16:9, 21:9) */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              نسبت ابعاد تصویر (Aspect Ratio)
            </label>
            <div className="grid grid-cols-4 gap-2" dir="ltr">
              {ASPECT_RATIOS.map((ar) => (
                <button
                  key={ar}
                  type="button"
                  onClick={() => setAspectRatio(ar)}
                  className={`py-2 text-xs font-code font-medium rounded-lg border transition-colors ${
                    aspectRatio === ar
                      ? 'border-teal-700 bg-teal-700 text-white'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {ar}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={isGenerating}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 rounded-lg transition-colors"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>در حال رندر تصویر {imageSize} ({aspectRatio})...</span>
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                <span>تولید تصویر سازمانی</span>
              </>
            )}
          </button>
        </form>

        {/* Preview Column */}
        <div className="xl:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div className="text-sm font-bold text-slate-900 dark:text-white">
              پیش‌نمایش خروجی استودیو
            </div>
            <div className="text-xs font-code text-slate-500">
              {imageSize} · {aspectRatio}
            </div>
          </div>

          {errorMsg && (
            <div className="p-4 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2.5 leading-6">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex-1 flex items-center justify-center bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden min-h-[340px]">
            {generatedUrl ? (
              <img
                src={generatedUrl}
                alt="تصویر تولیدشده برای اسناد سازمانی"
                referrerPolicy="no-referrer"
                className="max-h-[460px] w-full object-contain"
              />
            ) : !imgFallback ? (
              <div className="relative w-full h-full min-h-[340px]">
                <img
                  src="/src/assets/images/corporate_hq_banner_1795265734976.jpg"
                  alt="نمونه هویت بصری شرکتی هلو Apex"
                  referrerPolicy="no-referrer"
                  onError={() => setImgFallback(true)}
                  className="w-full h-full object-cover min-h-[340px]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent flex flex-col justify-end p-6 text-white">
                  <div className="text-sm font-bold">نمونه خروجی استودیوی طراحی اسناد شرکتی</div>
                  <div className="text-xs text-slate-200 mt-1">
                    وضوح (1K / 2K / 4K) و نسبت تصویر دلخواه را انتخاب کرده و تصویر اختصاصی خود را بسازید.
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500 space-y-2">
                <ImageIcon className="w-8 h-8 mx-auto text-slate-400" />
                <div className="text-xs">پیش‌نمایش تصویر تولیدشده در این بخش نمایش داده می‌شود.</div>
              </div>
            )}
          </div>

          {caption && (
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{caption}</p>
          )}

          {generatedUrl && (
            <div className="flex justify-end">
              <a
                href={generatedUrl}
                download={`holoo-apex-asset-${imageSize}-${aspectRatio.replace(':', 'x')}.png`}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-teal-700 hover:bg-slate-800 rounded-lg"
              >
                <Download className="w-4 h-4" />
                <span>دانلود فایل با کیفیت اصلی</span>
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
