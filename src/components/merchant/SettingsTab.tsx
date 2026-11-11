import React, { useState } from 'react';
import { Store } from '../../types';
import { ALGERIA_WILAYAS, formatDZD } from '../../data/wilayas';
import {
  Palette,
  Truck,
  Store as StoreIcon,
  Save,
  CheckCircle2,
  DollarSign,
  Globe,
  Sliders
} from 'lucide-react';

interface Props {
  store: Store;
  onSaveSettings: (updatedStore: Store) => void;
}

const BRAND_PALETTES = [
  { name: 'زمردي جزائري', hex: '#059669' },
  { name: 'أزرق ملكي', hex: '#2563eb' },
  { name: 'بنفسجي فاخر', hex: '#7c3aed' },
  { name: 'ذهبي عنبري', hex: '#d97706' },
  { name: 'وردي ياقوتي', hex: '#e11d48' },
  { name: 'أسود كلاسيكي', hex: '#0f172a' }
];

export const SettingsTab: React.FC<Props> = ({ store, onSaveSettings }) => {
  const [name, setName] = useState(store.name);
  const [description, setDescription] = useState(store.description || '');
  const [phone, setPhone] = useState(store.phone || '');
  const [brandColor, setBrandColor] = useState(store.brandColor || '#059669');
  const [freeShippingThreshold, setFreeShippingThreshold] = useState<number>(store.freeShippingThreshold || 10000);
  const [customFees, setCustomFees] = useState<Record<string, number>>(store.customWilayaFees || {});
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleWilayaFeeChange = (wilayaId: string, fee: number) => {
    setCustomFees(prev => ({
      ...prev,
      [wilayaId]: fee
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const updated: Store = {
      ...store,
      name: name.trim(),
      description: description.trim(),
      phone: phone.trim(),
      brandColor,
      freeShippingThreshold: Number(freeShippingThreshold),
      customWilayaFees: customFees,
      updatedAt: new Date().toISOString()
    };

    onSaveSettings(updated);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          إعدادات وهوية المتجر
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          تخصيص اسم المتجر، ألوان الهوية، وتحديد سياسة التوصيل المجاني للزبائن
        </p>
      </div>

      {savedSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>تم حفظ جميع إعدادات المتجر وهوية العلامة بنجاح!</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* General Store Info */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <StoreIcon className="w-4 h-4 text-emerald-600" />
            <span>البيانات الأساسية للمتجر</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                اسم المتجر
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                رقم هاتف خدمة الزبائن
              </label>
              <input
                type="text"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="0550XXXXXX"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              الوصف التعريفي بالمتجر (يظهر في الترويسة وصفحة المتجر)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">النطاق الفرعي لمتجرك:</span>
            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
              {store.subdomain}.dokani.dz
            </span>
          </div>
        </div>

        {/* Brand Color Settings */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Palette className="w-4 h-4 text-emerald-600" />
            <span>لون الهوية البصرية (Brand Color)</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            سيطبق هذا اللون على أزرار الشراء، العناوين وشريط التنبيهات في واجهة متجرك للزبائن
          </p>

          <div className="flex flex-wrap items-center gap-3">
            {BRAND_PALETTES.map(p => (
              <button
                type="button"
                key={p.hex}
                onClick={() => setBrandColor(p.hex)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
                  brandColor === p.hex
                    ? 'border-slate-900 dark:border-white ring-2 ring-emerald-500/30 font-bold'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-400'
                }`}
              >
                <div
                  className="w-4 h-4 rounded-full shadow-inner"
                  style={{ backgroundColor: p.hex }}
                />
                <span>{p.name}</span>
              </button>
            ))}

            {/* Custom hex input */}
            <div className="flex items-center gap-2 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1 bg-white dark:bg-slate-800">
              <input
                type="color"
                value={brandColor}
                onChange={e => setBrandColor(e.target.value)}
                className="w-6 h-6 border-0 rounded cursor-pointer p-0 bg-transparent"
              />
              <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
                {brandColor}
              </span>
            </div>
          </div>
        </div>

        {/* Shipping & Threshold Settings */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Truck className="w-4 h-4 text-emerald-600" />
            <span>إعدادات التوصيل والشحن المجاني</span>
          </h3>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              حد التوصيل المجاني (Free-shipping threshold) بالدينار الجزائري:
            </label>
            <div className="flex items-center max-w-sm">
              <input
                type="number"
                min="0"
                step="500"
                value={freeShippingThreshold}
                onChange={e => setFreeShippingThreshold(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-mono font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
              <span className="mr-2 text-xs font-bold text-slate-500">د.ج</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              عندما تزيد قيمة سلة المشتريات عن هذا المبلغ، يصبح التوصيل مجانياً تلقائياً لجميع الولايات (0 د.ج).
            </p>
          </div>

          {/* Wilaya Fees Quick Override */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
              تخصيص أسعار التوصيل لأهم الولايات:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {ALGERIA_WILAYAS.slice(0, 6).map(w => {
                const currentFee = customFees[w.id] !== undefined ? customFees[w.id] : w.standardDeliveryFee;
                return (
                  <div
                    key={w.id}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between text-xs"
                  >
                    <div>
                      <strong className="text-slate-900 dark:text-white font-bold block">{w.nameAr}</strong>
                      <span className="text-[10px] text-slate-400">القياسي: {formatDZD(w.standardDeliveryFee)}</span>
                    </div>
                    <div className="flex items-center gap-1 w-24">
                      <input
                        type="number"
                        min="0"
                        step="50"
                        value={currentFee}
                        onChange={e => handleWilayaFeeChange(w.id, Number(e.target.value))}
                        className="w-full p-1.5 text-center font-mono font-bold rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs"
                      />
                      <span className="text-[10px] text-slate-400">د.ج</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-emerald-600/20 flex items-center gap-2 transition-all"
          >
            <Save className="w-4 h-4" />
            <span>حفظ جميع الإعدادات</span>
          </button>
        </div>
      </form>
    </div>
  );
};
