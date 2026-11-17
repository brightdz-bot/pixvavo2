/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './services/authContext';
import { RoleSwitcherBanner } from './components/common/RoleSwitcherBanner';
import { MerchantDashboard } from './components/merchant/MerchantDashboard';
import { PublicStorefront } from './components/storefront/PublicStorefront';

function getInitialSlugFromUrl(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('p');
  } catch {
    return null;
  }
}

function isAdminRouteFromUrl(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('admin') === '1' || params.get('admin') === 'true') return true;
    return window.location.pathname.replace(/\/+$/, '').endsWith('/admin');
  } catch {
    return false;
  }
}

function AppContent() {
  const { currentStore, currentUser, isSupabaseMode, isLoading, currentSubdomain } = useAuth();
  const [initialSlug, setInitialSlug] = useState<string | null>(() => getInitialSlugFromUrl());
  const [currentView, setCurrentView] = useState<'merchant' | 'storefront'>(() => {
    if (getInitialSlugFromUrl()) return 'storefront';
    if (isAdminRouteFromUrl()) return 'merchant';
    return isSupabaseMode ? 'storefront' : 'merchant';
  });
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (!isLoading && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      if (getInitialSlugFromUrl()) {
        setCurrentView('storefront');
      } else if (isAdminRouteFromUrl()) {
        setCurrentView('merchant');
      } else if (isSupabaseMode) {
        setCurrentView(currentUser ? 'merchant' : 'storefront');
      } else {
        setCurrentView('merchant');
      }
    }
  }, [isSupabaseMode, currentUser, isLoading]);

  if (isLoading && !hasInitializedRef.current) {
    return (
      <div className="min-h-screen bg-[#fdfbf7] flex items-center justify-center" dir="rtl">
        <div className="flex flex-col items-center gap-3">
          <div className="w-9 h-9 border-4 border-[#754b2d]/20 border-t-[#754b2d] rounded-full animate-spin" />
          <span className="text-xs text-slate-500 font-bold">جارٍ تحميل المتجر...</span>
        </div>
      </div>
    );
  }

  const handleGoToStorefront = (slug?: string) => {
    setInitialSlug(slug || null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('admin');
      if (slug) {
        url.searchParams.set('p', slug);
      } else {
        url.searchParams.delete('p');
      }
      window.history.replaceState({}, '', url.toString());
    } catch {
      // ignore
    }
    setCurrentView('storefront');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans" dir="rtl">
      {!isSupabaseMode && (
        <RoleSwitcherBanner
          currentView={currentView}
          setCurrentView={view => {
            if (view === 'storefront') {
              setInitialSlug(null);
            }
            setCurrentView(view);
          }}
        />
      )}

      <div className="flex-1">
        {currentView === 'merchant' ? (
          <MerchantDashboard onGoToStorefront={handleGoToStorefront} />
        ) : (
          <PublicStorefront
            subdomain={currentStore?.subdomain || currentSubdomain}
            initialSlug={initialSlug}
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

