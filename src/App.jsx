import './App.css'
import React, { Suspense } from 'react'
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import VisualEditAgent from '@/lib/VisualEditAgent'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

const Casuales = React.lazy(() => import('./pages/Casuales'));
const AsistenteIA = React.lazy(() => import('./pages/AsistenteIA'));
const Auditoria = React.lazy(() => import('./pages/Auditoria'));

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const ServerRestartingScreen = () => (
  <div className="fixed inset-0 flex flex-col items-center justify-center bg-slate-50 z-50">
    <div className="flex flex-col items-center gap-6 max-w-sm text-center px-6">
      <div className="w-16 h-16 flex items-center justify-center">
        <img
          src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/4c3ba79c6_RedOakLogo.png"
          alt="RedOak"
          className="w-12 h-12 object-contain opacity-70"
        />
      </div>
      <div className="w-10 h-10 border-4 border-green-200 border-t-green-600 rounded-full animate-spin"></div>
      <div>
        <p className="text-slate-800 font-semibold text-lg">Reiniciando servidor...</p>
        <p className="text-slate-500 text-sm mt-1">Esto puede tomar unos segundos. Por favor espera.</p>
      </div>
      <div className="flex gap-1 mt-2">
        <span className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
        <span className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
        <span className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
      </div>
    </div>
  </div>
);

const PageLoader = <ServerRestartingScreen />;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated, navigateToLogin } = useAuth();

  return <ServerRestartingScreen />;

  if (isLoadingPublicSettings || isLoadingAuth) {
    return <ServerRestartingScreen />;
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <LayoutWrapper currentPageName={mainPageKey}>
      <Suspense fallback={PageLoader}>
        <Routes>
          <Route path="/" element={<MainPage />} />
          {Object.entries(Pages).map(([path, Page]) => (
            <Route key={path} path={`/${path}`} element={<Page />} />
          ))}
          <Route path="/Casuales" element={<Casuales />} />
          <Route path="/AsistenteIA" element={<AsistenteIA />} />
          <Route path="/Auditoria" element={<Auditoria />} />
          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </Suspense>
    </LayoutWrapper>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <NavigationTracker />
          <AuthenticatedApp />
        </Router>
        <Toaster />
        <VisualEditAgent />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App