/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AuthProvider, useAuth } from './services/authContext';
import { RoleSwitcherBanner } from './components/common/RoleSwitcherBanner';
import { LandingPage } from './components/visitor/LandingPage';
import { MerchantDashboard } from './components/merchant/MerchantDashboard';
import { PublicStorefront } from './components/storefront/PublicStorefront';
import { PlatformAdmin } from './components/admin/PlatformAdmin';

function AppContent() {
  const { currentStore, switchRole } = useAuth();
  const [currentView, setCurrentView] = useState<'visitor' | 'merchant' | 'storefront' | 'admin'>('merchant');
  const [storefrontSubdomain, setStorefrontSubdomain] = useState<string>('el-nokhba');

  const handleOpenStorefront = (subdomain?: string) => {
    const target = subdomain || currentStore?.subdomain || 'el-nokhba';
    setStorefrontSubdomain(target);
    setCurrentView('storefront');
  };

  const handleOpenMerchantWithStore = (storeId: string) => {
    switchRole('merchant', storeId);
    setCurrentView('merchant');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white" dir="rtl">
      {/* Top Banner to switch between the 4 platform roles */}
      <RoleSwitcherBanner
        currentView={currentView}
        setCurrentView={setCurrentView}
      />

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
