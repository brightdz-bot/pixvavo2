import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Store, UserRole } from '../types';
import { storage } from './storage';

interface RegisterStoreParams {
  storeName: string;
  subdomain: string;
  planId: string;
  merchantName: string;
  email: string;
  phone: string;
}

interface AuthContextType {
  currentUser: User | null;
  currentStore: Store | null;
  activeRole: UserRole;
  currentSubdomain: string;
  setCurrentSubdomain: (subdomain: string) => void;
  login: (email: string, role?: UserRole) => boolean;
  logout: () => void;
  switchRole: (role: UserRole, storeId?: string) => void;
  registerStore: (params: RegisterStoreParams) => { success: boolean; error?: string; store?: Store };
  refreshCurrentStore: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const users = storage.getUsers();
    return users.find(u => u.role === 'merchant') || null;
  });

  const [activeRole, setActiveRole] = useState<UserRole>('merchant');
  const [currentStore, setCurrentStore] = useState<Store | null>(() => {
    const stores = storage.getStores();
    return stores[0] || null;
  });

  const [currentSubdomain, setCurrentSubdomain] = useState<string>('el-nokhba');

  useEffect(() => {
    if (currentUser?.storeId) {
      const s = storage.getStoreById(currentUser.storeId);
      if (s) {
        setCurrentStore(s);
        setCurrentSubdomain(s.subdomain);
      }
    }
  }, [currentUser]);

  const refreshCurrentStore = () => {
    if (currentStore?.id) {
      const updated = storage.getStoreById(currentStore.id);
      if (updated) setCurrentStore(updated);
    }
  };

  const login = (email: string, role?: UserRole): boolean => {
    const users = storage.getUsers();
    const found = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (found) {
      setCurrentUser(found);
      setActiveRole(role || found.role);
      if (found.storeId) {
        const s = storage.getStoreById(found.storeId);
        if (s) {
          setCurrentStore(s);
          setCurrentSubdomain(s.subdomain);
        }
      }
      return true;
    }
    return false;
  };

  const logout = () => {
    setCurrentUser(null);
    setActiveRole('visitor');
  };

  const switchRole = (role: UserRole, storeId?: string) => {
    setActiveRole(role);
    if (role === 'visitor') {
      // keep currentSubdomain or default
    } else if (role === 'admin') {
      const admin = storage.getUsers().find(u => u.role === 'admin');
      if (admin) setCurrentUser(admin);
    } else if (role === 'merchant') {
      const targetStoreId = storeId || currentStore?.id || 'store_el_nokhba';
      const store = storage.getStoreById(targetStoreId);
      if (store) {
        setCurrentStore(store);
        setCurrentSubdomain(store.subdomain);
        const merchant = storage.getUsers().find(u => u.storeId === store.id) || {
          id: 'usr_' + store.ownerId,
          name: 'تاجر ' + store.name,
          email: `${store.subdomain}@dokani.dz`,
          role: 'merchant',
          storeId: store.id
        };
        setCurrentUser(merchant);
      }
    }
  };

  const registerStore = (params: RegisterStoreParams) => {
    // 1. Validation
    const cleanSubdomain = params.subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!cleanSubdomain || cleanSubdomain.length < 3) {
      return { success: false, error: 'يجب أن يتكون اسم النطاق الفرعي من 3 أحرف إنجليزية أو أرقام على الأقل' };
    }

    const existingStore = storage.getStoreBySubdomain(cleanSubdomain);
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
      freeShippingThreshold: 12000,
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

    // Save to storage
    storage.saveStore(newStore);
    storage.saveUser(newUser);

    // Set as active
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
