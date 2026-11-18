import React, { useState } from 'react';
import { LandingPage, LandingPageOffer, LandingPageTheme } from '../../types';
import { LANDING_THEME_PRESETS, formatDZD } from '../../data/wilayas';
import { DEFAULT_ASSETS } from '../../data/defaultAssets';
import { ConfirmDialog } from '../common/ConfirmDialog';
import {
  Plus,
  Edit3,
  Trash2,
  ExternalLink,
  Palette,
  Layers,
  Image as ImageIcon,
  Share2,
  CheckCircle2,
  Copy,
  ArrowRight,
  Eye,
  Upload,
  Star,
  Flame,
  Save,
  Globe
} from 'lucide-react';

interface Props {
  storeId: string;
  landingPages: LandingPage[];
  onSaveLandingPage: (page: LandingPage) => Promise<boolean>;
  onDeleteLandingPage: (pageId: string) => Promise<void>;
  onPreviewPage: (slug: string) => void;
}

function createEmptyPage(storeId: string): LandingPage {
  const rand = Math.random().toString(36).substring(2, 6);
  return {
    id: 'lp_' + Math.random().toString(36).substring(2, 9),
    storeId,
    slug: `offer-${rand}`,
    title: '',
    highlightTitle: '',
    description: '',
    category: 'الديكور والمنزل',
    stock: 30,
    badgeText: 'الأكثر طلباً',
    mainImage: DEFAULT_ASSETS.towelHolderMain,
    galleryImages: [
      DEFAULT_ASSETS.towelHolderMain,
      DEFAULT_ASSETS.towelHolderBathroom,
      DEFAULT_ASSETS.towelHolderKitchen,
      DEFAULT_ASSETS.towelHolderDetail
    ],
    offers: [
      {
        id: 'pack1',
        title: 'العرض العادي (قطعة واحدة)',
        subtitle: 'مناسب للتجربة والاستخدام الشخصي',
        quantity: 1,
        price: 1900,
        isDefault: false
      },
      {
        id: 'pack2',
        title: 'عرض القطعتين (الأكثر مبيعاً)',
        subtitle: 'قطعتين بسعر اقتصادي موفر',
        quantity: 2,
        price: 3300,
        comparePrice: 3800,
        badge: 'توفير رائع',
        isDefault: true
      },
      {
        id: 'pack4',
        title: 'العرض العائلي الفاخر (4 قطع)',
        subtitle: 'أقصى توفير للعائلات',
        quantity: 4,
        price: 6200,
        comparePrice: 7600,
        isDefault: false
      }
    ],
    theme: { ...LANDING_THEME_PRESETS[0] },
    integrations: {
      pixelId: '',
      whatsappNumber: '',
      googleSheetWebhook: ''
    },
    isPublished: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export const LandingPagesTab: React.FC<Props> = ({
  storeId,
  landingPages,
  onSaveLandingPage,
  onDeleteLandingPage,
  onPreviewPage
}) => {
  const [editingPage, setEditingPage] = useState<LandingPage | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pageToDelete, setPageToDelete] = useState<LandingPage | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);

  const handleCopyLink = (slug: string) => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('p', slug);
      navigator.clipboard?.writeText(url.toString());
      setCopiedSlug(slug);
      setTimeout(() => setCopiedSlug(null), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleImageFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    onResult: (dataUrl: string) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setEditorError('حجم الصورة كبير جداً. يرجى اختيار صورة أقل من 2 ميغابايت.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onResult(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleOfferChange = (idx: number, field: keyof LandingPageOffer, value: any) => {
    if (!editingPage) return;
    const nextOffers = editingPage.offers.map((o, i) => {
      if (field === 'isDefault') {
        return { ...o, isDefault: i === idx };
      }
      if (i !== idx) return o;
      return { ...o, [field]: value };
    });
    setEditingPage({ ...editingPage, offers: nextOffers });
  };

  const handleAddOffer = () => {
    if (!editingPage) return;
    const newOffer: LandingPageOffer = {
      id: 'pack_' + Math.random().toString(36).substring(2, 7),
      title: `باقة جديدة (${editingPage.offers.length + 1})`,
      subtitle: 'وصف مختصر للباقة',
      quantity: editingPage.offers.length + 1,
      price: 2500,
      isDefault: editingPage.offers.length === 0
    };
    setEditingPage({ ...editingPage, offers: [...editingPage.offers, newOffer] });
  };

  const handleRemoveOffer = (idx: number) => {
    if (!editingPage || editingPage.offers.length <= 1) return;
    const filtered = editingPage.offers.filter((_, i) => i !== idx);
    if (!filtered.some(o => o.isDefault) && filtered[0]) {
      filtered[0].isDefault = true;
    }
    setEditingPage({ ...editingPage, offers: filtered });
  };

  const handleThemePreset = (preset: LandingPageTheme) => {
    if (!editingPage) return;
    setEditingPage({ ...editingPage, theme: { ...preset } });
  };

  const handleSubmitEditor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPage) return;
    setEditorError(null);

    if (!editingPage.title.trim()) {
      setEditorError('يرجى إدخال عنوان المنتج الرئيسي');
      return;
    }
    if (!editingPage.slug.trim()) {
      setEditorError('يرجى إدخال رابط الصفحة (Slug) بالأحرف الإنجليزية');
      return;
    }
    if (editingPage.offers.length === 0) {
      setEditorError('يجب إضافة باقة عرض واحدة على الأقل');
      return;
    }

    setIsSaving(true);
    const ok = await onSaveLandingPage({
      ...editingPage,
      galleryImages: editingPage.galleryImages.filter(Boolean)
    });
    setIsSaving(false);
    if (ok) {
      setEditingPage(null);
    }
  };

  // --- EDITOR MODE ---
  if (editingPage) {
    const t = editingPage.theme;
    const previewOffer = editingPage.offers.find(o => o.isDefault) || editingPage.offers[0];

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setEditingPage(null)}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">
                {landingPages.some(p => p.id === editingPage.id)
                  ? `تعديل صفحة الهبوط: ${editingPage.title || editingPage.slug}`
                  : 'إنشاء صفحة هبوط جديدة'}
              </h2>
              <p className="text-xs text-slate-500">
                خصص المنتج، الباقات، قالب الألوان الخاص بالصفحة، وإعدادات البكسل وواتساب
              </p>
            </div>
          </div>
        </div>

        {editorError && (
          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 text-rose-700 dark:text-rose-300 text-xs font-bold">
            {editorError}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Form Column */}
          <form onSubmit={handleSubmitEditor} className="xl:col-span-7 space-y-5">
            {/* 1. Basic Info */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Globe className="w-4 h-4 text-emerald-600" />
                  <span>معلومات المنتج والرابط</span>
                </h3>
                <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingPage.isPublished}
                    onChange={e => setEditingPage({ ...editingPage, isPublished: e.target.checked })}
                    className="rounded accent-emerald-600"
                  />
                  <span>منشورة للزبائن</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold mb-1">اسم المنتج الرئيسي *</label>
                  <input
                    type="text"
                    required
                    value={editingPage.title}
                    onChange={e => setEditingPage({ ...editingPage, title: e.target.value })}
                    placeholder="حامل المناشف الخشبي الفاخر"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">العنوان المميز (بلون الصفحة)</label>
                  <input
                    type="text"
                    value={editingPage.highlightTitle || ''}
                    onChange={e => setEditingPage({ ...editingPage, highlightTitle: e.target.value })}
                    placeholder="بنظام القفل بالجاذبية"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-xs font-bold mb-1">رابط الصفحة (Slug) *</label>
                  <input
                    type="text"
                    dir="ltr"
                    required
                    value={editingPage.slug}
                    onChange={e => setEditingPage({ ...editingPage, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                    placeholder="towel-holder"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">التصنيف</label>
                  <input
                    type="text"
                    value={editingPage.category}
                    onChange={e => setEditingPage({ ...editingPage, category: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">المخزون المتوفر</label>
                  <input
                    type="number"
                    min="0"
                    value={editingPage.stock}
                    onChange={e => setEditingPage({ ...editingPage, stock: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold mb-1">الوصف التسويقي المقنع</label>
                  <textarea
                    rows={3}
                    value={editingPage.description}
                    onChange={e => setEditingPage({ ...editingPage, description: e.target.value })}
                    placeholder="اشرح مزايا المنتج وفوائده للعميل..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">شارة الصورة (اختياري)</label>
                  <input
                    type="text"
                    value={editingPage.badgeText || ''}
                    onChange={e => setEditingPage({ ...editingPage, badgeText: e.target.value })}
                    placeholder="الأكثر طلباً"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* 2. Images */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-emerald-600" />
                <span>الصورة الرئيسية ومعرض الصور (4 مصغرات)</span>
              </h3>

              <div className="space-y-2">
                <label className="block text-xs font-bold">رابط الصورة الرئيسية أو رفع صورة:</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    dir="ltr"
                    value={editingPage.mainImage}
                    onChange={e => setEditingPage({ ...editingPage, mainImage: e.target.value })}
                    placeholder="https://..."
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                  />
                  <label className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold cursor-pointer flex items-center gap-1.5 shrink-0">
                    <Upload className="w-3.5 h-3.5" />
                    <span>رفع</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e =>
                        handleImageFileUpload(e, url =>
                          setEditingPage({ ...editingPage, mainImage: url })
                        )
                      }
                    />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[0, 1, 2, 3].map(idx => (
                  <div key={idx} className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-500">
                      صورة مصغرة {idx + 1}
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        dir="ltr"
                        value={editingPage.galleryImages[idx] || ''}
                        onChange={e => {
                          const next = [...editingPage.galleryImages];
                          next[idx] = e.target.value;
                          setEditingPage({ ...editingPage, galleryImages: next });
                        }}
                        placeholder="رابط الصورة..."
                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-mono"
                      />
                      <label className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] font-bold cursor-pointer shrink-0">
                        رفع
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={e =>
                            handleImageFileUpload(e, url => {
                              const next = [...editingPage.galleryImages];
                              next[idx] = url;
                              setEditingPage({ ...editingPage, galleryImages: next });
                            })
                          }
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Interactive Offers / Bundles */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-600" />
                  <span>عروض الباقات التفاعلية (قطعة / قطعتين / 4 قطع...)</span>
                </h3>
                <button
                  type="button"
                  onClick={handleAddOffer}
                  className="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة باقة</span>
                </button>
              </div>

              <div className="space-y-3">
                {editingPage.offers.map((offer, idx) => (
                  <div
                    key={offer.id}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                        <input
                          type="radio"
                          name="defaultOffer"
                          checked={Boolean(offer.isDefault)}
                          onChange={() => handleOfferChange(idx, 'isDefault', true)}
                          className="accent-emerald-600"
                        />
                        <span>العرض الافتراضي المحدد مسبقاً</span>
                      </label>
                      {editingPage.offers.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveOffer(idx)}
                          className="text-rose-500 hover:text-rose-700 text-xs font-bold flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>حذف</span>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-0.5">عنوان الباقة</label>
                        <input
                          type="text"
                          required
                          value={offer.title}
                          onChange={e => handleOfferChange(idx, 'title', e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-0.5">وصف فرعي قصير</label>
                        <input
                          type="text"
                          value={offer.subtitle}
                          onChange={e => handleOfferChange(idx, 'subtitle', e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-0.5">الكمية (مخزون)</label>
                        <input
                          type="number"
                          min="1"
                          required
                          value={offer.quantity}
                          onChange={e => handleOfferChange(idx, 'quantity', Math.max(1, Number(e.target.value) || 1))}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-0.5">السعر (دج)</label>
                        <input
                          type="number"
                          min="0"
                          required
                          value={offer.price}
                          onChange={e => handleOfferChange(idx, 'price', Math.max(0, Number(e.target.value) || 0))}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-mono font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-0.5">قبل التخفيض</label>
                        <input
                          type="number"
                          min="0"
                          value={offer.comparePrice || ''}
                          onChange={e =>
                            handleOfferChange(idx, 'comparePrice', e.target.value ? Number(e.target.value) : undefined)
                          }
                          placeholder="اختياري"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-0.5">شارة التوفير</label>
                        <input
                          type="text"
                          value={offer.badge || ''}
                          onChange={e => handleOfferChange(idx, 'badge', e.target.value)}
                          placeholder="توفير رائع"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 4. Theme Palette Customizer */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Palette className="w-4 h-4 text-emerald-600" />
                <span>قالب الألوان المخصص لهذه الصفحة فقط</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {LANDING_THEME_PRESETS.map(preset => {
                  const selected = t.presetId === preset.presetId;
                  return (
                    <button
                      type="button"
                      key={preset.presetId}
                      onClick={() => handleThemePreset(preset)}
                      className={`p-2.5 rounded-xl border text-right text-xs font-bold flex items-center gap-2.5 transition-all cursor-pointer ${
                        selected
                          ? 'border-emerald-600 ring-2 ring-emerald-500/20 bg-emerald-50/40 dark:bg-emerald-950/30'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-400'
                      }`}
                    >
                      <div className="flex items-center -space-x-1 space-x-reverse shrink-0">
                        <span
                          className="w-4 h-4 rounded-full border border-white shadow"
                          style={{ backgroundColor: preset.primaryColor }}
                        />
                        <span
                          className="w-4 h-4 rounded-full border border-white shadow"
                          style={{ backgroundColor: preset.bgColor }}
                        />
                      </div>
                      <span className="truncate">{preset.name}</span>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                {[
                  { key: 'primaryColor', label: 'اللون الأساسي' },
                  { key: 'primaryHoverColor', label: 'لون الداكن/الشريط' },
                  { key: 'bgColor', label: 'خلفية الصفحة' },
                  { key: 'accentColor', label: 'لون الشارات' }
                ].map(item => (
                  <div key={item.key} className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-500">{item.label}</label>
                    <div className="flex items-center gap-2 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1">
                      <input
                        type="color"
                        value={(t as any)[item.key]}
                        onChange={e =>
                          setEditingPage({
                            ...editingPage,
                            theme: { ...t, presetId: 'custom', [item.key]: e.target.value }
                          })
                        }
                        className="w-6 h-6 rounded cursor-pointer border-0 p-0 bg-transparent"
                      />
                      <span className="font-mono text-[11px]">{(t as any)[item.key]}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 5. Per-Page Integrations */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Share2 className="w-4 h-4 text-emerald-600" />
                <span>ربط Facebook Pixel وواتساب و Google Sheets لهذه الصفحة</span>
              </h3>
              <p className="text-[11px] text-slate-500">
                إذا تركت أي حقل فارغاً، سيتم استخدام الإعدادات الافتراضية للمتجر من تبويب "الإعدادات".
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-xs font-bold mb-1">معرّف Facebook Pixel ID</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={editingPage.integrations.pixelId || ''}
                    onChange={e =>
                      setEditingPage({
                        ...editingPage,
                        integrations: { ...editingPage.integrations, pixelId: e.target.value }
                      })
                    }
                    placeholder="1130382356394829"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">معرّف TikTok Pixel ID</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={editingPage.integrations.tiktokPixelId || ''}
                    onChange={e =>
                      setEditingPage({
                        ...editingPage,
                        integrations: { ...editingPage.integrations, tiktokPixelId: e.target.value }
                      })
                    }
                    placeholder="C9XXXXXXXXXXXX"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">رقم واتساب لاستقبال التأكيدات</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={editingPage.integrations.whatsappNumber || ''}
                    onChange={e =>
                      setEditingPage({
                        ...editingPage,
                        integrations: { ...editingPage.integrations, whatsappNumber: e.target.value }
                      })
                    }
                    placeholder="213798353165"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold mb-1">رابط Google Apps Script Webhook (اختياري)</label>
                <input
                  type="url"
                  dir="ltr"
                  value={editingPage.integrations.googleSheetWebhook || ''}
                  onChange={e =>
                    setEditingPage({
                      ...editingPage,
                      integrations: { ...editingPage.integrations, googleSheetWebhook: e.target.value }
                    })
                  }
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingPage(null)}
                className="px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md flex items-center gap-2 disabled:opacity-60 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'جارٍ الحفظ...' : 'حفظ ونشر صفحة الهبوط'}</span>
              </button>
            </div>
          </form>

          {/* Live Mini-Preview Column */}
          <div className="xl:col-span-5 xl:sticky xl:top-24 space-y-3">
            <div className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
              <Eye className="w-4 h-4 text-emerald-600" />
              <span>معاينة حية لمظهر صفحة الهبوط</span>
            </div>

            <div
              className="rounded-3xl overflow-hidden border shadow-xl"
              style={{
                backgroundColor: t.bgColor,
                color: t.textColor,
                borderColor: t.borderColor
              }}
            >
              <div
                className="py-1.5 px-3 text-center text-[11px] font-bold text-white"
                style={{ backgroundColor: t.primaryHoverColor }}
              >
                توصيل سريع لكافة الـ 58 ولاية | الدفع عند الاستلام
              </div>

              <div className="p-5 space-y-4">
                <div className="relative rounded-2xl overflow-hidden aspect-[4/3] bg-white border" style={{ borderColor: t.borderColor }}>
                  {editingPage.badgeText && (
                    <span
                      className="absolute top-3 right-3 text-white text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1"
                      style={{ backgroundColor: t.accentColor }}
                    >
                      <Flame className="w-3 h-3" />
                      <span>{editingPage.badgeText}</span>
                    </span>
                  )}
                  <img
                    src={editingPage.mainImage || DEFAULT_ASSETS.towelHolderMain}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-0.5 text-amber-400">
                    {[0, 1, 2, 3, 4].map(i => (
                      <Star key={i} className="w-3.5 h-3.5 fill-amber-400" />
                    ))}
                  </div>
                  <h4 className="font-black text-lg leading-snug">
                    {editingPage.title || 'عنوان المنتج سيظهر هنا'}{' '}
                    {editingPage.highlightTitle && (
                      <span style={{ color: t.primaryColor }}>{editingPage.highlightTitle}</span>
                    )}
                  </h4>
                  <p className="text-xs opacity-80 line-clamp-2">
                    {editingPage.description || 'وصف مختصر للمنتج ومزاياه...'}
                  </p>
                </div>

                <div className="space-y-2">
                  {editingPage.offers.slice(0, 3).map(o => (
                    <div
                      key={o.id}
                      className="p-2.5 rounded-xl border flex items-center justify-between text-xs"
                      style={{
                        backgroundColor: o.isDefault ? t.softTintColor : t.surfaceColor,
                        borderColor: o.isDefault ? t.primaryColor : t.borderColor
                      }}
                    >
                      <span className="font-bold">{o.title}</span>
                      <span className="font-black tabular-nums" style={{ color: t.primaryColor }}>
                        {formatDZD(o.price)}
                      </span>
                    </div>
                  ))}
                </div>

                <div
                  className="py-3 rounded-xl text-white font-bold text-xs text-center shadow"
                  style={{ backgroundColor: t.primaryColor }}
                >
                  أطلب الآن - {formatDZD(previewOffer?.price || 0)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- LIST VIEW ---
  return (
    <div className="space-y-6">
      <ConfirmDialog
        isOpen={!!pageToDelete}
        danger
        title="حذف صفحة الهبوط"
        message={
          pageToDelete
            ? `هل أنت متأكد من حذف صفحة "${pageToDelete.title}"؟ لن يتأثر سجل الطلبات السابقة.`
            : ''
        }
        confirmLabel="حذف الصفحة"
        cancelLabel="إلغاء"
        onConfirm={async () => {
          if (pageToDelete) await onDeleteLandingPage(pageToDelete.id);
          setPageToDelete(null);
        }}
        onCancel={() => setPageToDelete(null)}
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            منشئ صفحات الهبوط
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            أنشئ صفحة مبيعات عالية التحويل لكل منتج بألوان مخصصة، باقات عروض، وتتبع بكسل وواتساب مستقل
          </p>
        </div>

        <button
          onClick={() => setEditingPage(createEmptyPage(storeId))}
          className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md flex items-center gap-2 shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>إنشاء صفحة هبوط جديدة</span>
        </button>
      </div>

      {landingPages.length === 0 ? (
        <div className="p-12 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-3">
          <Layers className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="text-sm font-bold">لا توجد صفحات هبوط بعد</h3>
          <p className="text-xs text-slate-500">
            ابدأ بإنشاء أول صفحة هبوط بباقات عروض جاهزة وخريطة ألوان مخصصة.
          </p>
          <button
            onClick={() => setEditingPage(createEmptyPage(storeId))}
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold"
          >
            إضافة أول صفحة
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {landingPages.map(lp => {
            const defOffer = lp.offers.find(o => o.isDefault) || lp.offers[0];
            return (
              <div
                key={lp.id}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col justify-between"
              >
                <div className="p-5 flex gap-4">
                  <img
                    src={lp.mainImage || DEFAULT_ASSETS.towelHolderMain}
                    alt={lp.title}
                    className="w-24 h-24 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                  />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-mono text-slate-400 truncate" dir="ltr">
                        ?p={lp.slug}
                      </span>
                      <span
                        className={`text-[11px] font-bold ${
                          lp.isPublished ? 'text-emerald-600' : 'text-amber-600'
                        }`}
                      >
                        {lp.isPublished ? 'منشورة' : 'مسودة'}
                      </span>
                    </div>

                    <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                      {lp.title}
                    </h3>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 tabular-nums">
                      <span>الباقة الافتراضية: <strong className="text-slate-900 dark:text-white">{formatDZD(defOffer?.price || 0)}</strong></span>
                      <span>·</span>
                      <span>{lp.offers.length} باقات</span>
                      <span>·</span>
                      <span className={lp.stock <= 5 ? 'text-rose-600 font-bold' : ''}>
                        المخزون: {lp.stock}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-400">
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-slate-200 shrink-0"
                        style={{ backgroundColor: lp.theme.primaryColor }}
                      />
                      <span>{lp.theme.name}</span>
                      {lp.integrations.pixelId && <span>· Pixel مفعّل</span>}
                    </div>
                  </div>
                </div>

                <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => onPreviewPage(lp.slug)}
                      className="px-3 py-1.5 rounded-lg text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      style={{ backgroundColor: lp.theme.primaryColor }}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>معاينة الصفحة</span>
                    </button>

                    <button
                      onClick={() => handleCopyLink(lp.slug)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      {copiedSlug === lp.slug ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>تم النسخ</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>نسخ الرابط</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setEditingPage(JSON.parse(JSON.stringify(lp)))}
                      className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 cursor-pointer"
                      title="تعديل الصفحة"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setPageToDelete(lp)}
                      className="p-2 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-600 hover:bg-rose-100 cursor-pointer"
                      title="حذف الصفحة"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
