import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, Store, UserRole, StaffRole, TeamMember } from '../types';
import { storage } from './storage';
import { platformApi } from './platformApi';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { isValidCustomDomain, normalizeDomainHost } from '../utils/urlRouting';

interface AuthContextType {
  currentUser: User | null;
  currentStore: Store | null;
  activeRole: UserRole;
  staffRole: StaffRole;
  activeStaffMember: TeamMember | null;
  isSupabaseMode: boolean;
  hasSupabaseEnv: boolean;
  isLoading: boolean;
  currentSubdomain: string;
  setCurrentSubdomain: (subdomain: string) => void;
  enableDemoPreview: (enabled: boolean) => Promise<void>;
  login: (email: string, password?: string) => Promise<{ success: boolean; error?: string }>;
  loginAsStaff: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  clearStaffSession: () => Promise<void>;
  registerOwner: (params: {
    name: string;
    email: string;
    password: string;
    phone?: string;
  }) => Promise<{ success: boolean; error?: string; needsEmailConfirmation?: boolean }>;
  logout: () => Promise<void>;
  setupPrivateStore: (params: {
    storeName: string;
    subdomain: string;
    phone: string;
    customDomain?: string;
  }) => Promise<{ success: boolean; error?: string; store?: Store }>;
  refreshCurrentStore: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentStore, setCurrentStore] = useState<Store | null>(null);
  const [activeRole, setActiveRole] = useState<UserRole>('merchant');
  const [activeStaffMember, setActiveStaffMember] = useState<TeamMember | null>(null);
  const [demoOverride, setDemoOverride] = useState<boolean>(() => storage.isDemoOverride());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [currentSubdomain, setCurrentSubdomain] = useState<string>('bright-dz');

  const staffRole: StaffRole = activeStaffMember ? activeStaffMember.role : 'owner';

  const effectiveSupabaseMode = isSupabaseConfigured && !demoOverride;

  const loadSupabaseUserData = useCallback(async (userId: string, email: string) => {
    if (!supabase) return;
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      const userRole = (profile?.role === 'admin' ? 'admin' : 'merchant') as UserRole;
      setCurrentUser({
        id: userId,
        name: profile?.name || email.split('@')[0],
        email,
        phone: profile?.phone || '',
        role: userRole,
        storeId: profile?.store_id
      });
      setActiveRole(userRole);

      let storeQuery = supabase.from('stores').select('*');
      if (profile?.store_id) {
        storeQuery = storeQuery.eq('id', profile.store_id);
      } else {
        storeQuery = storeQuery.eq('owner_id', userId);
      }

      const { data: storeData } = await storeQuery.order('created_at', { ascending: true }).limit(1).maybeSingle();
      if (storeData) {
        const fetched = await storage.getStoreById(storeData.id);
        if (fetched) {
          setCurrentStore(fetched);
          setCurrentSubdomain(fetched.subdomain);
        }
      } else {
        setCurrentStore(null);
      }
    } catch (err) {
      console.error('Error loading Supabase user data:', err);
    }
  }, []);

  const loadLocalDemo = useCallback(() => {
    const users = storage.getUsers();
    const owner = users[0] || null;
    setCurrentUser(owner);
    setActiveRole('merchant');

    const localStores = storage.getLocalStores();
    if (localStores.length > 0) {
      setCurrentStore(localStores[0]);
      setCurrentSubdomain(localStores[0].subdomain);
    } else {
      setCurrentStore(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    let subscription: { unsubscribe: () => void } | null = null;

    async function initAuth() {
      setIsLoading(true);
      if (effectiveSupabaseMode && supabase) {
        try {
          const [{ data: { session } }, resolved] = await Promise.all([
            supabase.auth.getSession(),
            storage.resolveStoreForRequest()
          ]);
          if (resolved.store && mounted) {
            setCurrentStore(resolved.store);
            setCurrentSubdomain(resolved.store.subdomain);
          }
          if (session?.user && mounted) {
            await loadSupabaseUserData(session.user.id, session.user.email || '');
          } else if (mounted) {
            setCurrentUser(null);
            setActiveRole('visitor');
          }
        } catch (err) {
          console.error('Supabase init error:', err);
        } finally {
          if (mounted) setIsLoading(false);
        }

        const res = supabase.auth.onAuthStateChange(async (_event, session) => {
          if (!mounted || storage.isDemoOverride()) return;
          if (session?.user) {
            await loadSupabaseUserData(session.user.id, session.user.email || '');
          } else {
            setCurrentUser(null);
            setActiveRole('visitor');
          }
        });
        subscription = res.data.subscription;
      } else {
        loadLocalDemo();
        if (mounted) setIsLoading(false);
      }
    }

    initAuth();
    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [effectiveSupabaseMode, loadSupabaseUserData, loadLocalDemo]);

  const enableDemoPreview = async (enabled: boolean) => {
    storage.setDemoOverride(enabled);
    setDemoOverride(enabled);
    if (enabled) {
      loadLocalDemo();
    }
  };

  const refreshCurrentStore = async () => {
    if (currentStore?.id) {
      const updated = await storage.getStoreById(currentStore.id);
      if (updated) setCurrentStore(updated);
    } else {
      const primary = await storage.getPrimaryStore();
      if (primary) setCurrentStore(primary);
    }
  };

  const login = async (email: string, password?: string): Promise<{ success: boolean; error?: string }> => {
    if (effectiveSupabaseMode && supabase) {
      if (!password) return { success: false, error: 'يرجى إدخال كلمة المرور' };
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password
        });
        if (error) {
          const msg = error.message.includes('Invalid login credentials')
            ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
            : error.message;
          return { success: false, error: msg };
        }
        if (data.user) {
          await loadSupabaseUserData(data.user.id, data.user.email || email);
          return { success: true };
        }
        return { success: false, error: 'تعذر تسجيل الدخول' };
      } catch {
        return { success: false, error: 'حدث خطأ أثناء تسجيل الدخول.' };
      }
    }

    const owner = storage.getUsers()[0];
    if (owner) {
      setCurrentUser(owner);
      setActiveRole('merchant');
      const primary = storage.getLocalStores()[0];
      if (primary) setCurrentStore(primary);
      return { success: true };
    }
    return { success: false, error: 'الحساب غير موجود' };
  };

  const registerOwner = async (params: {
    name: string;
    email: string;
    password: string;
    phone?: string;
  }): Promise<{ success: boolean; error?: string; needsEmailConfirmation?: boolean }> => {
    if (effectiveSupabaseMode && supabase) {
      try {
        const { data, error } = await supabase.auth.signUp({
          email: params.email.trim().toLowerCase(),
          password: params.password,
          options: {
            data: {
              name: params.name.trim(),
              phone: params.phone?.trim() || ''
            }
          }
        });
        if (error) {
          const msg = error.message.includes('already registered')
            ? 'هذا البريد الإلكتروني مسجل مسبقاً، يمكنك تسجيل الدخول مباشرة'
            : error.message;
          return { success: false, error: msg };
        }
        if (data.user && !data.session) {
          return {
            success: true,
            needsEmailConfirmation: true
          };
        }
        if (data.user && data.session) {
          await loadSupabaseUserData(data.user.id, data.user.email || params.email);
          return { success: true };
        }
        return { success: false, error: 'تعذر إنشاء الحساب، يرجى المحاولة مجدداً' };
      } catch {
        return { success: false, error: 'حدث خطأ أثناء إنشاء الحساب.' };
      }
    }
    return { success: true };
  };

  const loginAsStaff = async (
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await platformApi.loginStaff(email, password, currentStore?.id);
      if (!res.ok || !res.member) {
        return { success: false, error: res.message || 'بيانات دخول الموظف غير صحيحة' };
      }
      setActiveStaffMember(res.member);
      setCurrentUser({
        id: res.member.id,
        name: res.member.name,
        email: res.member.email,
        role: 'merchant',
        storeId: res.member.storeId
      });
      setActiveRole('merchant');
      const matchedStore = await storage.getStoreById(res.member.storeId);
      if (matchedStore) {
        setCurrentStore(matchedStore);
        setCurrentSubdomain(matchedStore.subdomain);
      }
      return { success: true };
    } catch {
      return { success: false, error: 'تعذر الاتصال بالخادم لتسجيل دخول الموظف' };
    }
  };

  const clearStaffSession = async () => {
    await platformApi.logoutStaff();
    setActiveStaffMember(null);
    if (!effectiveSupabaseMode) {
      loadLocalDemo();
    }
  };

  const logout = async () => {
    if (activeStaffMember) {
      await platformApi.logoutStaff();
      setActiveStaffMember(null);
    }
    if (effectiveSupabaseMode && supabase) {
      await supabase.auth.signOut();
    }
    setCurrentUser(null);
    setActiveRole('visitor');
  };

  const setupPrivateStore = async (params: {
    storeName: string;
    subdomain: string;
    phone: string;
    customDomain?: string;
  }): Promise<{ success: boolean; error?: string; store?: Store }> => {
    if (!currentUser) return { success: false, error: 'يرجى تسجيل الدخول أولاً' };
    const cleanName = params.storeName.trim();
    if (!cleanName || cleanName.length < 2) {
      return { success: false, error: 'يرجى إدخال اسم صحيح للمتجر' };
    }
    const cleanSubdomain = params.subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!cleanSubdomain || cleanSubdomain.length < 3) {
      return { success: false, error: 'يجب أن يتكون معرف المتجر من 3 أحرف إنجليزية أو أرقام على الأقل' };
    }
    const normalizedDomain = normalizeDomainHost(params.customDomain || '');
    if (params.customDomain?.trim() && !isValidCustomDomain(normalizedDomain)) {
      return { success: false, error: 'صيغة النطاق الخاص غير صحيحة (مثال: myshop.com)' };
    }

    const res = await storage.saveStore({
      id: '',
      ownerId: currentUser.id,
      name: cleanName,
      subdomain: cleanSubdomain,
      customDomain: normalizedDomain,
      description: `مرحباً بكم في متجر ${cleanName}`,
      announcementText: 'توصيل سريع لكافة الـ 58 ولاية | الدفع بعد المعاينة والإستلام',
      brandColor: '#754b2d',
      freeShippingThreshold: 0,
      planId: 'plan_pro',
      status: 'active',
      phone: params.phone.trim(),
      defaultWhatsapp: params.phone.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    if (res.success && res.store) {
      await storage.seedStarterLandingPages(res.store.id);
      setCurrentStore(res.store);
      setCurrentSubdomain(res.store.subdomain);
    }
    return res;
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        currentStore,
        activeRole,
        staffRole,
        activeStaffMember,
        isSupabaseMode: effectiveSupabaseMode,
        hasSupabaseEnv: isSupabaseConfigured,
        isLoading,
        currentSubdomain,
        setCurrentSubdomain,
        enableDemoPreview,
        login,
        loginAsStaff,
        clearStaffSession,
        registerOwner,
        logout,
        setupPrivateStore,
        refreshCurrentStore
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
