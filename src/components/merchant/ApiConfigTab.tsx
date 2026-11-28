import React, { useState, useEffect } from 'react';
import {
  ApiDiagnosticLog,
  CourierProvider,
  MerchantAlertSmsProvider,
  MerchantAlertWhatsAppMode,
  Store,
  StoreApiConfig,
  WhatsAppApiProvider
} from '../../types';
import { ALGERIA_WILAYAS } from '../../data/wilayas';
import {
  COURIER_PROVIDER_INFO,
  GOOGLE_APPS_SCRIPT_TEMPLATE,
  sendWhatsAppViaApi,
  testCourierApi,
  testGoogleSheetApi,
  testMerchantAlertChannel,
  testTrackingServerEvent
} from '../../services/integrations';
import {
  Plug,
  Truck,
  Activity,
  FileSpreadsheet,
  MessageCircle,
  Save,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Loader2,
  Copy,
  Database,
  ShieldCheck,
  Terminal,
  Trash2,
  ChevronDown,
  ChevronUp,
  Send,
  CreditCard,
  Wallet,
  Lock,
  Bell,
  Smartphone
} from 'lucide-react';

interface Props {
  store: Store;
  initialConfig: StoreApiConfig;
  needsSqlMigration?: boolean;
  allowOnlinePayment?: boolean;
  onGoToBilling?: () => void;
  onSaveConfig: (config: StoreApiConfig) => Promise<void>;
  onClearLogs: () => Promise<void>;
}

const SQL_MIGRATION_SNIPPET = `BEGIN;
CREATE OR REPLACE FUNCTION public.owns_store(p_store_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store_id AND owner_id = auth.uid());
$$;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS tiktok_pixel_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS store_id UUID, ADD COLUMN IF NOT EXISTS courier_provider TEXT, ADD COLUMN IF NOT EXISTS courier_label_url TEXT;
CREATE TABLE IF NOT EXISTS public.store_api_configs (
  store_id UUID PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  diagnostic_logs JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.store_api_configs
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS diagnostic_logs JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.store_api_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS store_api_configs_owner_select ON public.store_api_configs;
CREATE POLICY store_api_configs_owner_select ON public.store_api_configs FOR SELECT TO authenticated USING (public.owns_store(public.store_api_configs.store_id));
DROP POLICY IF EXISTS store_api_configs_owner_insert ON public.store_api_configs;
CREATE POLICY store_api_configs_owner_insert ON public.store_api_configs FOR INSERT TO authenticated WITH CHECK (public.owns_store(public.store_api_configs.store_id));
DROP POLICY IF EXISTS store_api_configs_owner_update ON public.store_api_configs;
CREATE POLICY store_api_configs_owner_update ON public.store_api_configs FOR UPDATE TO authenticated USING (public.owns_store(public.store_api_configs.store_id)) WITH CHECK (public.owns_store(public.store_api_configs.store_id));
DROP POLICY IF EXISTS store_api_configs_owner_delete ON public.store_api_configs;
CREATE POLICY store_api_configs_owner_delete ON public.store_api_configs FOR DELETE TO authenticated USING (public.owns_store(public.store_api_configs.store_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.store_api_configs TO authenticated;
COMMIT;`;

type TestFeedback = { ok: boolean; message: string; latencyMs?: number } | null;

export const ApiConfigTab: React.FC<Props> = ({
  store,
  initialConfig,
  needsSqlMigration,
  allowOnlinePayment = true,
  onGoToBilling,
  onSaveConfig,
  onClearLogs
}) => {
  const [form, setForm] = useState<StoreApiConfig>(initialConfig);
  const [isSaving, setIsSaving] = useState(false);

  // Secret visibility toggles
  const [showCourierToken, setShowCourierToken] = useState(false);
  const [showMetaToken, setShowMetaToken] = useState(false);
  const [showTikTokToken, setShowTikTokToken] = useState(false);
  const [showWaToken, setShowWaToken] = useState(false);
  const [showChargilyKey, setShowChargilyKey] = useState(false);
  const [showTelegramToken, setShowTelegramToken] = useState(false);
  const [showSmsSecret, setShowSmsSecret] = useState(false);

  // Test states & feedback
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [courierFeedback, setCourierFeedback] = useState<TestFeedback>(null);
  const [metaFeedback, setMetaFeedback] = useState<TestFeedback>(null);
  const [tiktokFeedback, setTiktokFeedback] = useState<TestFeedback>(null);
  const [sheetFeedback, setSheetFeedback] = useState<TestFeedback>(null);
  const [waFeedback, setWaFeedback] = useState<TestFeedback>(null);
  const [telegramFeedback, setTelegramFeedback] = useState<TestFeedback>(null);
  const [merchantWaFeedback, setMerchantWaFeedback] = useState<TestFeedback>(null);
  const [smsFeedback, setSmsFeedback] = useState<TestFeedback>(null);
  const [waTestPhone, setWaTestPhone] = useState<string>(store.defaultWhatsapp || store.phone || '');

  const countRecipients = (raw?: string) =>
    String(raw || '')
      .split(/[\n,;]+/)
      .map(s => s.trim())
      .filter(Boolean).length;

  const handleTestMerchantAlert = async (channel: 'telegram' | 'whatsapp' | 'sms') => {
    const key = `alert_${channel}`;
    setTestingKey(key);
    if (channel === 'telegram') setTelegramFeedback(null);
    if (channel === 'whatsapp') setMerchantWaFeedback(null);
    if (channel === 'sms') setSmsFeedback(null);

    const res = await testMerchantAlertChannel({
      storeId: store.id,
      storeName: store.name,
      channel,
      config: form
    });

    if (channel === 'telegram') setTelegramFeedback(res);
    if (channel === 'whatsapp') setMerchantWaFeedback(res);
    if (channel === 'sms') setSmsFeedback(res);

    const channelLabel =
      channel === 'telegram' ? 'تيليغرام' : channel === 'whatsapp' ? 'واتساب التاجر' : 'الرسائل القصيرة SMS';
    const updated = appendLogLocal(
      'merchant_alert',
      `اختبار تنبيه ${channelLabel}`,
      res.ok,
      res.message,
      res.latencyMs
    );
    await onSaveConfig(updated);
    setTestingKey(null);
  };

  const [showAppsScriptCode, setShowAppsScriptCode] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    setForm(initialConfig);
  }, [initialConfig]);

  const appendLogLocal = (
    service: ApiDiagnosticLog['service'],
    action: string,
    ok: boolean,
    message: string,
    latencyMs?: number
  ): StoreApiConfig => {
    const entry: ApiDiagnosticLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      service,
      action,
      status: ok ? 'success' : 'error',
      message,
      latencyMs
    };
    const next: StoreApiConfig = {
      ...form,
      diagnosticLogs: [entry, ...(form.diagnosticLogs || [])].slice(0, 30)
    };
    setForm(next);
    return next;
  };

  const handleCopyText = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2200);
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    await onSaveConfig(form);
    setIsSaving(false);
  };

  const handleTestCourier = async () => {
    setTestingKey('courier');
    setCourierFeedback(null);
    const res = await testCourierApi(form);
    setCourierFeedback(res);
    const nextCfg = appendLogLocal('courier', 'test_connection', res.ok, res.message, res.latencyMs);
    await onSaveConfig(nextCfg);
    setTestingKey(null);
  };

  const handleTestTracking = async (target: 'meta' | 'tiktok') => {
    setTestingKey(target);
    if (target === 'meta') setMetaFeedback(null);
    else setTiktokFeedback(null);

    const res = await testTrackingServerEvent(target, form);
    if (target === 'meta') setMetaFeedback(res);
    else setTiktokFeedback(res);

    const nextCfg = appendLogLocal(
      target === 'meta' ? 'meta_capi' : 'tiktok',
      'test_event',
      res.ok,
      res.message,
      res.latencyMs
    );
    await onSaveConfig(nextCfg);
    setTestingKey(null);
  };

  const handleTestSheet = async () => {
    setTestingKey('sheet');
    setSheetFeedback(null);
    const res = await testGoogleSheetApi(form.googleSheetWebhook || '');
    setSheetFeedback(res);
    const nextCfg = appendLogLocal('google_sheet', 'test_webhook', res.ok, res.message, res.latencyMs);
    await onSaveConfig(nextCfg);
    setTestingKey(null);
  };

  const handleTestWhatsApp = async () => {
    setTestingKey('whatsapp');
    setWaFeedback(null);
    const res = await sendWhatsAppViaApi(
      {
        storeId: store.id,
        phone: waTestPhone.trim(),
        message: `رسالة اختبار تلقائية من لوحة متجر ${store.name} عبر API — الاتصال يعمل بنجاح.`,
        customerName: 'اختبار النظام',
        orderNumber: 'TEST-100',
        isTest: true
      },
      form
    );
    setWaFeedback(res);
    const nextCfg = appendLogLocal('whatsapp', 'test_message', res.ok, res.message, res.latencyMs);
    await onSaveConfig(nextCfg);
    setTestingKey(null);
  };

  const activeIntegrationsCount = [
    form.courierProvider !== 'none' && Boolean(form.courierApiToken),
    Boolean(form.metaPixelId),
    Boolean(form.metaCapiEnabled && form.metaCapiToken),
    Boolean(form.tiktokPixelId),
    Boolean(form.googleSheetWebhook),
    form.whatsappProvider !== 'none' && Boolean(form.whatsappApiToken || form.whatsappApiUrl)
  ].filter(Boolean).length;

  const courierMeta = COURIER_PROVIDER_INFO[form.courierProvider];

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header + Save Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Plug className="w-5 h-5 text-emerald-600" />
            <span>مركز إعدادات الـ API والتكاملات</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            ربط شركات التوصيل الجزائرية، تتبع Meta CAPI و TikTok عبر السيرفر، فحص Google Sheet، وواتساب الآلي
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-bold tabular-nums">
            {activeIntegrationsCount} تكاملات مفعلة
          </span>
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={isSaving}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{isSaving ? 'جارٍ الحفظ...' : 'حفظ إعدادات الـ API'}</span>
          </button>
        </div>
      </div>

      {/* Security Notice */}
      <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300">
        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
        <span>
          جميع المفاتيح السرية (Tokens) تُعالج وتُرسل عبر خادم التطبيق الآمن (<code className="font-mono text-[11px]">/api/*</code>) ولا تظهر أبداً للزبائن في صفحات الهبوط.
        </span>
      </div>

      {/* Optional Supabase Migration Helper Banner */}
      {needsSqlMigration && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-amber-900 dark:text-amber-200">
              <Database className="w-4 h-4 text-amber-600 shrink-0" />
              <span>الإعدادات محفوظة محلياً وعلى السيرفر — لمزامنتها في Supabase على جميع أجهزتك نفّذ هذا الـ SQL مرة واحدة:</span>
            </div>
            <button
              type="button"
              onClick={() => handleCopyText('sql', SQL_MIGRATION_SNIPPET)}
              className="px-3 py-1.5 rounded-lg bg-amber-600 text-white font-bold flex items-center gap-1.5 cursor-pointer"
            >
              {copiedKey === 'sql' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedKey === 'sql' ? 'تم النسخ!' : 'نسخ كود SQL'}</span>
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* 1. ALGERIAN DELIVERY COURIERS API */}
        <section className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                <Truck className="w-4 h-4 text-emerald-600" />
                <span>1. ربط API شركات التوصيل الجزائرية</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                أرسل الطلبات بنقرة واحدة لتوليد رمز التتبع والبوليصة الرسمية PDF وسحب الحالة تلقائياً
              </p>
            </div>

            {form.courierProvider !== 'none' && (
              <button
                type="button"
                onClick={handleTestCourier}
                disabled={testingKey === 'courier'}
                className="px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {testingKey === 'courier' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5 text-emerald-400" />}
                <span>اختبار الاتصال بشركة التوصيل</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {(Object.keys(COURIER_PROVIDER_INFO) as CourierProvider[]).map(key => {
              const info = COURIER_PROVIDER_INFO[key];
              const isSelected = form.courierProvider === key;
              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => {
                    setForm(prev => ({ ...prev, courierProvider: key }));
                    setCourierFeedback(null);
                  }}
                  className={`p-3 rounded-xl border text-right transition-all cursor-pointer ${
                    isSelected
                      ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/40 ring-2 ring-emerald-500/20'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  }`}
                >
                  <div className="font-bold text-xs text-slate-900 dark:text-white truncate">{info.name}</div>
                  <div className="text-[10px] text-slate-500 truncate mt-0.5">{info.subtitle}</div>
                </button>
              );
            })}
          </div>

          {form.courierProvider !== 'none' && (
            <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {courierMeta.requiresApiId && (
                  <div>
                    <label className="block text-xs font-bold mb-1">
                      {form.courierProvider === 'zrexpress' || form.courierProvider === 'procolis'
                        ? 'API Key (المعرف)'
                        : 'X-API-ID (معرف الحساب)'}
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={form.courierApiId || ''}
                      onChange={e => setForm({ ...form, courierApiId: e.target.value })}
                      placeholder="123456789..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                    />
                  </div>
                )}

                <div className={courierMeta.requiresApiId ? '' : 'sm:col-span-2'}>
                  <label className="block text-xs font-bold mb-1">
                    {form.courierProvider === 'yalidine' || form.courierProvider === 'guepex'
                      ? 'X-API-TOKEN (التوكن السري)'
                      : 'API Token / التوكن السري'}
                  </label>
                  <div className="relative">
                    <input
                      type={showCourierToken ? 'text' : 'password'}
                      dir="ltr"
                      value={form.courierApiToken || ''}
                      onChange={e => setForm({ ...form, courierApiToken: e.target.value })}
                      placeholder="أدخل التوكن من لوحة شركة التوصيل"
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCourierToken(!showCourierToken)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showCourierToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1">ولاية الإرسال (المخزن)</label>
                  <select
                    value={form.courierFromWilayaId || '16'}
                    onChange={e => {
                      const w = ALGERIA_WILAYAS.find(x => x.id === e.target.value);
                      setForm({
                        ...form,
                        courierFromWilayaId: e.target.value,
                        courierFromWilayaName: w?.nameAr || 'الجزائر العاصمة'
                      });
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold"
                  >
                    {ALGERIA_WILAYAS.map(w => (
                      <option key={w.id} value={w.id}>
                        {w.code} - {w.nameAr}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1">
                    {form.courierProvider === 'ecotrack'
                      ? 'رابط منصة التوصيل (URL de la plateforme)'
                      : 'اسم المرسل / رابط API مخصص (اختياري)'}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={form.courierBaseUrl || ''}
                    onChange={e => setForm({ ...form, courierBaseUrl: e.target.value })}
                    placeholder={courierMeta.defaultBaseUrl}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={Boolean(form.courierAutoSendOnConfirm)}
                  onChange={e => setForm({ ...form, courierAutoSendOnConfirm: e.target.checked })}
                  className="w-4 h-4 accent-emerald-600 rounded"
                />
                <span>إرسال الطرد تلقائياً لشركة التوصيل وتوليد رمز التتبع عند ترقية أي طلب إلى "التأكيد"</span>
              </label>

              {courierFeedback && (
                <div
                  className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 ${
                    courierFeedback.ok
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                      : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {courierFeedback.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                    <span>{courierFeedback.message}</span>
                  </div>
                  {courierFeedback.latencyMs !== undefined && (
                    <span className="font-mono text-[10px] opacity-80">{courierFeedback.latencyMs}ms</span>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* 2. META CONVERSIONS API (CAPI) + TIKTOK PIXEL / EVENTS API */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Meta CAPI */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-600" />
                  <span>2. Meta Pixel & Conversions API (CAPI)</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  تتبع سحابي مع إزالة التكرار تلقائياً لتفادي مانعات الإعلانات (AdBlockers)
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleTestTracking('meta')}
                disabled={testingKey === 'meta'}
                className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-60"
              >
                {testingKey === 'meta' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
                <span>اختبار Meta</span>
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold mb-1">Meta Pixel ID</label>
              <input
                type="text"
                dir="ltr"
                value={form.metaPixelId || ''}
                onChange={e => setForm({ ...form, metaPixelId: e.target.value })}
                placeholder="1130382356394829"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
              />
            </div>

            <label className="flex items-center gap-2.5 text-xs font-bold cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(form.metaCapiEnabled)}
                onChange={e => setForm({ ...form, metaCapiEnabled: e.target.checked })}
                className="w-4 h-4 accent-blue-600 rounded"
              />
              <span>تفعيل الإرسال المباشر عبر السيرفر (Conversions API)</span>
            </label>

            <div>
              <label className="block text-xs font-bold mb-1">CAPI Access Token</label>
              <div className="relative">
                <input
                  type={showMetaToken ? 'text' : 'password'}
                  dir="ltr"
                  value={form.metaCapiToken || ''}
                  onChange={e => setForm({ ...form, metaCapiToken: e.target.value })}
                  placeholder="EAA..."
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowMetaToken(!showMetaToken)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                >
                  {showMetaToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold mb-1">Test Event Code (اختياري لزر "اختبار Meta" فقط)</label>
              <input
                type="text"
                dir="ltr"
                value={form.metaTestEventCode || ''}
                onChange={e => setForm({ ...form, metaTestEventCode: e.target.value })}
                placeholder="TEST12345"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                يُستخدم فقط عند الضغط على زر «اختبار Meta» ولا يُرسل مع طلبات الزبائن الحقيقية حتى تُحتسب في Ads Manager.
              </p>
            </div>

            {metaFeedback && (
              <div
                className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 ${
                  metaFeedback.ok
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 text-emerald-800 dark:text-emerald-200'
                    : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 text-rose-800 dark:text-rose-200'
                }`}
              >
                <span>{metaFeedback.message}</span>
                {metaFeedback.latencyMs !== undefined && <span className="font-mono text-[10px]">{metaFeedback.latencyMs}ms</span>}
              </div>
            )}
          </div>

          {/* TikTok Pixel & Events API */}
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-rose-600" />
                  <span>3. TikTok Pixel & Events API</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  تتبع زيارات وطلبات TikTok Ads بدقة (المتصفح + Events API)
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleTestTracking('tiktok')}
                disabled={testingKey === 'tiktok'}
                className="px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white text-[11px] font-bold flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-60"
              >
                {testingKey === 'tiktok' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5 text-rose-400" />}
                <span>اختبار TikTok</span>
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold mb-1">TikTok Pixel ID</label>
              <input
                type="text"
                dir="ltr"
                value={form.tiktokPixelId || ''}
                onChange={e => setForm({ ...form, tiktokPixelId: e.target.value })}
                placeholder="C9XXXXXXXXXXXXXX"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
              />
            </div>

            <label className="flex items-center gap-2.5 text-xs font-bold cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(form.tiktokEventsEnabled)}
                onChange={e => setForm({ ...form, tiktokEventsEnabled: e.target.checked })}
                className="w-4 h-4 accent-rose-600 rounded"
              />
              <span>تفعيل TikTok Events API (عبر السيرفر)</span>
            </label>

            <div>
              <label className="block text-xs font-bold mb-1">TikTok Access Token</label>
              <div className="relative">
                <input
                  type={showTikTokToken ? 'text' : 'password'}
                  dir="ltr"
                  value={form.tiktokEventsToken || ''}
                  onChange={e => setForm({ ...form, tiktokEventsToken: e.target.value })}
                  placeholder="أدخل Access Token من TikTok Events Manager"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowTikTokToken(!showTikTokToken)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                >
                  {showTikTokToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold mb-1">TikTok Test Event Code (اختياري)</label>
              <input
                type="text"
                dir="ltr"
                value={form.tiktokTestEventCode || ''}
                onChange={e => setForm({ ...form, tiktokTestEventCode: e.target.value })}
                placeholder="TEST98765"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
              />
            </div>

            {tiktokFeedback && (
              <div
                className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 ${
                  tiktokFeedback.ok
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 text-emerald-800 dark:text-emerald-200'
                    : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 text-rose-800 dark:text-rose-200'
                }`}
              >
                <span>{tiktokFeedback.message}</span>
                {tiktokFeedback.latencyMs !== undefined && <span className="font-mono text-[10px]">{tiktokFeedback.latencyMs}ms</span>}
              </div>
            )}
          </div>
        </section>

        {/* 3. GOOGLE SHEETS DIAGNOSTICS */}
        <section className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>4. Google Sheets & تشخيص المزامنة الثنائية</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                تحقق مباشرة من صلاحيات النشر ("Anyone") واستجابة JSON وقراءة الطلبات من الجدول
              </p>
            </div>
            <button
              type="button"
              onClick={handleTestSheet}
              disabled={testingKey === 'sheet'}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              {testingKey === 'sheet' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
              <span>اختبار الاتصال بـ Google Sheet</span>
            </button>
          </div>

          <div>
            <label className="block text-xs font-bold mb-1">رابط Google Apps Script Webhook الافتراضي</label>
            <input
              type="url"
              dir="ltr"
              value={form.googleSheetWebhook || ''}
              onChange={e => setForm({ ...form, googleSheetWebhook: e.target.value })}
              placeholder="https://script.google.com/macros/s/.../exec"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
            />
          </div>

          {sheetFeedback && (
            <div
              className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 ${
                sheetFeedback.ok
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 text-emerald-800 dark:text-emerald-200'
                  : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 text-rose-800 dark:text-rose-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {sheetFeedback.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                <span>{sheetFeedback.message}</span>
              </div>
              {sheetFeedback.latencyMs !== undefined && <span className="font-mono text-[10px]">{sheetFeedback.latencyMs}ms</span>}
            </div>
          )}

          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowAppsScriptCode(!showAppsScriptCode)}
              className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 cursor-pointer"
            >
              {showAppsScriptCode ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              <span>عرض كود Google Apps Script الكامل (مزامنة ثنائية doPost + doGet + onEdit)</span>
            </button>

            {showAppsScriptCode && (
              <div className="mt-3 rounded-xl bg-slate-950 text-slate-200 p-4 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">انسخ الكود وألصقه في Extensions &gt; Apps Script ثم انشره كـ Web App (Anyone)</span>
                  <button
                    type="button"
                    onClick={() => handleCopyText('gas', GOOGLE_APPS_SCRIPT_TEMPLATE)}
                    className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    {copiedKey === 'gas' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'gas' ? 'تم النسخ' : 'نسخ الكود'}</span>
                  </button>
                </div>
                <pre dir="ltr" className="text-[11px] font-mono overflow-x-auto max-h-60 leading-relaxed text-emerald-200">
                  {GOOGLE_APPS_SCRIPT_TEMPLATE}
                </pre>
              </div>
            )}
          </div>
        </section>

        {/* 4. WHATSAPP BUSINESS API */}
        <section className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-bold flex items-center gap-2 text-slate-900 dark:text-white">
              <MessageCircle className="w-4 h-4 text-[#25D366]" />
              <span>5. إعدادات WhatsApp Business API (إرسال آلي للزبون — اختياري)</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              استبدل روابط wa.me اليدوية بإرسال رسائل تأكيد الطلب ورمز التتبع تلقائياً عبر API
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {(
              [
                { id: 'none', name: 'يدوي فقط (wa.me)', sub: 'مجاني بدون مفاتيح' },
                { id: 'meta_cloud', name: 'Meta Cloud API', sub: 'واتساب الرسمي v21' },
                { id: 'evolution', name: 'Evolution API', sub: 'بوابة واتساب سحابية' },
                { id: 'webhook', name: 'Webhook مخصص', sub: 'Make / n8n / Zapier' }
              ] as { id: WhatsAppApiProvider; name: string; sub: string }[]
            ).map(opt => (
              <button
                type="button"
                key={opt.id}
                onClick={() => {
                  setForm(prev => ({ ...prev, whatsappProvider: opt.id }));
                  setWaFeedback(null);
                }}
                className={`p-3 rounded-xl border text-right transition-all cursor-pointer ${
                  form.whatsappProvider === opt.id
                    ? 'border-[#25D366] bg-emerald-50/70 dark:bg-emerald-950/40 ring-2 ring-[#25D366]/20'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="font-bold text-xs text-slate-900 dark:text-white">{opt.name}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{opt.sub}</div>
              </button>
            ))}
          </div>

          {form.whatsappProvider !== 'none' && (
            <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {form.whatsappProvider === 'meta_cloud' && (
                  <>
                    <div>
                      <label className="block text-xs font-bold mb-1">Phone Number ID</label>
                      <input
                        type="text"
                        dir="ltr"
                        value={form.whatsappPhoneNumberId || ''}
                        onChange={e => setForm({ ...form, whatsappPhoneNumberId: e.target.value })}
                        placeholder="109876543210..."
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1">اسم القالب المعتمد (اختياري)</label>
                      <input
                        type="text"
                        dir="ltr"
                        value={form.whatsappTemplateName || ''}
                        onChange={e => setForm({ ...form, whatsappTemplateName: e.target.value })}
                        placeholder="order_confirm_ar (اتركه فارغاً للنص الحر)"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                      />
                    </div>
                  </>
                )}

                {(form.whatsappProvider === 'evolution' || form.whatsappProvider === 'webhook') && (
                  <div>
                    <label className="block text-xs font-bold mb-1">
                      {form.whatsappProvider === 'evolution' ? 'رابط خادم Evolution API' : 'رابط Webhook'}
                    </label>
                    <input
                      type="url"
                      dir="ltr"
                      value={form.whatsappApiUrl || ''}
                      onChange={e => setForm({ ...form, whatsappApiUrl: e.target.value })}
                      placeholder="https://..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                    />
                  </div>
                )}

                {form.whatsappProvider === 'evolution' && (
                  <div>
                    <label className="block text-xs font-bold mb-1">اسم الـ Instance</label>
                    <input
                      type="text"
                      dir="ltr"
                      value={form.whatsappInstance || ''}
                      onChange={e => setForm({ ...form, whatsappInstance: e.target.value })}
                      placeholder="bright-dz"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                    />
                  </div>
                )}

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold mb-1">API Access Token / Secret Key</label>
                  <div className="relative">
                    <input
                      type={showWaToken ? 'text' : 'password'}
                      dir="ltr"
                      value={form.whatsappApiToken || ''}
                      onChange={e => setForm({ ...form, whatsappApiToken: e.target.value })}
                      placeholder="أدخل التوكن أو اتركه فارغاً لـ Webhook المفتوح"
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowWaToken(!showWaToken)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    >
                      {showWaToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-4 text-xs font-bold">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(form.whatsappAutoSendOnOrder)}
                    onChange={e => setForm({ ...form, whatsappAutoSendOnOrder: e.target.checked })}
                    className="w-4 h-4 accent-emerald-600 rounded"
                  />
                  <span>إرسال رسالة تلقائية للزبون فور تسجيل الطلب</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(form.whatsappAutoSendOnShipping)}
                    onChange={e => setForm({ ...form, whatsappAutoSendOnShipping: e.target.checked })}
                    className="w-4 h-4 accent-emerald-600 rounded"
                  />
                  <span>إرسال رمز التتبع تلقائياً عند الترقية إلى "في شركة التوصيل"</span>
                </label>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2">
                <input
                  type="text"
                  dir="ltr"
                  value={waTestPhone}
                  onChange={e => setWaTestPhone(e.target.value)}
                  placeholder="رقم هاتف الاختبار (اختياري مثال: 0798353165)"
                  className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={handleTestWhatsApp}
                  disabled={testingKey === 'whatsapp'}
                  className="px-4 py-2 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {testingKey === 'whatsapp' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>اختبار WhatsApp API</span>
                </button>
              </div>

              {waFeedback && (
                <div
                  className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 ${
                    waFeedback.ok
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 text-emerald-800 dark:text-emerald-200'
                      : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 text-rose-800 dark:text-rose-200'
                  }`}
                >
                  <span>{waFeedback.message}</span>
                  {waFeedback.latencyMs !== undefined && <span className="font-mono text-[10px]">{waFeedback.latencyMs}ms</span>}
                </div>
              )}
            </div>
          )}
        </section>

        {/* 6. ONLINE PAYMENTS (CHARGILY PAY V2 + BARIDIMOB MANUAL) */}
        <section className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                <CreditCard className="w-4 h-4 text-emerald-600" />
                <span>6. الدفع الإلكتروني للزبائن (البطاقة الذهبية Chargily + بريدي موب)</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                إلى جانب الدفع عند الاستلام، مكّن زبائنك من الدفع بالبطاقة الذهبية أو عبر تحويل بريدي موب وإرفاق الوصل.
              </p>
            </div>
            {!allowOnlinePayment && onGoToBilling && (
              <button
                type="button"
                onClick={onGoToBilling}
                className="px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>ترقية الباقة لتفعيل الدفع الإلكتروني</span>
              </button>
            )}
          </div>

          {!allowOnlinePayment && (
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200">
              باقتك المجانية تدعم الدفع عند الاستلام فقط. يمكنك تهيئة الإعدادات هنا، وسيتم تفعيل بوابات الدفع الإلكتروني على صفحات الهبوط فور الترقية لباقة الاحترافي أو الأعمال.
            </div>
          )}

          {/* Chargily Pay v2 */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/70 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-extrabold text-slate-900 dark:text-white">
                  بوابة Chargily Pay v2 (البطاقة الذهبية + CIB)
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  المفتاح السري يُخزن على الخادم فقط ولا يُرسل أبداً إلى متصفح الزبون.
                </div>
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-bold">
                <input
                  type="checkbox"
                  checked={Boolean(form.chargilyEnabled)}
                  onChange={e => setForm({ ...form, chargilyEnabled: e.target.checked })}
                  className="w-4 h-4 accent-emerald-600 rounded"
                />
                <span>{form.chargilyEnabled ? 'مفعّل' : 'معطّل'}</span>
              </label>
            </div>

            {form.chargilyEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200/80 dark:border-slate-700/60">
                <div>
                  <label className="block text-xs font-bold mb-1">بيئة التشغيل</label>
                  <select
                    value={form.chargilyMode || 'test'}
                    onChange={e =>
                      setForm({ ...form, chargilyMode: e.target.value as 'test' | 'live' })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold"
                  >
                    <option value="test">وضع الاختبار (Test Mode)</option>
                    <option value="live">الوضع الحقيقي (Live Production)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1">المفتاح السري (Chargily Secret Key)</label>
                  <div className="relative">
                    <input
                      type={showChargilyKey ? 'text' : 'password'}
                      dir="ltr"
                      value={form.chargilyApiKey || ''}
                      onChange={e => setForm({ ...form, chargilyApiKey: e.target.value })}
                      placeholder="test_sk_... أو live_sk_..."
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowChargilyKey(!showChargilyKey)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer"
                    >
                      {showChargilyKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label className="block text-xs font-bold">
                    رابط الإشعار الفوري (Webhook URL) — أضفه في لوحة Chargily
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      dir="ltr"
                      value={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/payments/chargily/webhook?storeId=${encodeURIComponent(store.id)}`}
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-950 text-[11px] font-mono text-slate-600 dark:text-slate-300"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const url = `${window.location.origin}/api/payments/chargily/webhook?storeId=${encodeURIComponent(store.id)}`;
                        void navigator.clipboard?.writeText(url);
                        setCopiedKey('chargily_webhook');
                        setTimeout(() => setCopiedKey(null), 2000);
                      }}
                      className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{copiedKey === 'chargily_webhook' ? 'تم النسخ' : 'نسخ'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* BaridiMob / CCP Manual Transfer */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/70 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>التحويل اليدوي عبر بريدي موب / CCP (مع رفع الوصل)</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  يعرض للزبون رقم الـ RIP الخاص بك ويمكنه إرفاق صورة الوصل مباشرة لتراجعها وتؤكدها من تبويب الطلبات.
                </div>
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-bold">
                <input
                  type="checkbox"
                  checked={Boolean(form.baridimobEnabled)}
                  onChange={e => setForm({ ...form, baridimobEnabled: e.target.checked })}
                  className="w-4 h-4 accent-emerald-600 rounded"
                />
                <span>{form.baridimobEnabled ? 'مفعّل' : 'معطّل'}</span>
              </label>
            </div>

            {form.baridimobEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200/80 dark:border-slate-700/60">
                <div>
                  <label className="block text-xs font-bold mb-1">رقم الـ RIP (20 رقماً)</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={form.baridimobRip || ''}
                    onChange={e => setForm({ ...form, baridimobRip: e.target.value })}
                    placeholder="0079999900XXXXXXXXXX"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">اسم صاحب الحساب البريدي</label>
                  <input
                    type="text"
                    value={form.baridimobAccountName || ''}
                    onChange={e => setForm({ ...form, baridimobAccountName: e.target.value })}
                    placeholder="مثال: محمد أمين بن علي"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold mb-1">تعليمات التحويل للزبون (اختياري)</label>
                  <textarea
                    rows={2}
                    value={form.baridimobInstructions || ''}
                    onChange={e => setForm({ ...form, baridimobInstructions: e.target.value })}
                    placeholder="حوّل المبلغ إلى الحساب أعلاه وأرفق صورة وصل بريدي موب لتأكيد طلبك وشحنه فوراً."
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 7. MERCHANT INSTANT ALERTS (TELEGRAM + WHATSAPP + SMS) */}
        <section className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
          <div>
            <h3 className="text-sm font-bold flex items-center gap-2 text-slate-900 dark:text-white">
              <Bell className="w-4 h-4 text-emerald-600" />
              <span>7. تنبيهات التاجر الفورية (تيليغرام + واتساب + الرسائل القصيرة SMS)</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              استلم رسالة فورية على هاتفك أو مجموعة فريق العمل فور دخول طلبية جديدة أو وصول دفع إلكتروني أو طلبية متروكة. جميع المفاتيح تُحفظ على الخادم فقط.
            </p>
          </div>

          {/* Event Toggles */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/70 space-y-2.5">
            <div className="text-xs font-extrabold text-slate-800 dark:text-slate-100">
              الأحداث التي تُرسل عنها إشعارات فورية:
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.merchantAlertsOnNewOrder !== false}
                  onChange={e =>
                    setForm({ ...form, merchantAlertsOnNewOrder: e.target.checked })
                  }
                  className="w-4 h-4 accent-emerald-600 rounded"
                />
                <span>طلبية جديدة</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.merchantAlertsOnPayment !== false}
                  onChange={e =>
                    setForm({ ...form, merchantAlertsOnPayment: e.target.checked })
                  }
                  className="w-4 h-4 accent-emerald-600 rounded"
                />
                <span>وصل أو تأكيد دفع إلكتروني</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.merchantAlertsOnAbandoned !== false}
                  onChange={e =>
                    setForm({ ...form, merchantAlertsOnAbandoned: e.target.checked })
                  }
                  className="w-4 h-4 accent-emerald-600 rounded"
                />
                <span>طلبية متروكة (مرّة واحدة لكل جلسة)</span>
              </label>
            </div>
          </div>

          {/* 7A. Telegram Bot Alerts */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/70 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5 text-sky-600" />
                  <span>تنبيهات تيليغرام (مجاني وفوري — يدعم عدة حسابات أو مجموعات)</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  أنشئ بوت عبر BotFather واحصل على معرف المحادثة (Chat ID) الخاص بك أو بمجموعة فريق التأكيد.
                </div>
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-bold shrink-0">
                <input
                  type="checkbox"
                  checked={Boolean(form.telegramAlertsEnabled)}
                  onChange={e => setForm({ ...form, telegramAlertsEnabled: e.target.checked })}
                  className="w-4 h-4 accent-emerald-600 rounded"
                />
                <span>{form.telegramAlertsEnabled ? 'مفعّل' : 'معطّل'}</span>
              </label>
            </div>

            {form.telegramAlertsEnabled && (
              <div className="space-y-3 pt-2 border-t border-slate-200/80 dark:border-slate-700/60">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold mb-1">رمز البوت (Telegram Bot Token)</label>
                    <div className="relative">
                      <input
                        type={showTelegramToken ? 'text' : 'password'}
                        dir="ltr"
                        value={form.telegramBotToken || ''}
                        onChange={e => setForm({ ...form, telegramBotToken: e.target.value })}
                        placeholder="123456789:AAH..."
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowTelegramToken(!showTelegramToken)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer"
                      >
                        {showTelegramToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold">معرفات المحادثات / المجموعات (Chat IDs)</label>
                      <span className="text-[11px] text-slate-500 tabular-nums">
                        المستلمون: {countRecipients(form.telegramChatIds)}
                      </span>
                    </div>
                    <textarea
                      rows={2}
                      dir="ltr"
                      value={form.telegramChatIds || ''}
                      onChange={e => setForm({ ...form, telegramChatIds: e.target.value })}
                      placeholder={"123456789\n-1009876543210"}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      افصل بين المعرفات بفاصلة أو سطر جديد (لا تنسَ الضغط على Start في البوت أولاً).
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={testingKey === 'alert_telegram'}
                    onClick={() => handleTestMerchantAlert('telegram')}
                    className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    {testingKey === 'alert_telegram' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>إرسال رسالة تجريبية إلى تيليغرام</span>
                  </button>
                </div>

                {telegramFeedback && (
                  <div
                    className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 ${
                      telegramFeedback.ok
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                        : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                    }`}
                  >
                    <span>{telegramFeedback.message}</span>
                    {telegramFeedback.latencyMs !== undefined && (
                      <span className="font-mono text-[10px] tabular-nums">
                        {telegramFeedback.latencyMs}ms
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 7B. Merchant WhatsApp Alerts */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/70 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <MessageCircle className="w-3.5 h-3.5 text-[#25D366]" />
                  <span>تنبيهات واتساب للتاجر والفريق (عدة أرقام)</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  استقبل تنبيه الطلبات مباشرة على أرقام واتساب الخاصة بك أو بموظفي التأكيد.
                </div>
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-bold shrink-0">
                <input
                  type="checkbox"
                  checked={Boolean(form.merchantWhatsappAlertsEnabled)}
                  onChange={e =>
                    setForm({ ...form, merchantWhatsappAlertsEnabled: e.target.checked })
                  }
                  className="w-4 h-4 accent-emerald-600 rounded"
                />
                <span>{form.merchantWhatsappAlertsEnabled ? 'مفعّل' : 'معطّل'}</span>
              </label>
            </div>

            {form.merchantWhatsappAlertsEnabled && (
              <div className="space-y-3 pt-2 border-t border-slate-200/80 dark:border-slate-700/60">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {(
                    [
                      {
                        id: 'store_api',
                        title: 'عبر ربط واتساب المتجر (القسم 5)',
                        desc: 'يستخدم Meta Cloud أو Evolution أو Webhook المهيأ أعلاه'
                      },
                      {
                        id: 'callmebot',
                        title: 'تنبيه شخصي مجاني (CallMeBot)',
                        desc: 'بدون حساب أعمال — فقط الرقم ومفتاح التنبيه لكل مستلم'
                      }
                    ] as Array<{ id: MerchantAlertWhatsAppMode; title: string; desc: string }>
                  ).map(opt => (
                    <button
                      type="button"
                      key={opt.id}
                      onClick={() => {
                        setForm(prev => ({ ...prev, merchantWhatsappMode: opt.id }));
                        setMerchantWaFeedback(null);
                      }}
                      className={`p-3 rounded-xl border text-right transition-colors cursor-pointer ${
                        (form.merchantWhatsappMode || 'store_api') === opt.id
                          ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/30'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                      }`}
                    >
                      <div className="text-xs font-bold text-slate-900 dark:text-white">{opt.title}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold">
                      {(form.merchantWhatsappMode || 'store_api') === 'callmebot'
                        ? 'الأرقام ومفاتيح التنبيه (كل مستلم بصيغة الرقم:المفتاح)'
                        : 'أرقام واتساب المستلمة (رقم التاجر وفريق العمل)'}
                    </label>
                    <span className="text-[11px] text-slate-500 tabular-nums">
                      المستلمون: {countRecipients(form.merchantWhatsappRecipients)}
                    </span>
                  </div>
                  <textarea
                    rows={2}
                    dir="ltr"
                    value={form.merchantWhatsappRecipients || ''}
                    onChange={e =>
                      setForm({ ...form, merchantWhatsappRecipients: e.target.value })
                    }
                    placeholder={
                      (form.merchantWhatsappMode || 'store_api') === 'callmebot'
                        ? '213550123456:1234567\n213770987654:7654321'
                        : '0550123456\n0770987654'
                    }
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    {(form.merchantWhatsappMode || 'store_api') === 'callmebot'
                      ? 'افصل بين كل مستلم وآخر بسطر جديد أو فاصلة بصيغة 213XXXXXXXXX:APIKEY.'
                      : 'افصل بين الأرقام بفاصلة أو سطر جديد، ويُحوّل الرقم الجزائري تلقائياً إلى الصيغة الدولية.'}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={testingKey === 'alert_whatsapp'}
                  onClick={() => handleTestMerchantAlert('whatsapp')}
                  className="px-4 py-2 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {testingKey === 'alert_whatsapp' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>إرسال رسالة تجريبية إلى واتساب التاجر</span>
                </button>

                {merchantWaFeedback && (
                  <div
                    className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 ${
                      merchantWaFeedback.ok
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                        : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                    }`}
                  >
                    <span>{merchantWaFeedback.message}</span>
                    {merchantWaFeedback.latencyMs !== undefined && (
                      <span className="font-mono text-[10px] tabular-nums">
                        {merchantWaFeedback.latencyMs}ms
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 7C. SMS Alerts */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/70 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                  <span>تنبيهات الرسائل القصيرة SMS (تصل حتى بدون إنترنت)</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  يدعم Twilio و Vonage أو أي بوابة رسائل جزائرية / تطبيق بوابة SMS عبر الهاتف (Webhook).
                </div>
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-bold shrink-0">
                <input
                  type="checkbox"
                  checked={Boolean(form.smsAlertsEnabled)}
                  onChange={e => setForm({ ...form, smsAlertsEnabled: e.target.checked })}
                  className="w-4 h-4 accent-emerald-600 rounded"
                />
                <span>{form.smsAlertsEnabled ? 'مفعّل' : 'معطّل'}</span>
              </label>
            </div>

            {form.smsAlertsEnabled && (
              <div className="space-y-4 pt-2 border-t border-slate-200/80 dark:border-slate-700/60">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {(
                    [
                      { id: 'twilio', name: 'Twilio SMS', sub: 'بوابة دولية موثوقة' },
                      { id: 'vonage', name: 'Vonage (Nexmo)', sub: 'يدعم العربية Unicode' },
                      { id: 'webhook', name: 'بوابة مخصصة / أندرويد', sub: 'مزود محلي أو رابط HTTP' }
                    ] as Array<{ id: MerchantAlertSmsProvider; name: string; sub: string }>
                  ).map(opt => (
                    <button
                      type="button"
                      key={opt.id}
                      onClick={() => {
                        setForm(prev => ({ ...prev, smsProvider: opt.id }));
                        setSmsFeedback(null);
                      }}
                      className={`p-3 rounded-xl border text-right transition-colors cursor-pointer ${
                        (form.smsProvider || 'twilio') === opt.id
                          ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/30'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                      }`}
                    >
                      <div className="text-xs font-bold text-slate-900 dark:text-white">{opt.name}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{opt.sub}</div>
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {(form.smsProvider || 'twilio') === 'webhook' ? (
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold mb-1">
                        رابط بوابة الرسائل القصيرة (SMS Webhook URL)
                      </label>
                      <input
                        type="url"
                        dir="ltr"
                        value={form.smsWebhookUrl || ''}
                        onChange={e => setForm({ ...form, smsWebhookUrl: e.target.value })}
                        placeholder="https://your-sms-gateway.example.com/send"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-bold mb-1">
                        {(form.smsProvider || 'twilio') === 'twilio'
                          ? 'Account SID'
                          : 'Vonage API Key'}
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        value={form.smsAccountSid || ''}
                        onChange={e => setForm({ ...form, smsAccountSid: e.target.value })}
                        placeholder={
                          (form.smsProvider || 'twilio') === 'twilio' ? 'ACxxxxxxxx...' : 'API Key'
                        }
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold mb-1">
                      {(form.smsProvider || 'twilio') === 'twilio'
                        ? 'Auth Token'
                        : (form.smsProvider || 'twilio') === 'vonage'
                          ? 'API Secret'
                          : 'رمز التوثيق السري (اختياري)'}
                    </label>
                    <div className="relative">
                      <input
                        type={showSmsSecret ? 'text' : 'password'}
                        dir="ltr"
                        value={form.smsAuthToken || ''}
                        onChange={e => setForm({ ...form, smsAuthToken: e.target.value })}
                        placeholder="••••••••••••"
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSmsSecret(!showSmsSecret)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer"
                      >
                        {showSmsSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold mb-1">
                      {(form.smsProvider || 'twilio') === 'twilio'
                        ? 'رقم المرسل (From Number)'
                        : 'اسم أو رقم المرسل (Sender ID)'}
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={form.smsFromNumber || ''}
                      onChange={e => setForm({ ...form, smsFromNumber: e.target.value })}
                      placeholder={
                        (form.smsProvider || 'twilio') === 'twilio' ? '+15017122661' : 'MyStore'
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold">
                        أرقام الهواتف المستلمة للرسائل القصيرة (تُنسق تلقائياً للجزائر +213)
                      </label>
                      <span className="text-[11px] text-slate-500 tabular-nums">
                        المستلمون: {countRecipients(form.smsRecipients)}
                      </span>
                    </div>
                    <textarea
                      rows={2}
                      dir="ltr"
                      value={form.smsRecipients || ''}
                      onChange={e => setForm({ ...form, smsRecipients: e.target.value })}
                      placeholder={'0550123456\n0661234567'}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  disabled={testingKey === 'alert_sms'}
                  onClick={() => handleTestMerchantAlert('sms')}
                  className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {testingKey === 'alert_sms' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>إرسال رسالة SMS تجريبية الآن</span>
                </button>

                {smsFeedback && (
                  <div
                    className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 ${
                      smsFeedback.ok
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                        : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                    }`}
                  >
                    <span>{smsFeedback.message}</span>
                    {smsFeedback.latencyMs !== undefined && (
                      <span className="font-mono text-[10px] tabular-nums">
                        {smsFeedback.latencyMs}ms
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>حفظ جميع إعدادات الـ API</span>
          </button>
        </div>
      </form>

      {/* 5. LIVE DIAGNOSTICS LOG */}
      <section className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold flex items-center gap-2 text-slate-900 dark:text-white">
            <Terminal className="w-4 h-4 text-emerald-600" />
            <span>سجل تشخيص الاتصال والأحداث الأخيرة</span>
          </h3>
          {(form.diagnosticLogs?.length || 0) > 0 && (
            <button
              type="button"
              onClick={onClearLogs}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-500 hover:text-rose-600 flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>مسح السجل</span>
            </button>
          )}
        </div>

        {!form.diagnosticLogs || form.diagnosticLogs.length === 0 ? (
          <div className="p-6 text-center rounded-xl bg-slate-50 dark:bg-slate-800/40 text-xs text-slate-400">
            لم يتم إجراء أي اختبار اتصال بعد. اضغط على أي زر "اختبار" أعلاه لعرض النتيجة وزمن الاستجابة هنا.
          </div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {form.diagnosticLogs.map(log => (
              <div
                key={log.id}
                className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {log.status === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  )}
                  <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-[10px] font-mono font-bold uppercase shrink-0">
                    {log.service}
                  </span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">{log.message}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono shrink-0">
                  {log.latencyMs !== undefined && <span>{log.latencyMs}ms</span>}
                  <span>{new Date(log.timestamp).toLocaleTimeString('ar-DZ')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
