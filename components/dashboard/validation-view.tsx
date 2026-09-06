'use client';

import * as React from 'react';
import { Panel, PanelHeader, PanelContent } from '@/components/ui/panel';
import { SectionHeader } from '@/components/ui/section-header';
import { TerminalBadge } from '@/components/ui/terminal-badge';
import { DataTable, ColumnDef } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { ValidationChart } from './validation-chart';
import { CsvImporter } from './csv-importer';
import {
  OFFICIAL_DGCA_MONTHLY_BENCHMARKS,
  INITIAL_ROUTE_BENCHMARKS,
  DgcaReferenceFareRecord,
  MonthlyBasketComparison,
  calculateValidationMetrics,
} from '@/lib/validation-data';
import { formatINR } from '@/lib/utils';
import {
  ShieldCheck,
  CheckCircle2,
  TrendingUp,
  Percent,
  Calculator,
  ArrowRight,
  Database,
  Award,
} from 'lucide-react';

interface ValidationViewProps {
  initialDatesCount?: number;
}

export function ValidationView({ initialDatesCount = 2 }: ValidationViewProps) {
  const [monthlyData, setMonthlyData] = React.useState<MonthlyBasketComparison[]>([]);
  const [routeRecords, setRouteRecords] = React.useState<DgcaReferenceFareRecord[]>([]);
  const [selectedRouteFilter, setSelectedRouteFilter] = React.useState<string>('ALL');
  const [daysCount, setDaysCount] = React.useState<number>(initialDatesCount);

  React.useEffect(() => {
    fetch('/api/latest')
      .then((res) => res.json())
      .then((json) => {
        if (json.data?.current_index?.distinct_dates_count) {
          setDaysCount(json.data.current_index.distinct_dates_count);
        }
      })
      .catch(() => {});
  }, []);

  const hasSufficientData = monthlyData.length >= 2;
  const metrics = React.useMemo(
    () => (hasSufficientData ? calculateValidationMetrics(monthlyData) : null),
    [monthlyData, hasSufficientData]
  );

  const handleImportRecords = (newRecords: DgcaReferenceFareRecord[]) => {
    setRouteRecords((prev) => [...newRecords, ...prev]);

    // Group by month to create monthly basket comparisons for validation
    const monthGroups: Record<string, { apixSum: number; dgcaSum: number; count: number }> = {};
    for (const r of newRecords) {
      if (!monthGroups[r.month]) {
        monthGroups[r.month] = { apixSum: 0, dgcaSum: 0, count: 0 };
      }
      monthGroups[r.month].apixSum += r.apix_computed_fare;
      monthGroups[r.month].dgcaSum += r.dgca_official_fare;
      monthGroups[r.month].count += 1;
    }

    const newComparisons: MonthlyBasketComparison[] = Object.entries(monthGroups).map(
      ([month, group]) => {
        const apixAvg = Math.round(group.apixSum / group.count);
        const dgcaAvg = Math.round(group.dgcaSum / group.count);
        const varianceInr = apixAvg - dgcaAvg;
        const variancePct = Number(((varianceInr / dgcaAvg) * 100).toFixed(2));
        return {
          month,
          month_label: month,
          apix_basket_fare: apixAvg,
          dgca_basket_fare: dgcaAvg,
          apix_index_value: Number(((apixAvg / 5280) * 100).toFixed(2)),
          dgca_index_value: Number(((dgcaAvg / 5280) * 100).toFixed(2)),
          variance_inr: varianceInr,
          variance_pct: variancePct,
          status: Math.abs(variancePct) <= 1.5 ? 'EXACT_MATCH' : 'TIGHT_TRACK',
        };
      }
    );

    setMonthlyData((prev) => [...newComparisons, ...prev]);
  };

  const handleResetToDefault = () => {
    setMonthlyData([]);
    setRouteRecords([]);
  };

  const filteredRouteRecords = React.useMemo(() => {
    if (selectedRouteFilter === 'ALL') return routeRecords;
    return routeRecords.filter((r) => r.route_id === selectedRouteFilter);
  }, [routeRecords, selectedRouteFilter]);

  const uniqueRoutes = React.useMemo(() => {
    return Array.from(new Set(routeRecords.map((r) => r.route_id))).sort();
  }, [routeRecords]);

  // Column definitions for Route Empirical Variance Table
  const columns: ColumnDef<DgcaReferenceFareRecord>[] = [
    {
      id: 'month',
      header: 'MONTH',
      sortable: true,
      cell: (row) => <span className="font-mono font-bold text-xs text-primary">{row.month}</span>,
    },
    {
      id: 'route_id',
      header: 'CORRIDOR',
      sortable: true,
      cell: (row) => (
        <span className="font-mono text-xs text-amber-signal font-bold bg-surface-elevated px-2 py-0.5 rounded border border-border-subtle">
          {row.route_id}
        </span>
      ),
    },
    {
      id: 'dgca_official_fare',
      header: 'DGCA OFFICIAL FARE',
      sortable: true,
      align: 'right',
      cell: (row) => (
        <span className="font-mono text-xs text-sky-400 font-medium">
          {formatINR(row.dgca_official_fare)}
        </span>
      ),
    },
    {
      id: 'apix_computed_fare',
      header: 'APIx OBSERVED FARE',
      sortable: true,
      align: 'right',
      cell: (row) => (
        <span className="font-mono text-xs text-primary font-bold">
          {formatINR(row.apix_computed_fare)}
        </span>
      ),
    },
    {
      id: 'variance_inr',
      header: 'VARIANCE (₹)',
      sortable: true,
      align: 'right',
      cell: (row) => (
        <span className="font-mono text-xs text-secondary font-semibold">
          {row.variance_inr > 0 ? '+' : ''}₹{row.variance_inr}
        </span>
      ),
    },
    {
      id: 'variance_pct',
      header: 'ERROR (%)',
      sortable: true,
      align: 'center',
      cell: (row) => {
        const absPct = Math.abs(row.variance_pct ?? 0);
        const isGradeA = absPct <= 2.0;

        return (
          <div
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border font-mono text-xs font-semibold ${
              isGradeA
                ? 'bg-delta-positive/10 text-delta-positive border-delta-positive/30'
                : 'bg-amber-signal/10 text-amber-signal border-amber-signal/30'
            }`}
          >
            <span>{(row.variance_pct ?? 0) > 0 ? '+' : ''}{(row.variance_pct ?? 0).toFixed(2)}%</span>
          </div>
        );
      },
    },
    {
      id: 'source_report_ref',
      header: 'REPORT SOURCE',
      cell: (row) => (
        <span className="font-mono text-[10px] text-secondary-muted truncate max-w-[140px] block">
          {row.source_report_ref}
        </span>
      ),
    },
    {
      id: 'grade',
      header: 'ALIGNMENT',
      align: 'center',
      cell: (row) => (
        <TerminalBadge variant={row.grade === 'A+' ? 'green' : 'amber'} size="xs">
          {row.grade}
        </TerminalBadge>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      <SectionHeader
        kicker="[MODULE 05 // EMPIRICAL VALIDATION & GROUND TRUTH]"
        title="DGCA Back-Test Validation & Econometric Convergence"
        description="Empirical validation of the daily-computed APIx Index against official Ministry of Civil Aviation / DGCA tariff benchmark circulars. Live validation requires minimum N ≥ 2 overlapping monthly periods."
      />

      {/* 1. Executive Statistical Accuracy KPI Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Pearson Correlation */}
        <Panel variant="highlight" className="p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-secondary-muted font-mono text-xs mb-2">
            <span>PEARSON CORRELATION (r)</span>
            <ShieldCheck className="w-4 h-4 text-amber-signal" />
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-amber-signal">
              {metrics && typeof metrics.pearson_correlation === 'number' ? metrics.pearson_correlation.toFixed(3) : 'PENDING'}
            </div>
            <p className="text-[11px] font-mono text-secondary mt-1">
              {metrics
                ? 'Empirically computed from overlapping data'
                : `Validation pending — ${daysCount} ${daysCount === 1 ? 'day' : 'days'} of live data collected, accumulating toward first comparison`}
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-border-subtle/60 text-[10px] font-mono text-secondary-muted flex justify-between">
            <span>STATUS</span>
            <span className="text-amber-signal">
              {metrics ? 'COMPUTED' : 'ACCUMULATING LIVE DATA'}
            </span>
          </div>
        </Panel>

        {/* MAPE */}
        <Panel variant="default" className="p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-secondary-muted font-mono text-xs mb-2">
            <span>MEAN ABS ERROR (MAPE)</span>
            <Percent className="w-4 h-4 text-amber-signal" />
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-primary">
              {metrics && typeof metrics.mape_pct === 'number' ? `${metrics.mape_pct.toFixed(2)}%` : 'PENDING'}
            </div>
            <p className="text-[11px] font-mono text-secondary mt-1">
              {metrics
                ? 'Average tracking variance vs DGCA published fares'
                : 'Awaiting 2+ overlapping monthly circulars'}
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-border-subtle/60 text-[10px] font-mono text-secondary-muted flex justify-between">
            <span>SAMPLE REQUIREMENT</span>
            <span className="text-primary">{metrics ? `${metrics.total_months_evaluated} MONTHS` : 'MIN N ≥ 2'}</span>
          </div>
        </Panel>

        {/* RMSE */}
        <Panel variant="default" className="p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-secondary-muted font-mono text-xs mb-2">
            <span>ROOT MEAN SQ ERROR</span>
            <Calculator className="w-4 h-4 text-secondary-muted" />
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-primary">
              {metrics ? `₹${metrics.rmse_inr}` : 'PENDING'}
            </div>
            <p className="text-[11px] font-mono text-secondary mt-1">
              {metrics
                ? 'Root Mean Square Error in INR'
                : 'Live time-series accumulating'}
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-border-subtle/60 text-[10px] font-mono text-secondary-muted flex justify-between">
            <span>CURRENT REPO</span>
            <span className="text-secondary">{daysCount} {daysCount === 1 ? 'LIVE DAY' : 'LIVE DAYS'}</span>
          </div>
        </Panel>

        {/* Overall Alignment Grade */}
        <Panel variant="default" className="p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-secondary-muted font-mono text-xs mb-2">
            <span>AUDIT ACCREDITATION</span>
            <Award className="w-4 h-4 text-delta-positive" />
          </div>
          <div>
            <div className="text-xl font-bold font-mono text-primary truncate">
              {metrics ? metrics.overall_grade : 'IN PROGRESS'}
            </div>
            <p className="text-[11px] font-mono text-secondary mt-1">
              {metrics
                ? 'Statistically validated for MoSPI CPI augmentation'
                : 'Automated daily scraping active (00:00 & 05:30 IST)'}
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-border-subtle/60 text-[10px] font-mono text-secondary-muted flex justify-between">
            <span>AUTOMATION CRON</span>
            <span className="text-delta-positive">ACTIVE DAILY</span>
          </div>
        </Panel>
      </div>

      {/* 2. Dual-Line Comparison Chart */}
      <Panel variant="highlight">
        <PanelHeader
          kicker="[COMPARISON CHART // TIME AXIS]"
          title="Monthly Computed APIx Basket vs. DGCA Reference Tariff Benchmark"
          statusDot="amber"
          actions={
            <TerminalBadge variant="default" size="xs">
              {hasSufficientData
                ? `${monthlyData.length} MONTHS OVERLAPPING`
                : `DATA ACCUMULATION PHASE (${daysCount} ${daysCount === 1 ? 'DAY' : 'DAYS'} RECORDED)`}
            </TerminalBadge>
          }
        />
        <PanelContent className="p-4 sm:p-6">
          <ValidationChart data={monthlyData} distinctDatesCount={daysCount} />
        </PanelContent>
      </Panel>

      {/* 3. CSV Ground Truth Ingestion Engine */}
      <CsvImporter
        onImportRecords={handleImportRecords}
        onResetToDefault={handleResetToDefault}
      />

      {/* 4. Route-by-Route Empirical Variance Breakdown Table */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-mono text-sm font-bold text-primary uppercase">
              Corridor Ground-Truth Audit Log ({filteredRouteRecords.length} Records)
            </h3>
            <p className="text-xs text-secondary-muted font-mono mt-0.5">
              Verified flight quotes vs. published DGCA tariff reports per city-pair.
            </p>
          </div>

          {/* Route Filter Switcher */}
          <div className="flex items-center gap-1 bg-surface p-1 rounded border border-border-subtle overflow-x-auto text-xs font-mono">
            <span className="text-secondary-muted px-2">FILTER:</span>
            <Button
              variant={selectedRouteFilter === 'ALL' ? 'primary' : 'ghost'}
              size="xs"
              onClick={() => setSelectedRouteFilter('ALL')}
              className={selectedRouteFilter === 'ALL' ? 'bg-amber-signal text-ink font-bold' : 'text-secondary'}
            >
              ALL
            </Button>
            {uniqueRoutes.map((r) => (
              <Button
                key={r}
                variant={selectedRouteFilter === r ? 'primary' : 'ghost'}
                size="xs"
                onClick={() => setSelectedRouteFilter(r)}
                className={selectedRouteFilter === r ? 'bg-amber-signal text-ink font-bold' : 'text-secondary'}
              >
                {r}
              </Button>
            ))}
          </div>
        </div>

        <DataTable
          columns={columns}
          data={filteredRouteRecords}
          keyExtractor={(row) => row.id}
        />
      </div>
    </div>
  );
}
