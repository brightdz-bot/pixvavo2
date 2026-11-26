/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './services/authContext';
import { RoleSwitcherBanner } from './components/common/RoleSwitcherBanner';
import { MerchantDashboard } from './components/merchant/MerchantDashboard';
import { PublicStorefront } from './components/storefront/PublicStorefront';
import { PlatformOwnerDashboard } from './components/owner/PlatformOwnerDashboard';
import {
  buildLandingPagePath,
  extractLandingSlugFromLocation,
  isPlatformDefaultHost
} from './utils/urlRouting';

function getInitialSlugFromUrl(): string | null {
  return extractLandingSlugFromLocation();
}

function isAdminRouteFromUrl(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('banana') === '1' || params.get('banana') === 'true') return true;
    const pathname = window.location.pathname.replace(/\/+$/, '').toLowerCase();
    if (pathname === '/banana' || pathname.startsWith('/banana/')) return true;
    const hash = window.location.hash.replace(/\/+$/, '').toLowerCase();
    return hash === '#/banana' || hash.startsWith('#/banana/');
  } catch {
    return false;
  }
}

function isOwnerRouteFromUrl(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('owner') === '1' || params.get('owner') === 'true') return true;
    const pathname = window.location.pathname.replace(/\/+$/, '').toLowerCase();
    if (pathname === '/owner' || pathname.startsWith('/owner/')) return true;
    const hash = window.location.hash.replace(/\/+$/, '').toLowerCase();
    return hash === '#/owner' || hash.startsWith('#/owner/');
  } catch {
    return false;
  }
}

function resolveInitialView(): 'merchant' | 'storefront' | 'owner' {
  if (isOwnerRouteFromUrl()) return 'owner';
  if (isAdminRouteFromUrl()) return 'merchant';
  return 'storefront';
}

function AppContent() {
  const { currentStore, isSupabaseMode, isLoading, currentSubdomain } = useAuth();
  const [initialSlug, setInitialSlug] = useState<string | null>(() => getInitialSlugFromUrl());
  const [currentView, setCurrentView] = useState<'merchant' | 'storefront' | 'owner'>(() =>
    resolveInitialView()
  );
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    // Normalize legacy /admin path to clean root storefront /
    try {
      const pathname = window.location.pathname.replace(/\/+$/, '').toLowerCase();
      if (pathname === '/admin' || pathname.startsWith('/admin/')) {
        const url = new URL(window.location.href);
        url.pathname = '/';
        window.history.replaceState({}, '', url.toString());
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!isLoading && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      const view = resolveInitialView();
      if (view === 'storefront') {
        setInitialSlug(getInitialSlugFromUrl());
      }
      setCurrentView(view);
    }
  }, [isLoading]);

  useEffect(() => {
    const onPopState = () => {
      const view = resolveInitialView();
      if (view === 'storefront') {
        setInitialSlug(getInitialSlugFromUrl());
      } else {
        setInitialSlug(null);
      }
      setCurrentView(view);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

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
      url.searchParams.delete('banana');
      url.searchParams.delete('shop');
      url.searchParams.delete('view');
      url.searchParams.delete('p');
      if (
        !slug &&
        currentStore?.subdomain &&
        currentStore.subdomain !== 'bright-dz' &&
        isPlatformDefaultHost(window.location.hostname)
      ) {
        url.searchParams.set('store', currentStore.subdomain);
      } else {
        url.searchParams.delete('store');
      }
      url.pathname = slug ? buildLandingPagePath(slug) : '/';
      window.history.pushState({}, '', url.toString());
    } catch {
      // ignore
    }
    setCurrentView('storefront');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans" dir="rtl">
      {!isSupabaseMode && currentView !== 'owner' && (
        <RoleSwitcherBanner
          currentView={currentView}
          setCurrentView={view => {
            try {
              const url = new URL(window.location.href);
              url.searchParams.delete('banana');
              url.searchParams.delete('owner');
              url.searchParams.delete('shop');
              url.searchParams.delete('view');
              if (view === 'owner') {
                url.searchParams.delete('p');
                url.pathname = '/owner';
              } else if (view === 'merchant') {
                url.searchParams.delete('p');
                url.pathname = '/banana';
              } else {
                url.pathname = '/';
              }
              window.history.pushState({}, '', url.toString());
            } catch {
              // ignore
            }
            if (view === 'storefront') {
              setInitialSlug(null);
            }
            setCurrentView(view);
          }}
        />
      )}

      <div className="flex-1">
        {currentView === 'owner' ? (
          <PlatformOwnerDashboard onExitToStorefront={() => handleGoToStorefront()} />
        ) : currentView === 'merchant' ? (
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

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message || 'حدث خطأ غير متوقع' };
  }

  componentDidCatch(error: Error) {
    console.error('App render boundary caught error:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6 text-center"
          dir="rtl"
        >
          <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              تعذر عرض هذه الصفحة مؤقتاً
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{this.state.message}</p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
            >
              إعادة المحاولة
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </AppErrorBoundary>
  );
}

