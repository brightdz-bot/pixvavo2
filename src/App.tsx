/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './services/authContext';
import { RoleSwitcherBanner } from './components/common/RoleSwitcherBanner';
import { LandingPage } from './components/visitor/LandingPage';
import { MerchantDashboard } from './components/merchant/MerchantDashboard';
import { PublicStorefront } from './components/storefront/PublicStorefront';
import { PlatformAdmin } from './components/admin/PlatformAdmin';

function AppContent() {
  const { currentStore, currentUser, isSupabaseMode, isLoading, switchRole } = useAuth();
  const [currentView, setCurrentView] = useState<'visitor' | 'merchant' | 'storefront' | 'admin'>(() => {
    return isSupabaseMode ? 'visitor' : 'merchant';
  });
  const [storefrontSubdomain, setStorefrontSubdomain] = useState<string>('el-nokhba');

  // Sync initial view with auth state
  useEffect(() => {
    if (isSupabaseMode && !isLoading) {
      if (currentUser) {
        if (currentUser.role === 'admin') {
          setCurrentView('admin');
        } else {
          setCurrentView('merchant');
        }
      } else {
        setCurrentView('visitor');
      }
    }
  }, [isSupabaseMode, currentUser, isLoading]);

  if (isLoading && isSupabaseMode) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center" dir="rtl">
        <div className="flex flex-col items-center gap-3">
          <div className="w-9 h-9 border-3 border-emerald-500/20 border-t-emerald-600 rounded-full animate-spin" />
          <span className="text-xs text-slate-500 font-medium">جارٍ تحميل دكاني...</span>
        </div>
      </div>
    );
  }

  const handleOpenStorefront = (subdomain?: string) => {
    const target = subdomain || currentStore?.subdomain || storefrontSubdomain;
    setStorefrontSubdomain(target);
    setCurrentView('storefront');
  };

  const handleOpenMerchantWithStore = (storeId: string) => {
    switchRole('merchant', storeId);
    setCurrentView('merchant');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white" dir="rtl">
      {/* Show role switcher only when Supabase is NOT configured (demo mode) */}
      {!isSupabaseMode && (
        <RoleSwitcherBanner
          currentView={currentView}
          setCurrentView={setCurrentView}
        />
      )}

      {/* Main View Router */}
      <div className="flex-1">
        {currentView === 'visitor' && (
          <LandingPage
            onGoToMerchant={() => setCurrentView('merchant')}
            onGoToStorefront={() => handleOpenStorefront()}
          />
        )}

        {currentView === 'merchant' && (
          <MerchantDashboard
            onGoToStorefront={handleOpenStorefront}
            onGoToLanding={() => setCurrentView('visitor')}
          />
        )}

        {currentView === 'storefront' && (
          <PublicStorefront
            subdomain={storefrontSubdomain}
            onGoToMerchant={() => setCurrentView('merchant')}
            onGoToLanding={() => setCurrentView('visitor')}
          />
        )}

        {currentView === 'admin' && (
          <PlatformAdmin
            onGoToMerchant={handleOpenMerchantWithStore}
            onGoToStorefront={handleOpenStorefront}
            onGoToLanding={() => setCurrentView('visitor')}
          />
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
