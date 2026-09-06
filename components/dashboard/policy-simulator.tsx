'use client';

import * as React from 'react';
import { Panel, PanelHeader, PanelContent, PanelFooter } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { TerminalBadge } from '@/components/ui/terminal-badge';
import { formatINR } from '@/lib/utils';
import { Sliders, Fuel, Receipt, TrendingUp, AlertTriangle, RotateCcw, Zap, Sparkles, X } from 'lucide-react';

interface PolicySimulatorProps {
  isOpen: boolean;
  onClose: () => void;
  baseIndexValue?: number;
  baseBasketFare?: number;
}

export function PolicySimulator({
  isOpen,
  onClose,
  baseIndexValue = 104.55,
  baseBasketFare = 5520,
}: PolicySimulatorProps) {
  const [atfChangePct, setAtfChangePct] = React.useState<number>(0);
  const [gstRate, setGstRate] = React.useState<number>(5); // 5% standard economy
  const [peakSurgeFactor, setPeakSurgeFactor] = React.useState<number>(0); // 0% - 40%

  // Escape key handler
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Econometric calculations:
  // 1. ATF is ~45% of airline CASK. A 10% ATF increase causes a ~4.5% fare increase.
  const atfFareMultiplier = 1 + (atfChangePct / 100) * 0.45;

  // 2. GST delta: Base has 5% GST included.
  const gstBasePrice = baseBasketFare / 1.05;
  const newGstPrice = gstBasePrice * (1 + gstRate / 100);
  const gstFareMultiplier = newGstPrice / baseBasketFare;

  // 3. Peak Surge Multiplier
  const surgeMultiplier = 1 + peakSurgeFactor / 100;

  // Combined Projected Fare
  const projectedBasketFare = Math.round(
    baseBasketFare * atfFareMultiplier * gstFareMultiplier * surgeMultiplier
  );

  const baselineJan2026 = 5280.0;
  const projectedApix = Number(((projectedBasketFare / baselineJan2026) * 100).toFixed(2));
  const apixDelta = Number((projectedApix - baseIndexValue).toFixed(2));

  // CPI Impact: Transport & Communication is ~8.59% of National CPI; domestic airfare is ~0.42% of CPI.
  const fareChangePct = ((projectedBasketFare - baseBasketFare) / baseBasketFare) * 100;
  const headlineCpiImpactBps = Number((fareChangePct * 0.42).toFixed(2));

  // Annualized passenger cost (150 Million domestic passengers annually)
  const annualPassengerDeltaCrores = Math.round(
    ((projectedBasketFare - baseBasketFare) * 150000000) / 10000000
  );

  const handleReset = () => {
    setAtfChangePct(0);
    setGstRate(5);
    setPeakSurgeFactor(0);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-2 sm:p-6 bg-black/85 backdrop-blur-md overflow-y-auto animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-3xl bg-[#121824] border border-border-subtle rounded-lg shadow-2xl overflow-hidden my-4 sm:my-8 font-mono"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Header */}
        <div className="sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 py-3.5 bg-[#161D2C] border-b border-border-subtle shadow-md">
          <div className="flex items-center gap-2 text-amber-signal text-xs">
            <Sliders className="w-4 h-4 shrink-0" />
            <span className="font-bold tracking-wider uppercase truncate">
              POLICY SIMULATOR (WHAT-IF SHOCKS)
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="xs" onClick={handleReset} className="gap-1 text-secondary">
              <RotateCcw className="w-3 h-3" />
              <span>RESET</span>
            </Button>
            <Button
              variant="outline"
              size="xs"
              onClick={onClose}
              className="gap-1 text-primary bg-surface-elevated hover:bg-surface-hover border-border-subtle"
            >
              <X className="w-3.5 h-3.5 text-amber-signal" />
              <span>CLOSE (ESC)</span>
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 sm:p-8 space-y-6 bg-[#0E1420]">
          <p className="text-xs text-secondary leading-relaxed font-sans">
            Model policy adjustments and macroeconomic shocks on India&apos;s National Airfare Price
            Index (APIx) and downstream headline Consumer Price Index (CPI) inflation.
          </p>

          {/* Slider Controls */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. ATF Shock */}
            <div className="p-4 rounded border border-border-subtle bg-surface/60 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-secondary-muted flex items-center gap-1.5">
                  <Fuel className="w-3.5 h-3.5 text-amber-signal" />
                  ATF FUEL SHOCK
                </span>
                <span className={`font-bold ${atfChangePct > 0 ? 'text-delta-negative' : atfChangePct < 0 ? 'text-delta-positive' : 'text-primary'}`}>
                  {atfChangePct > 0 ? '+' : ''}{atfChangePct}%
                </span>
              </div>
              <input
                type="range"
                min="-30"
                max="30"
                step="5"
                value={atfChangePct}
                onChange={(e) => setAtfChangePct(Number(e.target.value))}
                className="w-full accent-amber-signal cursor-pointer"
              />
              <span className="text-[10px] text-secondary-muted block">
                ATF pass-through elasticity: 45% of CASK
              </span>
            </div>

            {/* 2. GST Rate */}
            <div className="p-4 rounded border border-border-subtle bg-surface/60 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-secondary-muted flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5 text-amber-signal" />
                  GST RATE BRACKET
                </span>
                <span className="font-bold text-primary">{gstRate}%</span>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {[0, 5, 12, 18].map((rate) => (
                  <button
                    key={rate}
                    onClick={() => setGstRate(rate)}
                    className={`py-1 rounded text-xs border transition-all ${
                      gstRate === rate
                        ? 'bg-amber-signal text-ink font-bold border-amber-signal'
                        : 'bg-surface-elevated text-secondary border-border-subtle hover:text-primary'
                    }`}
                  >
                    {rate}%
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-secondary-muted block">
                Current Economy GST: 5% (Ad-valorem)
              </span>
            </div>

            {/* 3. Festival / Peak Capacity Shock */}
            <div className="p-4 rounded border border-border-subtle bg-surface/60 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-secondary-muted flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-amber-signal" />
                  FESTIVE SURGE SHOCK
                </span>
                <span className={`font-bold ${peakSurgeFactor > 0 ? 'text-delta-negative' : 'text-primary'}`}>
                  +{peakSurgeFactor}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="40"
                step="5"
                value={peakSurgeFactor}
                onChange={(e) => setPeakSurgeFactor(Number(e.target.value))}
                className="w-full accent-amber-signal cursor-pointer"
              />
              <span className="text-[10px] text-secondary-muted block">
                Holiday load-factor spike (Diwali/Puja)
              </span>
            </div>
          </div>

          {/* Real-time Projected Outputs */}
          <div className="p-5 rounded-lg border border-amber-signal/40 bg-surface-elevated/80 space-y-4 shadow-amber-glow">
            <div className="flex items-center justify-between border-b border-border-subtle/80 pb-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-primary">
                <Zap className="w-4 h-4 text-amber-signal" />
                <span>PROJECTED MACROECONOMIC IMPACT REPORT</span>
              </div>
              <TerminalBadge variant={apixDelta > 0 ? 'red' : apixDelta < 0 ? 'green' : 'amber'} size="xs">
                {apixDelta > 0 ? `+${apixDelta} PTS SURGE` : apixDelta < 0 ? `${apixDelta} PTS RELIEF` : 'BASELINE'}
              </TerminalBadge>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-[#090D15] rounded border border-border-subtle">
                <span className="text-[10px] text-secondary-muted block">PROJECTED APIx</span>
                <span className="text-xl font-bold text-primary">{projectedApix.toFixed(2)}</span>
                <span className="text-[10px] text-secondary-muted block mt-1">
                  vs {baseIndexValue.toFixed(2)} ({apixDelta >= 0 ? '+' : ''}{apixDelta} pts)
                </span>
              </div>

              <div className="p-3 bg-[#090D15] rounded border border-border-subtle">
                <span className="text-[10px] text-secondary-muted block">BASKET FARE</span>
                <span className="text-xl font-bold text-amber-signal">{formatINR(projectedBasketFare)}</span>
                <span className="text-[10px] text-secondary-muted block mt-1">
                  vs {formatINR(baseBasketFare)} ({fareChangePct >= 0 ? '+' : ''}{fareChangePct.toFixed(1)}%)
                </span>
              </div>

              <div className="p-3 bg-[#090D15] rounded border border-border-subtle">
                <span className="text-[10px] text-secondary-muted block">HEADLINE CPI IMPACT</span>
                <span className={`text-xl font-bold ${headlineCpiImpactBps > 0 ? 'text-delta-negative' : 'text-delta-positive'}`}>
                  {headlineCpiImpactBps >= 0 ? '+' : ''}{headlineCpiImpactBps} bps
                </span>
                <span className="text-[10px] text-secondary-muted block mt-1">
                  Transport Sub-Group (Item 6.2)
                </span>
              </div>

              <div className="p-3 bg-[#090D15] rounded border border-border-subtle">
                <span className="text-[10px] text-secondary-muted block">CONSUMER IMPACT</span>
                <span className={`text-xl font-bold ${annualPassengerDeltaCrores > 0 ? 'text-delta-negative' : 'text-delta-positive'}`}>
                  {annualPassengerDeltaCrores >= 0 ? '+' : ''}₹{Math.abs(annualPassengerDeltaCrores)} Cr
                </span>
                <span className="text-[10px] text-secondary-muted block mt-1">
                  Annualized Consumer Outlay
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-surface border-t border-border-subtle flex justify-between items-center text-xs">
          <span className="text-[11px] text-secondary-muted">
            Calibrated on MoSPI Laspeyres formulation & DGCA passenger volume elasticity
          </span>
          <Button variant="outline" size="xs" onClick={onClose} className="text-secondary hover:text-primary">
            CLOSE (ESC)
          </Button>
        </div>
      </div>
    </div>
  );
}
