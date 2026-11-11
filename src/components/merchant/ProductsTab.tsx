import React, { useState } from 'react';
import { Product, ProductVariant } from '../../types';
import { formatDZD } from '../../data/wilayas';
import {
  Plus,
  Search,
  Filter,
  Edit2,
  Trash2,
  Package,
  Layers,
  Check,
  X,
  AlertCircle,
  Sparkles,
  Image as ImageIcon
} from 'lucide-react';

interface Props {
  storeId: string;
  products: Product[];
  onSaveProduct: (product: Product) => void;
  onDeleteProduct: (productId: string) => void;
}

const PRESET_IMAGES = [
  { label: 'قفطان جزائري', url: 'https://images.unsplash.com/photo-1566174053879-31528523f8ae?auto=format&fit=crop&w=800&q=80' },
  { label: 'برنوس شتوي', url: 'https://images.unsplash.com/photo-1544441893-675973e31985?auto=format&fit=crop&w=800&q=80' },
  { label: 'حذاء كلاسيكي', url: 'https://images.unsplash.com/photo-1614252235316-8c857d38b5f4?auto=format&fit=crop&w=800&q=80' },
  { label: 'ساعة رجالية', url: 'https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=800&q=80' },
  { label: 'حقيبة نسائية', url: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=800&q=80' },
  { label: 'عطر دهن العود', url: 'https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&w=800&q=80' },
  { label: 'سماعات لاسلكية', url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80' },
  { label: 'نظارات شمسية', url: 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=800&q=80' }
];

const CATEGORIES = [
  'الكل',
  'ملابس نسائية',
  'ملابس رجالية',
  'أحذية',
  'حقائب',
  'إكسسوارات',
  'عطور',
  'إلكترونيات',
  'أخرى'
];

export const ProductsTab: React.FC<Props> = ({
  storeId,
  products,
  onSaveProduct,
  onDeleteProduct
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('الكل');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('ملابس نسائية');
  const [price, setPrice] = useState<number>(0);
  const [comparePrice, setComparePrice] = useState<number>(0);
  const [costPrice, setCostPrice] = useState<number>(0);
  const [stock, setStock] = useState<number>(10);
  const [sku, setSku] = useState('');
  const [imageUrl, setImageUrl] = useState(PRESET_IMAGES[0].url);
  const [isActive, setIsActive] = useState(true);
  const [hasVariants, setHasVariants] = useState(false);
  const [variantSizes, setVariantSizes] = useState<string>('S, M, L, XL');
  const [variantColors, setVariantColors] = useState<string>('أسود, بني, أزرق');
  const [formError, setFormError] = useState<string | null>(null);

  // Filtered Products
  const filtered = products.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()));
    const matchesCat = selectedCategory === 'الكل' || p.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const openAddModal = () => {
    setEditingProduct(null);
    setTitle('');
    setDescription('');
    setCategory('ملابس نسائية');
    setPrice(4500);
    setComparePrice(5500);
    setCostPrice(2500);
    setStock(15);
    setSku('DZ-' + Math.floor(1000 + Math.random() * 9000));
    setImageUrl(PRESET_IMAGES[0].url);
    setIsActive(true);
    setHasVariants(false);
    setVariantSizes('S, M, L, XL');
    setVariantColors('أسود, كحلي, رمادي');
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setTitle(p.title);
    setDescription(p.description);
    setCategory(p.category);
    setPrice(p.price);
    setComparePrice(p.comparePrice || 0);
    setCostPrice(p.costPrice || 0);
    setStock(p.stock);
    setSku(p.sku || '');
    setImageUrl(p.imageUrl);
    setIsActive(p.isActive);

    if (p.variants && p.variants.length > 0) {
      setHasVariants(true);
      const sizeVar = p.variants.find(v => v.name.includes('المقاس') || v.name.toLowerCase().includes('size'));
      const colorVar = p.variants.find(v => v.name.includes('اللون') || v.name.toLowerCase().includes('color'));
      if (sizeVar) setVariantSizes(sizeVar.options.join(', '));
      if (colorVar) setVariantColors(colorVar.options.join(', '));
    } else {
      setHasVariants(false);
    }

    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!title.trim()) {
      setFormError('يرجى كتابة اسم المنتج');
      return;
    }

    if (price <= 0) {
      setFormError('يجب أن يكون سعر المنتج أكبر من صفر د.ج');
      return;
    }

    const variants: ProductVariant[] = [];
    if (hasVariants) {
      if (variantSizes.trim()) {
        variants.push({
          id: 'v_size',
          name: 'المقاس',
          options: variantSizes.split(',').map(s => s.trim()).filter(Boolean)
        });
      }
      if (variantColors.trim()) {
        variants.push({
          id: 'v_color',
          name: 'اللون',
          options: variantColors.split(',').map(s => s.trim()).filter(Boolean)
        });
      }
    }

    const prodToSave: Product = {
      id: editingProduct?.id || 'prod_' + Math.random().toString(36).substring(2, 9),
      storeId,
      title: title.trim(),
      description: description.trim(),
      category,
      price: Number(price),
      comparePrice: comparePrice > 0 ? Number(comparePrice) : undefined,
      costPrice: costPrice > 0 ? Number(costPrice) : undefined,
      stock: Number(stock),
      sku: sku.trim() || undefined,
      imageUrl: imageUrl.trim() || PRESET_IMAGES[0].url,
      variants: variants.length > 0 ? variants : undefined,
      isActive,
      createdAt: editingProduct?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    onSaveProduct(prodToSave);
    setIsModalOpen(false);
  };

  const handleDelete = (p: Product) => {
    if (window.confirm(`هل أنت متأكد من حذف المنتج: "${p.title}"؟`)) {
      onDeleteProduct(p.id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            إدارة المنتجات والمخزون
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            إجمالي {products.length} منتج مسجل في متجرك
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm shadow-md shadow-emerald-600/20 transition-all flex items-center gap-2 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة منتج جديد</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ابحث بالاسم أو رمز SKU..."
            className="w-full pr-10 pl-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Categories scroll/pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Product List */}
      {filtered.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
          <Package className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto" />
          <h4 className="text-base font-bold text-slate-800 dark:text-slate-200">
            لم يتم العثور على منتجات
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            حاول تغيير معايير البحث أو أضف أول منتج لمتجرك الآن
          </p>
          <button
            onClick={openAddModal}
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold"
          >
            إضافة منتج
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(p => {
            const isLowStock = p.stock <= 5;
            return (
              <div
                key={p.id}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 transition-all"
              >
                <div>
                  {/* Image and Badges */}
                  <div className="relative h-44 bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <img
                      src={p.imageUrl}
                      alt={p.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute top-3 right-3 flex items-center gap-1.5">
                      <span className="px-2.5 py-1 rounded-full bg-slate-900/80 backdrop-blur-md text-white text-[10px] font-bold">
                        {p.category}
                      </span>
                      {isLowStock && (
                        <span className="px-2 py-1 rounded-full bg-rose-600 text-white text-[10px] font-bold shadow-sm">
                          مخزون منخفض ({p.stock})
                        </span>
                      )}
                    </div>

                    <div className="absolute top-3 left-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          p.isActive
                            ? 'bg-emerald-500 text-white'
                            : 'bg-slate-600 text-white'
                        }`}
                      >
                        {p.isActive ? 'معروض' : 'مسودة'}
                      </span>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-1">
                        {p.title}
                      </h3>
                      {p.sku && (
                        <span className="font-mono text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                          {p.sku}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                      {p.description}
                    </p>

                    {/* Price and Stock */}
                    <div className="pt-2 flex items-baseline justify-between border-t border-slate-100 dark:border-slate-800">
                      <div>
                        <div className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">
                          {formatDZD(p.price)}
                        </div>
                        {p.comparePrice && p.comparePrice > p.price && (
                          <div className="text-[11px] text-slate-400 line-through font-mono">
                            {formatDZD(p.comparePrice)}
                          </div>
                        )}
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block">الكمية</span>
                        <span className={`text-xs font-bold font-mono ${isLowStock ? 'text-rose-600' : 'text-slate-800 dark:text-slate-200'}`}>
                          {p.stock} قطعة
                        </span>
                      </div>
                    </div>

                    {/* Variants preview */}
                    {p.variants && p.variants.length > 0 && (
                      <div className="pt-1 flex flex-wrap gap-1">
                        {p.variants.map((v, i) => (
                          <span
                            key={i}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                          >
                            {v.name}: {v.options.slice(0, 3).join(', ')}{v.options.length > 3 ? '...' : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                  <button
                    onClick={() => openEditModal(p)}
                    className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    title="تعديل المنتج"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(p)}
                    className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                    title="حذف المنتج"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Product Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl p-6 md:p-8 border border-slate-200 dark:border-slate-800 shadow-2xl text-right my-8 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute left-6 top-6 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
              {editingProduct ? 'تعديل بيانات المنتج' : 'إضافة منتج جديد للمتجر'}
            </h3>

            {formError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  اسم المنتج <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="مثال: قفطان جزائري عصري مطرز..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  الوصف التسويقي
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="اكتب وصفاً جذاباً يشرح مزايا المنتج وخامته ومناسباته..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Category & SKU */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    التصنيف
                  </label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    {CATEGORIES.filter(c => c !== 'الكل').map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    رمز المنتج (SKU)
                  </label>
                  <input
                    type="text"
                    value={sku}
                    onChange={e => setSku(e.target.value)}
                    placeholder="مثال: DZ-PR-102"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Pricing Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    سعر البيع للزبون (د.ج) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={price}
                    onChange={e => setPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    سعر المقارنة قبل التخفيض (اختياري)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={comparePrice}
                    onChange={e => setComparePrice(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    سعر التكلفة (لحساب أرباحك)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={costPrice}
                    onChange={e => setCostPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-mono"
                  />
                </div>
              </div>

              {/* Stock & Active Switch */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    الكمية المتوفرة بالمخزن <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={stock}
                    onChange={e => setStock(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-mono"
                  />
                </div>

                <div className="flex items-center gap-3 pt-5">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={e => setIsActive(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    عرض المنتج في المتجر فوراً
                  </span>
                </div>
              </div>

              {/* Image Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  رابط صورة المنتج
                </label>
                <input
                  type="url"
                  value={imageUrl}
                  onChange={e => setImageUrl(e.target.value)}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-mono mb-2"
                />

                {/* Preset Picker */}
                <div className="space-y-1.5">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                    أو اختر من صور النماذج الجاهزة:
                  </span>
                  <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                    {PRESET_IMAGES.map((img, idx) => (
                      <button
                        type="button"
                        key={idx}
                        onClick={() => setImageUrl(img.url)}
                        className={`relative h-14 rounded-lg overflow-hidden border-2 transition-all ${
                          imageUrl === img.url
                            ? 'border-emerald-500 scale-95 shadow-md'
                            : 'border-transparent opacity-70 hover:opacity-100'
                        }`}
                        title={img.label}
                      >
                        <img src={img.url} alt={img.label} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Variants Section */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-emerald-600" />
                    <span>خيارات ومتغيرات المنتج (المقاسات والألوان)</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={hasVariants}
                    onChange={e => setHasVariants(e.target.checked)}
                    className="w-4 h-4 accent-emerald-600"
                  />
                </div>

                {hasVariants && (
                  <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div>
                      <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                        المقاسات (افصل بينها بفاصلة):
                      </label>
                      <input
                        type="text"
                        value={variantSizes}
                        onChange={e => setVariantSizes(e.target.value)}
                        placeholder="S, M, L, XL, XXL أو 38, 40, 42..."
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                        الألوان المتوفرة (افصل بينها بفاصلة):
                      </label>
                      <input
                        type="text"
                        value={variantColors}
                        onChange={e => setVariantColors(e.target.value)}
                        placeholder="أسود, كحلي, أحمر, أبيض..."
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20"
                >
                  {editingProduct ? 'حفظ التعديلات' : 'إضافة المنتج'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
