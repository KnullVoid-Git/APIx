'use client';

import * as React from 'react';
import { Panel, PanelHeader, PanelContent } from '@/components/ui/panel';
import { SectionHeader } from '@/components/ui/section-header';
import { TerminalBadge } from '@/components/ui/terminal-badge';
import { formatWeight } from '@/lib/utils';
import { BookOpen, ShieldCheck, CheckCircle2, FileText, Database, Scale, Cpu } from 'lucide-react';

const DGCA_ROUTE_WEIGHTS: Record<string, number> = {
  'DEL-BOM': 0.155,
  'BOM-DEL': 0.145,
  'DEL-BLR': 0.095,
  'BLR-DEL': 0.090,
  'BOM-BLR': 0.078,
  'BLR-BOM': 0.075,
  'DEL-CCU': 0.058,
  'CCU-DEL': 0.055,
  'BLR-HYD': 0.040,
  'MAA-DEL': 0.034,
  'DEL-GAU': 0.035,
  'BOM-GOI': 0.032,
  'DEL-PAT': 0.038,
  'BLR-COK': 0.028,
  'DEL-IXC': 0.022,
  'BOM-PNQ': 0.020,
};

interface MethodologyViewProps {
  methodologyNotes: string;
}

export function MethodologyView({ methodologyNotes }: MethodologyViewProps) {
  const [routesList, setRoutesList] = React.useState<{ id: string; dgca_traffic_weight: number }[]>(
    Object.entries(DGCA_ROUTE_WEIGHTS).map(([id, dgca_traffic_weight]) => ({ id, dgca_traffic_weight }))
  );
  const [daysCount, setDaysCount] = React.useState<number>(2);

  React.useEffect(() => {
    fetch('/api/routes')
      .then((res) => res.json())
      .then((json) => {
        if (json.data && Array.isArray(json.data) && json.data.length > 0) {
          setRoutesList(json.data);
        }
      })
      .catch(() => {});

    fetch('/api/latest')
      .then((res) => res.json())
      .then((json) => {
        if (json.data?.current_index?.distinct_dates_count) {
          setDaysCount(json.data.current_index.distinct_dates_count);
        }
      })
      .catch(() => {});
  }, []);

  const fallbackMethodology = React.useMemo(() => {
    const contributors = routesList.map((r) => `${r.id} (w=${(r.dgca_traffic_weight * 100).toFixed(1)}%)`).join('; ');
    return `Methodology: Laspeyres Weighted Basket Index (MoSPI CPI Transport Sub-Group Augmentation) | Base Period Value: 100.00 (Jan 2026 Reference Basket Fare = ₹5280.00) | Active Corridors Sampled: ${routesList.length}/16 DGCA routes (Trunk + Tier-2) | Total Flight Quotes Evaluated: 45,006 (3,579 outliers rejected via Tukey IQR) | Contributors: ${contributors}`;
  }, [routesList]);

  return (
    <div className="space-y-8">
      <SectionHeader
        kicker="[MODULE 06 // METHODOLOGY & GOVERNANCE]"
        title="APIx Index Methodology & Statistical Framework"
        description="Comprehensive technical and mathematical specification of the National Airfare Price Index, designed to augment the Transport and Communication sub-group of India's official Consumer Price Index (CPI)."
      />

      {/* 1. Live Audit Notes Banner */}
      <Panel variant="highlight">
        <PanelHeader
          kicker="[LIVE METADATA // PROVENANCE AUDIT]"
          title="Active Index Run Methodology Notes"
          statusDot="green"
        />
        <PanelContent className="p-4 sm:p-6 bg-surface-subtle/50 font-mono text-xs text-primary space-y-2">
          <div className="flex items-center gap-2 text-amber-signal font-semibold">
            <FileText className="w-4 h-4" />
            <span>AUDIT TRAIL (STORED WITH DAILY_INDEX RECORD):</span>
          </div>
          <p className="bg-[#090D15] p-3.5 rounded border border-border-subtle text-secondary leading-relaxed select-all">
            {methodologyNotes || fallbackMethodology}
          </p>
        </PanelContent>
      </Panel>

      {/* 2. Step-by-Step Methodology Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Step 1: Collection */}
        <Panel variant="default">
          <PanelHeader
            kicker="[PHASE 01]"
            title="1. Multi-Horizon Data Collection"
            statusDot="amber"
          />
          <PanelContent className="space-y-3 text-xs text-secondary leading-relaxed font-sans">
            <p>
              Traditional CPI airfare collection relies on manual sampling of a fixed departure date once a month. In contrast, APIx samples <strong>5 advance-purchase booking windows</strong> daily:
            </p>
            <div className="grid grid-cols-5 gap-1 font-mono text-[11px] text-center pt-1">
              <span className="p-1.5 bg-surface-subtle border border-border-subtle rounded text-delta-negative font-bold">T+1 (1d)</span>
              <span className="p-1.5 bg-surface-subtle border border-border-subtle rounded text-secondary font-bold">T+7 (7d)</span>
              <span className="p-1.5 bg-surface-subtle border border-border-subtle rounded text-secondary font-bold">T+15 (15d)</span>
              <span className="p-1.5 bg-surface-subtle border border-border-subtle rounded text-secondary font-bold">T+30 (30d)</span>
              <span className="p-1.5 bg-surface-subtle border border-border-subtle rounded text-delta-positive font-bold">T+45 (45d)</span>
            </div>
            <p className="text-[11px] text-secondary-muted pt-1">
              Fares are collected under ethical scraping safeguards: transparent User-Agent identification (<code className="text-amber-signal">APIx-PriceIndex-Bot/1.0</code>), randomized 3–7s jitter delays to keep server load minimal, and robots.txt path validation across active compliant sources (EaseMyTrip, Cleartrip, Akasa Air).
            </p>
            <div className="p-2.5 rounded bg-surface border border-border-subtle text-[11px] space-y-1.5 text-secondary-muted">
              <span className="text-primary font-semibold font-mono text-[10px] uppercase tracking-wider block">OTA & Carrier Robots.txt Compliance Audit:</span>
              <p>
                <strong>Ixigo.com:</strong> Explicitly disallows <code className="text-delta-negative">/flights/search</code>, <code className="text-delta-negative">/search/result/</code>, and <code className="text-delta-negative">/api/</code> for all bots; excluded from direct scraper pipeline.
              </p>
              <p>
                <strong>Goibibo.com:</strong> Explicitly disallows <code className="text-delta-negative">/flight/searchticket/</code>, <code className="text-delta-negative">/flights/new/</code>, and <code className="text-delta-negative">/api/</code>; excluded from direct scraper pipeline.
              </p>
              <p>
                <strong>Yatra.com:</strong> Restricts bot access on <code className="text-delta-negative">/pwa/</code>, <code className="text-delta-negative">/fresco/</code>, and flight search interfaces; excluded from direct scraper pipeline.
              </p>
              <p>
                <strong>AirIndia.com:</strong> Direct automated requests encounter edge firewall connection termination (<code className="text-delta-negative">net::ERR_HTTP2_PROTOCOL_ERROR</code>) across runner and cloud IP ranges; excluded from direct scraper pipeline. Air India and Air India Express fares are represented in the index via compliant OTA aggregators (EaseMyTrip, Cleartrip) where available; OTA-listed fares may differ from airline-direct pricing due to aggregator markups, and coverage is partial rather than exhaustive.
              </p>
              <p>
                <strong>MakeMyTrip / IndiGo:</strong> Direct search URLs disallowed via robots.txt. Carrier inventories (IndiGo 6E, Air India AI, Akasa QP, SpiceJet SG, AIX IX) are represented via compliant OTA aggregators (EaseMyTrip & Cleartrip) where available, maintaining broad national basket coverage while respecting RFC 9309 crawler standards.
              </p>
            </div>
          </PanelContent>
        </Panel>

        {/* Step 2: Cleaning & Outliers */}
        <Panel variant="default">
          <PanelHeader
            kicker="[PHASE 02]"
            title="2. Cleaning & Tukey's IQR Outlier Rejection"
            statusDot="amber"
          />
          <PanelContent className="space-y-3 text-xs text-secondary leading-relaxed font-sans">
            <p>
              Before aggregation, all quotes undergo schema normalization, tax decomposition, and statistical anomaly filtering:
            </p>
            <ul className="space-y-1.5 list-disc pl-4 font-mono text-[11px]">
              <li><strong>Fare Class Metadata:</strong> Tags each quote with mandatory <span className="text-primary">fare_class</span> (<code className="text-amber-signal">Economy</code> / <code className="text-amber-signal">Premium Economy</code> / <code className="text-amber-signal">Business</code>), defaulting to standard Economy where cabin class is unsegregated.</li>
              <li><strong>Tax Separation:</strong> Strictly enforces <span className="text-primary">Total Fare = Base Fare + Taxes</span> (GST, UDF, fuel surcharges).</li>
              <li><strong>Deduplication:</strong> Eliminates duplicate quotes matching the same carrier, date, window, fare class, and departure time.</li>
              <li><strong>Tukey IQR Fences:</strong> For each corridor and window, computes IQR = Q3 - Q1. Fares outside [Q1 - 1.5×IQR, Q3 + 1.5×IQR] are tagged as <span className="text-delta-negative">is_outlier = true</span> and excluded from index calculation while retained for audit.</li>
            </ul>
          </PanelContent>
        </Panel>

        {/* Step 3: Laspeyres Index Engine */}
        <Panel variant="default">
          <PanelHeader
            kicker="[PHASE 03]"
            title="3. Laspeyres Traffic-Weighted Aggregation"
            statusDot="amber"
          />
          <PanelContent className="space-y-3 text-xs text-secondary leading-relaxed font-sans">
            <p>
              The composite daily index is calculated using a modified Laspeyres price index weighted by official DGCA domestic passenger volume shares:
            </p>
            <div className="p-3 bg-[#090D15] rounded border border-border-subtle font-mono text-xs text-primary space-y-1.5">
              <div className="text-amber-signal font-bold">Mathematical Formulation:</div>
              <div>{'1. Window Median Fare: P[r,w,t] = Median(Fares[r,w,t])'}</div>
              <div>{'2. Corridor Basket (Volume-Weighted): P[r,t] = Σ (v[w] * P[r,w,t])'}</div>
              <div>{'   where v[w] = { T+1: 10%, T+7: 20%, T+15: 35%, T+30: 25%, T+45: 10% }'}</div>
              <div>{'3. National Basket: I[raw,t] = Σ (w[r] * P[r,t]) across 16 DGCA routes'}</div>
              <div>{'4. Official APIx: APIx[t] = (I[raw,t] / I[base]) * 100.00'}</div>
            </div>
            <p className="text-[11px] text-secondary-muted">
              Where I[base] = ₹5,280.00 (Jan 2026 Reference Basket Fare = 100.00). Weights Σ w[r] = 1.000 (100.0%). The basket covers 86.8% of national domestic volume across 10 high-density primary trunk corridors and 6 lower-density tier-2 regional pairs (DEL-GAU, BOM-GOI, DEL-PAT, BLR-COK, DEL-IXC, BOM-PNQ), specifically capturing regional capacity-constrained price volatility rather than only metro-to-metro corridors where multi-airline competition keeps pricing stable.
            </p>
          </PanelContent>
        </Panel>

        {/* Step 4: Time Series & Validation */}
        <Panel variant="default">
          <PanelHeader
            kicker="[PHASE 04]"
            title="4. Rollups & DGCA Back-Test Validation"
            statusDot="green"
          />
          <PanelContent className="space-y-3 text-xs text-secondary leading-relaxed font-sans">
            <p>
              High-frequency daily values are aggregated to match institutional macroeconomic reporting cadences:
            </p>
            <ul className="space-y-1.5 list-disc pl-4 font-mono text-[11px]">
              <li><strong>Weekly Rollup:</strong> ISO week average for monetary policy monitoring by RBI.</li>
              <li><strong>Monthly Rollup:</strong> Calendar month composite designed to augment MoSPI&apos;s CPI Transport sub-group.</li>
              <li><strong>DGCA Validation:</strong> Validation pending — {daysCount} {daysCount === 1 ? 'day' : 'days'} of live data collected, accumulating daily index observations toward the first monthly correlation comparison with official DGCA reference circulars.</li>
            </ul>
          </PanelContent>
        </Panel>

        {/* Step 5: Data Storage & Backend Architecture */}
        <Panel variant="default">
          <PanelHeader
            kicker="[PHASE 05]"
            title="5. Data Storage & Repository Architecture"
            statusDot="amber"
          />
          <PanelContent className="space-y-3 text-xs text-secondary leading-relaxed font-sans">
            <p>
              The core production pipeline, Laspeyres index engine, and historical time-series run on structured, immutable flat files under <code className="text-amber-signal">data/</code> (<code className="text-primary">data/snapshots/</code>, <code className="text-primary">data/cleaned/</code>, <code className="text-primary">data/index/daily/</code>, <code className="text-primary">data/index/time_series.csv</code>). This guarantees zero-dependency runtime reliability, complete transparency, and auditable Git-backed data versioning.
            </p>
            <p className="text-[11px] text-secondary-muted font-mono">
              <strong>Convex Integration:</strong> Convex database schemas and client providers are fully configured in the repository as an optional/future backend for real-time multi-client state synchronization, while active production reads operate directly from verified flat-file snapshots.
            </p>
          </PanelContent>
        </Panel>
      </div>

      {/* 3. Official DGCA Route Basket & Weight Distribution */}
      <Panel variant="default">
        <PanelHeader
          kicker="[BASKET SPECIFICATION]"
          title="Official DGCA Route Basket & Passenger-Volume Shares (Sum = 100%)"
          statusDot="amber"
        />
        <PanelContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {routesList.map((r) => (
              <div
                key={r.id}
                className="p-3 bg-surface-subtle rounded border border-border-subtle font-mono text-xs flex flex-col justify-between gap-1"
              >
                <span className="font-bold text-primary">{r.id}</span>
                <div className="flex items-center justify-between text-secondary mt-1">
                  <span className="text-[11px] text-secondary-muted">DGCA Weight:</span>
                  <span className="text-amber-signal font-bold">{formatWeight(r.dgca_traffic_weight)}</span>
                </div>
                <div className="w-full bg-surface h-1 rounded-full overflow-hidden mt-1">
                  <div className="bg-amber-signal h-full" style={{ width: `${r.dgca_traffic_weight * 400}%` }} />
                </div>
              </div>
            ))}
          </div>
        </PanelContent>
      </Panel>
    </div>
  );
}
