'use client';

import * as React from 'react';
import { TerminalHeader } from '@/components/layout/terminal-header';
import { IndexOverview } from '@/components/dashboard/index-overview';
import { RouteHeatmap } from '@/components/dashboard/route-heatmap';
import { ElasticityView } from '@/components/dashboard/elasticity-view';
import { ValidationView } from '@/components/dashboard/validation-view';
import { MethodologyView } from '@/components/dashboard/methodology-view';
import { ApiDocsView } from '@/components/dashboard/api-docs-view';
import { FareInspectorView } from '@/components/dashboard/fare-inspector-view';
import { BulletinModal } from '@/components/dashboard/bulletin-modal';
import { PolicySimulator } from '@/components/dashboard/policy-simulator';
import { AntiGougingWatchdog } from '@/components/dashboard/anti-gouging-watchdog';
import { DailyIndex } from '@/types';

export default function HomePage() {
  const [activeTab, setActiveTab] = React.useState<string>('overview');
  const [audioEnabled, setAudioEnabled] = React.useState<boolean>(false);
  const [liveIndex, setLiveIndex] = React.useState<DailyIndex | null>(null);
  const [dataStatus, setDataStatus] = React.useState<'loading' | 'live' | 'insufficient_data'>('loading');
  const [statusMessage, setStatusMessage] = React.useState<string>('');
  const [isBulletinOpen, setIsBulletinOpen] = React.useState<boolean>(false);
  const [isSimulatorOpen, setIsSimulatorOpen] = React.useState<boolean>(false);

  // Sync tab from URL search parameters on mount if present
  React.useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = urlParams.get('tab');
      const validTabs = ['overview', 'routes', 'elasticity', 'validation', 'methodology', 'api-docs', 'fare-inspector'];
      if (tabParam && validTabs.includes(tabParam)) {
        setActiveTab(tabParam);
      }
    } catch {
      // Ignore in SSR
    }
  }, []);

  // Fetch real computed index from /api/latest (with auto-polling & focus refresh)
  React.useEffect(() => {
    async function loadRealComputedData() {
      try {
        const res = await fetch('/api/latest');
        if (res.ok) {
          const json = await res.json();
          if (json.data?.status === 'insufficient_data' || !json.data?.current_index) {
            setLiveIndex(null);
            setDataStatus('insufficient_data');
            setStatusMessage(json.data?.message || 'No real scraped flight quotes available for the current date. Waiting for scheduled pipeline execution.');
          } else if (json.data && json.data.current_index) {
            const cur = json.data.current_index;
            setLiveIndex({
              id: cur.id || 'daily_index_latest',
              index_date: cur.index_date || '2026-09-04',
              frequency: cur.frequency || 'daily',
              apix_value: typeof cur.apix_value === 'number' ? cur.apix_value : 0,
              base_period_value: cur.base_period_value || 100.0,
              weighted_basket_fare: cur.raw_weighted_fare || cur.weighted_basket_fare || 0,
              median_basket_fare: cur.base_weighted_fare || cur.median_basket_fare || 5280,
              delta_24h: typeof cur.delta_24h === 'number' ? cur.delta_24h : 0,
              methodology_notes: cur.methodology_notes || '',
              active_routes_count: cur.active_routes_count || 0,
              records_processed: cur.total_records_processed || cur.records_processed || 0,
              partial_basket: cur.partial_basket !== undefined ? Boolean(cur.partial_basket) : (cur.active_routes_count ? cur.active_routes_count < 16 : false),
              last_full_basket_delta_24h: cur.last_full_basket_delta_24h,
              last_full_basket_date: cur.last_full_basket_date,
              distinct_dates_count: cur.distinct_dates_count || 0,
              collected_dates: cur.collected_dates || [],
            });
            setDataStatus('live');
          }
        } else {
          setDataStatus('insufficient_data');
          setStatusMessage('Live index endpoint returned error.');
        }
      } catch {
        setDataStatus('insufficient_data');
        setStatusMessage('Network connectivity issue. Unable to fetch live pipeline index.');
      }
    }

    loadRealComputedData();

    // Re-fetch automatically on window focus or tab visibility change
    const onFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        loadRealComputedData();
      }
    };

    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);

    // Periodic background sync every 60 seconds
    const intervalId = setInterval(loadRealComputedData, 60000);

    return () => {
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
      clearInterval(intervalId);
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-ink terminal-grid selection:bg-amber-signal/20 selection:text-amber-signal">
      {/* Terminal Top Navigation Header */}
      <TerminalHeader
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        audioEnabled={audioEnabled}
        onToggleAudio={() => setAudioEnabled((prev) => !prev)}
        onOpenBulletin={() => setIsBulletinOpen(true)}
        onOpenSimulator={() => setIsSimulatorOpen(true)}
      />

      {/* Main Terminal Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
        {activeTab === 'overview' && (
          <IndexOverview
            currentIndex={liveIndex}
            status={dataStatus}
            statusMessage={statusMessage}
            audioEnabled={audioEnabled}
          />
        )}

        {activeTab === 'routes' && (
          <div className="space-y-6">
            <AntiGougingWatchdog />
            <RouteHeatmap />
          </div>
        )}

        {activeTab === 'elasticity' && <ElasticityView />}

        {activeTab === 'fare-inspector' && <FareInspectorView />}

        {activeTab === 'validation' && <ValidationView />}

        {activeTab === 'methodology' && (
          <MethodologyView
            methodologyNotes={liveIndex?.methodology_notes || ''}
          />
        )}

        {activeTab === 'api-docs' && <ApiDocsView />}
      </main>

      {/* 1-Click MoSPI Press Bulletin Modal */}
      <BulletinModal
        isOpen={isBulletinOpen}
        onClose={() => setIsBulletinOpen(false)}
        indexData={{
          apix_value: liveIndex?.apix_value ?? 100.0,
          weighted_basket_fare: liveIndex?.weighted_basket_fare ?? 5280,
          base_period_value: liveIndex?.base_period_value ?? 100.0,
          delta_24h: liveIndex?.delta_24h ?? 0,
          index_date: liveIndex?.index_date ?? new Date().toISOString().split('T')[0],
          distinct_dates_count: liveIndex?.distinct_dates_count ?? 1,
        }}
      />

      {/* Econometric What-If Policy Impact Simulator */}
      <PolicySimulator
        isOpen={isSimulatorOpen}
        onClose={() => setIsSimulatorOpen(false)}
        baseIndexValue={liveIndex?.apix_value ?? 100.0}
        baseBasketFare={liveIndex?.weighted_basket_fare ?? 5280}
      />

      {/* Terminal Footer */}
      <footer className="border-t border-border-subtle bg-ink py-4 px-6 text-center text-xs font-mono text-secondary-muted mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>APIx · SMART INDIA HACKATHON 2026 · PROBLEM STATEMENT 26056 · MoSPI / DIID</span>
          <div className="flex items-center gap-4 text-[11px]">
            <span>DGCA VALIDATION PENDING ({liveIndex?.distinct_dates_count ?? 1} {(liveIndex?.distinct_dates_count ?? 1) === 1 ? 'DAY' : 'DAYS'} LIVE DATA COLLECTED)</span>
            <span className="text-border-subtle">|</span>
            <span className="text-amber-signal">LASPEYRES INDEX (BASE 2026.01 = 100.00)</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
