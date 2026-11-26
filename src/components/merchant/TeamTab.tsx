import React, { useState, useEffect, useCallback } from 'react';
import { platformApi } from '../../services/platformApi';
import type { StaffRole, Store, TeamMember } from '../../types';
import {
  UserPlus,
  Trash2,
  Shield,
  AlertCircle,
  Loader2,
  X,
  CheckCircle2,
  Power
} from 'lucide-react';

interface Props {
  store: Store;
  maxTeamMembers: number;
  onGoToBilling: () => void;
  onNotify: (msg: string) => void;
  onTeamCountChange?: (count: number) => void;
}

const ROLE_DESCRIPTIONS: Record<
  Exclude<StaffRole, 'owner'>,
  { label: string; scope: string }
> = {
  order_confirmer: {
    label: 'موظف تأكيد الطلبات',
    scope: 'يرى الطلبات والطلبات المتروكة فقط — لا يرى الأرباح أو التكاليف أو الإعدادات أو مفاتيح الربط.'
  },
  catalog_manager: {
    label: 'مدير المنتجات والصفحات',
    scope: 'ينشئ ويعدّل صفحات الهبوط والمخزون فقط — لا يرى الطلبات أو الأرباح أو الإعدادات.'
  }
};

export const TeamTab: React.FC<Props> = ({
  store,
  maxTeamMembers,
  onGoToBilling,
  onNotify,
  onTeamCountChange
}) => {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add Member Modal
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Exclude<StaffRole, 'owner'>>('order_confirmer');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await platformApi.getTeamMembers(store.id);
      if (!res.ok) {
        setError(res.message || 'تعذر تحميل قائمة الفريق');
        return;
      }
      const list = res.members || [];
      setMembers(list);
      onTeamCountChange?.(list.filter(m => m.isActive).length);
    } catch {
      setError('تعذر الاتصال بالخادم حالياً');
    } finally {
      setLoading(false);
    }
  }, [store.id, onTeamCountChange]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const activeStaffCount = members.filter(m => m.isActive).length;
  const seatsUsed = activeStaffCount + 1; // +1 for store owner

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setLimitReached(false);

    if (name.trim().length < 2) {
      setFormError('يرجى إدخال اسم الموظف');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFormError('يرجى إدخال بريد إلكتروني صحيح');
      return;
    }
    if (password.length < 6) {
      setFormError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }

    setSaving(true);
    const res = await platformApi.createTeamMember({
      storeId: store.id,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      role
    });
    setSaving(false);

    if (!res.ok) {
      if (res.code === 'plan_limit_reached') setLimitReached(true);
      setFormError(res.message || 'تعذر إضافة الموظف');
      return;
    }

    setAddOpen(false);
    setName('');
    setEmail('');
    setPassword('');
    setRole('order_confirmer');
    onNotify(`تم إنشاء حساب الموظف «${res.member?.name}» بنجاح`);
    void loadMembers();
  };

  const handleToggleActive = async (m: TeamMember) => {
    const res = await platformApi.updateTeamMember(m.id, {
      storeId: store.id,
      isActive: !m.isActive
    });
    if (!res.ok) {
      onNotify(res.message || 'تعذر تحديث حالة الموظف');
      return;
    }
    onNotify(m.isActive ? `تم تعطيل حساب «${m.name}»` : `تم تفعيل حساب «${m.name}»`);
    void loadMembers();
  };

  const handleChangeRole = async (m: TeamMember, nextRole: Exclude<StaffRole, 'owner'>) => {
    const res = await platformApi.updateTeamMember(m.id, {
      storeId: store.id,
      role: nextRole
    });
    if (!res.ok) {
      onNotify(res.message || 'تعذر تعديل صلاحية الموظف');
      return;
    }
    onNotify(`تم تحديث دور «${m.name}» إلى ${ROLE_DESCRIPTIONS[nextRole].label}`);
    void loadMembers();
  };

  const handleDeleteMember = async (m: TeamMember) => {
    const res = await platformApi.deleteTeamMember(m.id, store.id);
    if (!res.ok) {
      onNotify(res.message || 'تعذر حذف الموظف');
      return;
    }
    onNotify(`تم حذف حساب الموظف «${m.name}»`);
    void loadMembers();
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">الفريق والصلاحيات</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            أضف موظفي تأكيد الطلبات بصلاحيات مقيدة تحمي أرباحك وتكاليفك وإعدادات متجرك.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setFormError(null);
            setLimitReached(false);
            setAddOpen(true);
          }}
          className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-slate-900 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>إضافة موظف جديد</span>
        </button>
      </div>

      {/* Seat Usage + Role Permission Reference */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
          <div className="text-xs text-slate-500 dark:text-slate-400">مقاعد الفريق المستخدمة</div>
          <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {seatsUsed} / {maxTeamMembers}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            يشمل حسابك كمالك المتجر بالإضافة إلى الموظفين النشطين.
          </p>
          {seatsUsed >= maxTeamMembers && (
            <button
              type="button"
              onClick={onGoToBilling}
              className="text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
            >
              ترقية الباقة لزيادة عدد الموظفين ←
            </button>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1.5">
          <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-emerald-600" />
            <span>{ROLE_DESCRIPTIONS.order_confirmer.label}</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {ROLE_DESCRIPTIONS.order_confirmer.scope}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1.5">
          <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
            <span>{ROLE_DESCRIPTIONS.catalog_manager.label}</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {ROLE_DESCRIPTIONS.catalog_manager.scope}
          </p>
        </div>
      </div>

      {/* Staff List Table */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">أعضاء الفريق الحاليون</h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            يدخل الموظف عبر شاشة تسجيل الدخول باختيار «عضو فريق»
          </span>
        </div>

        {loading ? (
          <div className="p-8 flex items-center justify-center text-slate-400 gap-2 text-xs">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>جارٍ تحميل أعضاء الفريق...</span>
          </div>
        ) : error ? (
          <div className="p-6 text-center text-xs text-rose-600 dark:text-rose-400">{error}</div>
        ) : members.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <div className="text-sm font-semibold text-slate-900 dark:text-white">
              لا يوجد موظفون مضافون بعد
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              أضف موظف تأكيد طلبات لتفويض متابعة الزبائن دون مشاركة أرباحك أو إعدادات متجرك.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-950/40">
                  <th className="py-3 px-4 font-semibold">الموظف</th>
                  <th className="py-3 px-4 font-semibold">الدور والصلاحية</th>
                  <th className="py-3 px-4 font-semibold">الحالة</th>
                  <th className="py-3 px-4 font-semibold">آخر دخول</th>
                  <th className="py-3 px-4 font-semibold text-left">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {members.map(m => (
                  <tr key={m.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900 dark:text-white">{m.name}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400" dir="ltr">
                        {m.email}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <select
                        value={m.role}
                        onChange={e =>
                          void handleChangeRole(m, e.target.value as Exclude<StaffRole, 'owner'>)
                        }
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-semibold"
                      >
                        <option value="order_confirmer">موظف تأكيد الطلبات</option>
                        <option value="catalog_manager">مدير المنتجات والصفحات</option>
                      </select>
                    </td>

                    <td className="py-3.5 px-4 font-bold">
                      {m.isActive ? (
                        <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>نشط</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">معطّل</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 tabular-nums">
                      {m.lastLoginAt
                        ? new Date(m.lastLoginAt).toLocaleDateString('ar-DZ')
                        : 'لم يسجل دخوله بعد'}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => void handleToggleActive(m)}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Power className="w-3.5 h-3.5" />
                          <span>{m.isActive ? 'تعطيل' : 'تفعيل'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteMember(m)}
                          className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                          title="حذف الموظف"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Add Staff Modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateMember}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">إضافة عضو فريق جديد</h3>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs space-y-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
                {limitReached && (
                  <button
                    type="button"
                    onClick={() => {
                      setAddOpen(false);
                      onGoToBilling();
                    }}
                    className="underline font-bold cursor-pointer"
                  >
                    الانتقال لترقية الباقة الآن ←
                  </button>
                )}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">اسم الموظف</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="مثال: أمين بن علي"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">البريد الإلكتروني للدخول</label>
                <input
                  type="email"
                  required
                  dir="ltr"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="agent@myshop.dz"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">كلمة المرور (6 أحرف على الأقل)</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  dir="ltr"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">الدور الوظيفي</label>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value as Exclude<StaffRole, 'owner'>)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-semibold"
                >
                  <option value="order_confirmer">موظف تأكيد الطلبات (الطلبات فقط بدون أرباح)</option>
                  <option value="catalog_manager">مدير المنتجات والصفحات</option>
                </select>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  {ROLE_DESCRIPTIONS[role].scope}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-slate-900 text-xs font-bold cursor-pointer disabled:opacity-60"
              >
                {saving ? 'جارٍ الإنشاء...' : 'إنشاء حساب الموظف'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
