import React, { useState } from 'react';
import { Store, WilayaRate } from '../../types';
import { ALGERIA_WILAYAS } from '../../data/wilayas';
import {
  Palette,
  Truck,
  Store as StoreIcon,
  Save,
  CheckCircle2,
  Share2,
  Megaphone
} from 'lucide-react';

interface Props {
  store: Store;
  onSaveSettings: (updatedStore: Store) => void;
}

const BRAND_PALETTES = [
  { name: 'الخشبي الفاخر', hex: '#754b2d' },
  { name: 'زمردي جزائري', hex: '#059669' },
  { name: 'أزرق ملكي', hex: '#1d4ed8' },
  { name: 'ذهبي عنبري', hex: '#d97706' },
  { name: 'قرمزي خاطف', hex: '#be123c' },
  { name: 'أسود كلاسيكي', hex: '#0f172a' }
];

export const SettingsTab: React.FC<Props> = ({ store, onSaveSettings }) => {
  const [name, setName] = useState(store.name);
  const [description, setDescription] = useState(store.description || '');
  const [announcementText, setAnnouncementText] = useState(
    store.announcementText || 'توصيل سريع لكافة الـ 58 ولاية | الدفع بعد المعاينة والإستلام'
  );
  const [phone, setPhone] = useState(store.phone || '');
  const [defaultWhatsapp, setDefaultWhatsapp] = useState(store.defaultWhatsapp || '');
  const [defaultPixelId, setDefaultPixelId] = useState(store.defaultPixelId || '');
  const [googleSheetWebhook, setGoogleSheetWebhook] = useState(store.googleSheetWebhook || '');
  const [brandColor, setBrandColor] = useState(store.brandColor || '#754b2d');
  const [freeShippingThreshold, setFreeShippingThreshold] = useState<number>(
    store.freeShippingThreshold || 0
  );
  const [customRates, setCustomRates] = useState<Record<string, WilayaRate>>(
    store.customWilayaRates || {}
  );
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleWilayaRateChange = (wilayaId: string, field: 'home' | 'stop', fee: number) => {
    const base = ALGERIA_WILAYAS.find(w => w.id === wilayaId);
    setCustomRates(prev => {
      const existing = prev[wilayaId] || {
        home: store.customWilayaFees?.[wilayaId] ?? base?.homeFee ?? 600,
        stop: base?.stopFee ?? 400
      };
      return {
        ...prev,
        [wilayaId]: {
          ...existing,
          [field]: Math.max(0, fee)
        }
      };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: Store = {
      ...store,
      name: name.trim(),
      description: description.trim(),
      announcementText: announcementText.trim(),
      phone: phone.trim(),
      defaultWhatsapp: defaultWhatsapp.trim(),
      defaultPixelId: defaultPixelId.trim(),
      googleSheetWebhook: googleSheetWebhook.trim(),
      brandColor,
      freeShippingThreshold: Number(freeShippingThreshold) || 0,
      customWilayaRates: customRates,
      updatedAt: new Date().toISOString()
    };
    onSaveSettings(updated);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          إعدادات المتجر والتكاملات وأسعار التوصيل
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          اضبط هوية متجرك، الإعدادات الافتراضية لواتساب وميتا بيكسل و Google Sheets، وأسعار التوصيل للمنزل ومكتب الشحن لكل ولاية
        </p>
      </div>

      {savedSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>تم حفظ جميع إعدادات المتجر بنجاح!</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Store Brand & Announcement */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <StoreIcon className="w-4 h-4 text-emerald-600" />
            <span>البيانات الأساسية والشريط العلوي</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold mb-1">اسم المتجر</label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold mb-1">هاتف المتجر الرئيسي</label>
              <input
                type="text"
                dir="ltr"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="0798353165"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold mb-1 flex items-center gap-1.5">
              <Megaphone className="w-3.5 h-3.5 text-emerald-600" />
              <span>نص الشريط الإعلاني العلوي (يظهر أعلى صفحات الهبوط)</span>
            </label>
            <input
              type="text"
              value={announcementText}
              onChange={e => setAnnouncementText(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-bold mb-1">الوصف المختصر للمتجر</label>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
            />
          </div>
        </div>

        {/* Default Integrations */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Share2 className="w-4 h-4 text-emerald-600" />
            <span>الإعدادات الافتراضية للتكاملات (WhatsApp · Meta Pixel · Google Sheets)</span>
          </h3>
          <p className="text-[11px] text-slate-500">
            تُطبق تلقائياً على أي صفحة هبوط لا تحدد لنفسها قيماً خاصة.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold mb-1">رقم واتساب الافتراضي (مع رمز الدولة)</label>
              <input
                type="text"
                dir="ltr"
                value={defaultWhatsapp}
                onChange={e => setDefaultWhatsapp(e.target.value)}
                placeholder="213798353165"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold mb-1">معرف Meta / Facebook Pixel الافتراضي</label>
              <input
                type="text"
                dir="ltr"
                value={defaultPixelId}
                onChange={e => setDefaultPixelId(e.target.value)}
                placeholder="1130382356394829"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold mb-1">رابط Google Sheets Webhook (اختياري)</label>
            <input
              type="url"
              dir="ltr"
              value={googleSheetWebhook}
              onChange={e => setGoogleSheetWebhook(e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
            />
          </div>
        </div>

        {/* Storefront Catalog Brand Color */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Palette className="w-4 h-4 text-emerald-600" />
            <span>لون الهوية للواجهة الرئيسية للمتجر</span>
          </h3>
          <div className="flex flex-wrap items-center gap-3">
            {BRAND_PALETTES.map(p => (
              <button
                type="button"
                key={p.hex}
                onClick={() => setBrandColor(p.hex)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer ${
                  brandColor === p.hex
                    ? 'border-slate-900 dark:border-white ring-2 ring-emerald-500/30 font-bold'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: p.hex }} />
                <span>{p.name}</span>
              </button>
            ))}
            <div className="flex items-center gap-2 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1">
              <input
                type="color"
                value={brandColor}
                onChange={e => setBrandColor(e.target.value)}
                className="w-6 h-6 border-0 rounded cursor-pointer p-0 bg-transparent"
              />
              <span className="font-mono text-xs">{brandColor}</span>
            </div>
          </div>
        </div>

        {/* Dual Wilaya Delivery Fees (Home + Stop Desk) */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Truck className="w-4 h-4 text-emerald-600" />
            <span>أسعار التوصيل للمنزل ومكتب الشحن (58 ولاية)</span>
          </h3>

          <div className="max-w-sm">
            <label className="block text-xs font-bold mb-1">
              حد التوصيل المجاني بالدينار (0 = معطّل):
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="500"
                value={freeShippingThreshold}
                onChange={e => setFreeShippingThreshold(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-bold"
              />
              <span className="text-xs font-bold text-slate-500">دج</span>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto pl-1">
              {ALGERIA_WILAYAS.map(w => {
                const homeFee =
                  customRates[w.id]?.home ??
                  store.customWilayaFees?.[w.id] ??
                  w.homeFee;
                const stopFee = customRates[w.id]?.stop ?? w.stopFee;
                return (
                  <div
                    key={w.id}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <strong className="font-bold block truncate">
                        {w.code} - {w.nameAr}
                      </strong>
                      <span className="text-[10px] text-slate-400">{w.communes.length} بلدية</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="w-20">
                        <span className="block text-[10px] text-slate-500 mb-0.5 text-center">للمنزل</span>
                        <input
                          type="number"
                          min="0"
                          step="50"
                          value={homeFee}
                          onChange={e => handleWilayaRateChange(w.id, 'home', Number(e.target.value) || 0)}
                          className="w-full p-1.5 text-center font-mono font-bold rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs"
                        />
                      </div>
                      <div className="w-20">
                        <span className="block text-[10px] text-slate-500 mb-0.5 text-center">Stop Desk</span>
                        <input
                          type="number"
                          min="0"
                          step="50"
                          value={stopFee}
                          onChange={e => handleWilayaRateChange(w.id, 'stop', Number(e.target.value) || 0)}
                          className="w-full p-1.5 text-center font-mono font-bold rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md flex items-center gap-2 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>حفظ جميع الإعدادات</span>
          </button>
        </div>
      </form>
    </div>
  );
};
