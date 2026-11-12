import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Store, UserRole } from '../types';
import { storage } from './storage';
import { supabase, isSupabaseConfigured } from './supabaseClient';

interface RegisterStoreParams {
  storeName: string;
  subdomain: string;
  planId?: string;
  merchantName: string;
  email: string;
  phone: string;
  password?: string;
}

interface AuthContextType {
  currentUser: User | null;
  currentStore: Store | null;
  activeRole: UserRole;
  isSupabaseMode: boolean;
  isLoading: boolean;
  currentSubdomain: string;
  setCurrentSubdomain: (subdomain: string) => void;
  login: (email: string, password?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  switchRole: (role: UserRole, storeId?: string) => void;
  registerStore: (params: RegisterStoreParams) => Promise<{ success: boolean; error?: string; store?: Store }>;
  refreshCurrentStore: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentStore, setCurrentStore] = useState<Store | null>(null);
  const [activeRole, setActiveRole] = useState<UserRole>('merchant');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [currentSubdomain, setCurrentSubdomain] = useState<string>('el-nokhba');

  // Initialize Auth state
  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      setIsLoading(true);

      if (isSupabaseConfigured && supabase) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user && mounted) {
            await loadSupabaseUserData(session.user.id, session.user.email || '');
          } else if (mounted) {
            setCurrentUser(null);
            setCurrentStore(null);
            setActiveRole('visitor');
          }
        } catch (err) {
          console.error('Supabase getSession error:', err);
        } finally {
          if (mounted) setIsLoading(false);
        }

        // Listen to auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
          if (!mounted) return;
          if (session?.user) {
            await loadSupabaseUserData(session.user.id, session.user.email || '');
          } else {
            setCurrentUser(null);
            setCurrentStore(null);
            setActiveRole('visitor');
          }
        });

        return () => {
          subscription.unsubscribe();
        };
      } else {
        // LocalStorage Demo Mode
        const users = storage.getUsers();
        const demoMerchant = users.find(u => u.role === 'merchant') || null;
        setCurrentUser(demoMerchant);
        setActiveRole('merchant');

        const localStores = storage.getLocalStores();
        if (localStores.length > 0) {
          setCurrentStore(localStores[0]);
          setCurrentSubdomain(localStores[0].subdomain);
        }
        setIsLoading(false);
      }
    }

    initAuth();

    return () => {
      mounted = false;
    };
  }, []);

  // Helper to load Supabase Profile and Store
  const loadSupabaseUserData = async (userId: string, email: string) => {
    if (!supabase) return;

    try {
      // 1. Fetch Profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      const userRole = (profile?.role === 'admin' ? 'admin' : 'merchant') as UserRole;

      const userObj: User = {
        id: userId,
        name: profile?.name || email.split('@')[0],
        email: email,
        phone: profile?.phone || '',
        role: userRole,
        storeId: profile?.store_id
      };
      setCurrentUser(userObj);
      setActiveRole(userRole);

      // 2. Fetch Store owned by user or associated
      let storeQuery = supabase.from('stores').select('*');
      if (profile?.store_id) {
        storeQuery = storeQuery.eq('id', profile.store_id);
      } else {
        storeQuery = storeQuery.eq('owner_id', userId);
      }

      const { data: storeData } = await storeQuery.order('created_at', { ascending: false }).limit(1).maybeSingle();

      if (storeData) {
        const mappedStore: Store = {
          id: storeData.id,
          ownerId: storeData.owner_id,
          name: storeData.name,
          subdomain: storeData.subdomain,
          description: storeData.description || '',
          logoUrl: storeData.logo_url,
          brandColor: storeData.brand_color || '#059669',
          freeShippingThreshold: Number(storeData.free_shipping_threshold || 10000),
          planId: storeData.plan_id || 'plan_trial',
          status: storeData.status || 'active',
          phone: storeData.phone || '',
          customWilayaFees: storeData.custom_wilaya_fees || {},
          createdAt: storeData.created_at,
          updatedAt: storeData.updated_at
        };
        setCurrentStore(mappedStore);
        setCurrentSubdomain(mappedStore.subdomain);
      }
    } catch (err) {
      console.error('Error loading Supabase user data:', err);
    }
  };

  const refreshCurrentStore = async () => {
    if (currentStore?.id) {
      const updated = await storage.getStoreById(currentStore.id);
      if (updated) setCurrentStore(updated);
    }
  };

  const login = async (email: string, password?: string): Promise<{ success: boolean; error?: string }> => {
    if (isSupabaseConfigured && supabase) {
      if (!password) {
        return { success: false, error: 'يرجى إدخال كلمة المرور' };
      }
      setIsLoading(true);
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: password
      });
      setIsLoading(false);

      if (error) {
        let msg = error.message;
        if (msg.includes('Invalid login credentials')) {
          msg = 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
        }
        return { success: false, error: msg };
      }

      if (data.user) {
        await loadSupabaseUserData(data.user.id, data.user.email || email);
        return { success: true };
      }
      return { success: false, error: 'تعذر تسجيل الدخول' };
    }

    // Local Demo Login
    const users = storage.getUsers();
    const found = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (found) {
      setCurrentUser(found);
      setActiveRole(found.role);
      if (found.storeId) {
        const s = storage.getLocalStores().find(st => st.id === found.storeId);
        if (s) {
          setCurrentStore(s);
          setCurrentSubdomain(s.subdomain);
        }
      }
      return { success: true };
    }
    return { success: false, error: 'المستخدم غير موجود بالبيانات التجريبية' };
  };

  const logout = async () => {
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
    }
    setCurrentUser(null);
    setCurrentStore(null);
    setActiveRole('visitor');
  };

  const switchRole = (role: UserRole, storeId?: string) => {
    // Only available in Demo mode or for testing
    setActiveRole(role);
    if (role === 'visitor') {
      // do nothing
    } else if (role === 'admin') {
      const admin = storage.getUsers().find(u => u.role === 'admin');
      if (admin) setCurrentUser(admin);
    } else if (role === 'merchant') {
      const targetStoreId = storeId || currentStore?.id || 'store_el_nokhba';
      const store = storage.getLocalStores().find(s => s.id === targetStoreId);
      if (store) {
        setCurrentStore(store);
        setCurrentSubdomain(store.subdomain);
        const merchant: User = {
          id: store.ownerId,
          name: 'تاجر ' + store.name,
          email: `${store.subdomain}@dokani.dz`,
          role: 'merchant',
          storeId: store.id
        };
        setCurrentUser(merchant);
      }
    }
  };

  const registerStore = async (params: RegisterStoreParams): Promise<{ success: boolean; error?: string; store?: Store }> => {
    const cleanSubdomain = params.subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!cleanSubdomain || cleanSubdomain.length < 3) {
      return { success: false, error: 'يجب أن يتكون اسم النطاق الفرعي من 3 أحرف إنجليزية أو أرقام على الأقل' };
    }

    if (isSupabaseConfigured && supabase) {
      if (!params.password || params.password.length < 6) {
        return { success: false, error: 'يجب ألا تقل كلمة المرور عن 6 أحرف' };
      }

      setIsLoading(true);

      // Check subdomain uniqueness
      const existing = await storage.getStoreBySubdomain(cleanSubdomain);
      if (existing) {
        setIsLoading(false);
        return { success: false, error: 'هذا النطاق الفرعي محجوز بالفعل، يرجى اختيار اسم آخر' };
      }

      // 1. Sign up Supabase Auth User
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: params.email.trim().toLowerCase(),
        password: params.password,
        options: {
          data: {
            name: params.merchantName.trim(),
            phone: params.phone.trim()
          }
        }
      });

      if (authError || !authData.user) {
        setIsLoading(false);
        return { success: false, error: authError?.message || 'حدث خطأ أثناء إنشاء حساب التاجر' };
      }

      const userId = authData.user.id;

      // 2. Insert Store (only owner_id, name, subdomain, description, logo_url, brand_color, free_shipping_threshold, phone, custom_wilaya_fees)
      // Never send plan_id or status!
      const storeInsertPayload = {
        owner_id: userId,
        name: params.storeName.trim(),
        subdomain: cleanSubdomain,
        description: `مرحباً بكم في متجر ${params.storeName.trim()}`,
        brand_color: '#059669',
        free_shipping_threshold: 10000,
        phone: params.phone.trim(),
        custom_wilaya_fees: {}
      };

      const { data: newStoreData, error: storeError } = await supabase
        .from('stores')
        .insert(storeInsertPayload)
        .select()
        .single();

      if (storeError || !newStoreData) {
        console.error('Supabase store creation error:', storeError);
        setIsLoading(false);
        return { success: false, error: 'تم إنشاء الحساب ولكن تعذر إنشاء المتجر: ' + storeError?.message };
      }

      // 3. Link store_id in profile
      await supabase
        .from('profiles')
        .update({ store_id: newStoreData.id, phone: params.phone.trim(), name: params.merchantName.trim() })
        .eq('id', userId);

      await loadSupabaseUserData(userId, params.email.trim().toLowerCase());
      setIsLoading(false);

      return {
        success: true,
        store: {
          id: newStoreData.id,
          ownerId: newStoreData.owner_id,
          name: newStoreData.name,
          subdomain: newStoreData.subdomain,
          brandColor: newStoreData.brand_color,
          freeShippingThreshold: Number(newStoreData.free_shipping_threshold),
          planId: newStoreData.plan_id,
          status: newStoreData.status,
          phone: newStoreData.phone,
          createdAt: newStoreData.created_at,
          updatedAt: newStoreData.updated_at
        }
      };
    }

    // Local Fallback Store Registration
    const existingStore = storage.getLocalStores().find(s => s.subdomain.toLowerCase() === cleanSubdomain);
    if (existingStore) {
      return { success: false, error: 'هذا النطاق الفرعي محجوز بالفعل، يرجى اختيار اسم آخر' };
    }

    const newStoreId = 'store_' + cleanSubdomain + '_' + Math.random().toString(36).substring(2, 7);
    const newUserId = 'usr_' + Math.random().toString(36).substring(2, 9);

    const newStore: Store = {
      id: newStoreId,
      ownerId: newUserId,
      name: params.storeName.trim(),
      subdomain: cleanSubdomain,
      description: `مرحباً بكم في متجر ${params.storeName.trim()}`,
      brandColor: '#059669',
      freeShippingThreshold: 10000,
      planId: params.planId || 'plan_trial',
      status: 'active',
      phone: params.phone,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const newUser: User = {
      id: newUserId,
      name: params.merchantName.trim(),
      email: params.email.trim().toLowerCase(),
      phone: params.phone.trim(),
      role: 'merchant',
      storeId: newStoreId
    };

    storage.saveStore(newStore);
    storage.saveUser(newUser);

    setCurrentUser(newUser);
    setCurrentStore(newStore);
    setCurrentSubdomain(newStore.subdomain);
    setActiveRole('merchant');

    return { success: true, store: newStore };
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        currentStore,
        activeRole,
        isSupabaseMode: isSupabaseConfigured,
        isLoading,
        currentSubdomain,
        setCurrentSubdomain,
        login,
        logout,
        switchRole,
        registerStore,
        refreshCurrentStore,
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
