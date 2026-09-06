'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { DeltaBadge } from '@/components/ui/delta-badge';
import { formatIndexValue } from '@/lib/utils';
import { TrendingUp, Clock, Database } from 'lucide-react';

export interface TimeSeriesPoint {
  date: string;
  apix: number;
  rawFare: number;
  delta24h: number;
  sampledRecords?: number;
  outliersExcluded?: number;
  activeRoutes?: number;
  partialBasket?: boolean;
}

type HorizonOption = 'ALL' | '30D' | '90D' | '365D';

export function IndexTrendChart() {
  const [horizon, setHorizon] = React.useState<HorizonOption>('ALL');
  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null);
  const [realData, setRealData] = React.useState<TimeSeriesPoint[]>([]);
  const [isLoading, setIsLoading] = React.useState<boolean>(true);

  const fetchTimeSeries = React.useCallback(async () => {
    try {
      const res = await fetch('/api/index?frequency=daily&limit=365');
      if (res.ok) {
        const json = await res.json();
        if (json.data && Array.isArray(json.data) && json.data.length > 0) {
          // Normalize API response fields (supporting index_date, apix_value, raw_weighted_fare, delta_24h, active_routes_count, partial_basket)
          const validPoints: TimeSeriesPoint[] = json.data
            .map((item: any) => {
              const rawDate = item.index_date || item.date;
              const date = typeof rawDate === 'string' ? rawDate.trim() : '';

              const apix =
                typeof item.apix_value === 'number'
                  ? item.apix_value
                  : typeof item.apix === 'number'
                  ? item.apix
                  : parseFloat(item.apix_value || item.apix);

              const rawFare =
                typeof item.raw_weighted_fare === 'number'
                  ? item.raw_weighted_fare
                  : typeof item.rawFare === 'number'
                  ? item.rawFare
                  : parseFloat(item.raw_weighted_fare || item.rawFare) || 5280;

              const delta24h =
                typeof item.delta_24h === 'number'
                  ? item.delta_24h
                  : typeof item.delta24h === 'number'
                  ? item.delta24h
                  : parseFloat(item.delta_24h || item.delta24h) || 0;

              const sampledRecords = item.records_sampled || item.sampledRecords || 0;
              const outliersExcluded = item.outliers_excluded || item.outliersExcluded || 0;
              const activeRoutes = item.active_routes_count || item.activeRoutes || 16;
              const isPartial = item.partial_basket !== undefined ? Boolean(item.partial_basket) : activeRoutes < 16;

              return {
                date,
                apix: Number.isFinite(apix) ? apix : 100,
                rawFare: Number.isFinite(rawFare) ? rawFare : 5280,
                delta24h: Number.isFinite(delta24h) ? delta24h : 0,
                sampledRecords: Number(sampledRecords) || 0,
                outliersExcluded: Number(outliersExcluded) || 0,
                activeRoutes,
                partialBasket: isPartial,
              };
            })
            .filter((pt: TimeSeriesPoint) => pt.date && pt.date.length >= 5 && Number.isFinite(pt.apix));

          if (validPoints.length > 0) {
            setRealData(validPoints);
          }
        }
      }
    } catch {
      // Keep empty if network issue
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchTimeSeries();

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchTimeSeries();
      }
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchTimeSeries]);

  // Use only real validated time-series points without synthetic backfilling
  const data: TimeSeriesPoint[] = realData;

  // Chart dimensions & scaling
  const width = 800;
  const height = 260;
  const padding = { top: 20, right: 30, bottom: 35, left: 55 };

  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  if (isLoading && data.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center border border-border-subtle/60 rounded bg-surface-subtle/20 text-secondary font-mono text-xs">
        <Clock className="w-5 h-5 text-amber-signal mb-2 animate-spin" />
        <span>LOADING REAL TIME-SERIES OBSERVATIONS...</span>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center border border-border-subtle/60 rounded bg-surface-subtle/20 text-secondary font-mono text-xs p-6 text-center">
        <Database className="w-6 h-6 text-amber-signal mb-2" />
        <span className="font-bold text-primary mb-1">NO HISTORICAL TIME-SERIES AVAILABLE</span>
        <span className="text-[11px] text-secondary-muted max-w-md">
          Awaiting scheduled daily pipeline runs to accumulate real observation dates.
        </span>
      </div>
    );
  }

  const minVal = Math.floor(Math.min(...data.map((d) => d.apix), 100.0) - 5);
  const maxVal = Math.ceil(Math.max(...data.map((d) => d.apix), 100.0) + 5);
  const yRange = Math.max(10, maxVal - minVal);

  const getX = (idx: number) =>
    Number((padding.left + (data.length > 1 ? (idx / (data.length - 1)) : 0.5) * innerWidth).toFixed(2));
  const getY = (val: number) =>
    Number((padding.top + innerHeight - (((Number.isFinite(val) ? val : 100) - minVal) / yRange) * innerHeight).toFixed(2));

  // Build SVG Path
  const points = data.map((d, i) => `${getX(i)},${getY(d.apix)}`);
  const linePath = data.length > 1 ? `M ${points.join(' L ')}` : '';
  const areaPath = data.length > 1
    ? `${linePath} L ${getX(data.length - 1)},${(padding.top + innerHeight).toFixed(2)} L ${getX(0)},${(padding.top + innerHeight).toFixed(2)} Z`
    : '';

  // Base 100 baseline Y
  const base100Y = getY(100.0);

  // Active hover point with complete fallback safety
  const activePoint: TimeSeriesPoint =
    (hoverIndex !== null && hoverIndex >= 0 && hoverIndex < data.length && data[hoverIndex]) ||
    data[data.length - 1] || {
      date: '—',
      apix: 100,
      rawFare: 5280,
      delta24h: 0,
    };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (data.length <= 1) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const svgX = (mouseX / rect.width) * width;

    if (svgX < padding.left || svgX > padding.left + innerWidth) {
      setHoverIndex(null);
      return;
    }

    const ratio = (svgX - padding.left) / innerWidth;
    const targetIdx = Math.min(data.length - 1, Math.max(0, Math.round(ratio * (data.length - 1))));
    setHoverIndex(targetIdx);
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  // Y-axis ticks
  const yTicks = [
    minVal,
    Math.round(minVal + yRange * 0.25),
    100.0,
    Math.round(minVal + yRange * 0.75),
    maxVal,
  ].filter((v, idx, arr) => arr.indexOf(v) === idx);

  // X-axis label samples
  const xLabels = data;

  return (
    <div className="space-y-4">
      {/* Chart Control Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle/60 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-primary font-mono text-xs">
            <TrendingUp className="w-3.5 h-3.5 text-amber-signal" />
            <span className="text-secondary-muted uppercase">SELECTED DATE:</span>
            <span className="font-bold text-primary">{activePoint.date}</span>
          </div>
          <span className="text-border-subtle">|</span>
          <div className="flex items-center gap-1.5 font-mono text-xs">
            <span className="text-secondary-muted">APIx:</span>
            <span className="text-amber-signal font-bold">{formatIndexValue(activePoint.apix)}</span>
          </div>
          {activePoint.partialBasket ? (
            <span className="px-2 py-0.5 rounded bg-amber-signal/15 border border-amber-signal/40 text-[10px] font-mono text-amber-signal font-bold">
              PARTIAL ({activePoint.activeRoutes ?? 2}/16 ROUTES)
            </span>
          ) : (
            <DeltaBadge value={activePoint.delta24h} size="xs" prefix="24H " />
          )}
        </div>

        {/* Live Observation Count */}
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded bg-surface-subtle border border-border-subtle text-[11px] font-mono text-amber-signal font-bold">
            {data.length} REAL {data.length === 1 ? 'OBSERVATION' : 'OBSERVATIONS'} ({data[0]?.date || ''} → {data[data.length - 1]?.date || ''})
          </span>
        </div>
      </div>

      {/* SVG Hairline Line Chart */}
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-56 sm:h-64 md:h-72 select-none cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            <linearGradient id="apixAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#E8A33D" stopOpacity="0.25" />
              <stop offset="70%" stopColor="#E8A33D" stopOpacity="0.04" />
              <stop offset="100%" stopColor="#E8A33D" stopOpacity="0.00" />
            </linearGradient>
          </defs>

          {/* Hairline Gridlines */}
          {yTicks.map((yVal) => {
            const y = getY(yVal);
            return (
              <g key={`ytick-${yVal}`}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={padding.left + innerWidth}
                  y2={y}
                  stroke="rgba(255, 255, 255, 0.07)"
                  strokeWidth="1"
                  strokeDasharray={yVal === 100 ? '4 4' : undefined}
                />
                <text
                  x={padding.left - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fill={yVal === 100 ? '#E8A33D' : '#677186'}
                  className="font-mono text-[10px]"
                  fontFamily="var(--font-mono), monospace"
                >
                  {yVal.toFixed(1)}
                </text>
              </g>
            );
          })}

          {/* Base 100 Reference Line */}
          {base100Y >= padding.top && base100Y <= padding.top + innerHeight && (
            <line
              x1={padding.left}
              y1={base100Y}
              x2={padding.left + innerWidth}
              y2={base100Y}
              stroke="#E8A33D"
              strokeWidth="1"
              strokeDasharray="3 3"
              strokeOpacity="0.6"
            />
          )}

          {/* Gradient Area Fill */}
          {areaPath && <path d={areaPath} fill="url(#apixAreaGrad)" />}

          {/* Main APIx Index Line */}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke="#E8A33D"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Observation Point Dots */}
          {data.map((pt, idx) => {
            const isPartial = Boolean(pt.partialBasket);
            if (isPartial) {
              return (
                <g key={`dot-${pt.date || idx}`}>
                  <circle
                    cx={getX(idx)}
                    cy={getY(pt.apix)}
                    r="4.5"
                    fill="#161D2C"
                    stroke="#E8A33D"
                    strokeWidth="1.8"
                    strokeDasharray="2.5 1.5"
                  />
                  <circle
                    cx={getX(idx)}
                    cy={getY(pt.apix)}
                    r="1.5"
                    fill="#E8A33D"
                  />
                </g>
              );
            }
            return (
              <circle
                key={`dot-${pt.date || idx}`}
                cx={getX(idx)}
                cy={getY(pt.apix)}
                r="4.5"
                fill="#E8A33D"
                stroke="#0E1420"
                strokeWidth="2"
              />
            );
          })}

          {/* X-axis ticks and labels */}
          {xLabels.map((pt, idx) => {
            const pointIdx = data.indexOf(pt);
            const x = getX(pointIdx >= 0 ? pointIdx : idx);
            const dateLabel =
              typeof pt.date === 'string' && pt.date.length >= 5
                ? pt.date.slice(5)
                : pt.date || '—';

            return (
              <g key={`xtick-${pt.date || idx}`}>
                <line
                  x1={x}
                  y1={padding.top + innerHeight}
                  x2={x}
                  y2={padding.top + innerHeight + 4}
                  stroke="rgba(255, 255, 255, 0.15)"
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={padding.top + innerHeight + 18}
                  textAnchor="middle"
                  fill="#677186"
                  className="font-mono text-[10px]"
                  fontFamily="var(--font-mono), monospace"
                >
                  {dateLabel} {/* MM-DD */}
                </text>
              </g>
            );
          })}

          {/* Hover Crosshair & Point Highlight */}
          {hoverIndex !== null && (
            <g>
              {/* Vertical Crosshair Line */}
              <line
                x1={getX(hoverIndex)}
                y1={padding.top}
                x2={getX(hoverIndex)}
                y2={padding.top + innerHeight}
                stroke="#F5F3EE"
                strokeWidth="1"
                strokeDasharray="2 2"
                strokeOpacity="0.5"
              />
              {/* Highlight Dot */}
              <circle
                cx={getX(hoverIndex)}
                cy={getY(data[hoverIndex].apix)}
                r="5.5"
                fill={data[hoverIndex].partialBasket ? '#161D2C' : '#E8A33D'}
                stroke={data[hoverIndex].partialBasket ? '#E8A33D' : '#0E1420'}
                strokeWidth="2"
              />
            </g>
          )}
        </svg>
      </div>

      {/* Axis Footer Annotations */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono text-secondary-muted pt-1">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-signal inline-block" />
            <span>FULL BASKET (16 CORRIDORS)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full border border-dashed border-amber-signal bg-[#161D2C] inline-block" />
            <span>PARTIAL BASKET (DIAGNOSTIC RUN)</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-0.5 border-t border-dashed border-amber-signal/60 inline-block" />
          <span>BASE PERIOD (JAN 2026 = 100.00)</span>
        </div>
      </div>
    </div>
  );
}
