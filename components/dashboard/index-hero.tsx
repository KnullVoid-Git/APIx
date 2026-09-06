'use client';

import * as React from 'react';
import { Panel, PanelHeader, PanelContent } from '@/components/ui/panel';
import { SplitFlapDisplay } from '@/components/ui/split-flap';
import { DeltaBadge } from '@/components/ui/delta-badge';
import { TerminalBadge } from '@/components/ui/terminal-badge';
import { Button } from '@/components/ui/button';
import { formatINR } from '@/lib/utils';
import { DailyIndex } from '@/types';
import { RefreshCw, Play, BarChart2, Layers, Cpu, Compass } from 'lucide-react';

interface IndexHeroProps {
  currentIndex: DailyIndex;
  audioEnabled: boolean;
}

const PRESETS = [
  { label: 'Current Base (104.82)', value: '104.82', delta: 1.42, desc: 'Normal 24h weighted metro average' },
  { label: 'Diwali Peak (118.60)', value: '118.60', delta: 13.78, desc: 'Festive surge across DEL-BOM & BLR-DEL' },
  { label: 'Monsoon Dip (97.40)', value: '97.40', delta: -7.42, desc: 'Seasonal off-peak correction' },
  { label: 'Weekend Spike (108.95)', value: '108.95', delta: 3.94, desc: 'T+1 and T+7 dynamic price climb' },
  { label: 'Flash Sale (94.15)', value: '94.15', delta: -10.67, desc: 'Airline 48h promotional fares' },
];

export function IndexHero({ currentIndex, audioEnabled }: IndexHeroProps) {
  const [displayedValue, setDisplayedValue] = React.useState<string>(
    (currentIndex?.apix_value ?? 186.53).toFixed(2)
  );
  const [currentDelta, setCurrentDelta] = React.useState<number>(currentIndex?.delta_24h ?? 30.29);
  const [activePresetIndex, setActivePresetIndex] = React.useState<number>(0);
  const [isSimulating, setIsSimulating] = React.useState<boolean>(false);

  const handleApplyPreset = (preset: typeof PRESETS[0], idx: number) => {
    setActivePresetIndex(idx);
    setDisplayedValue(preset.value);
    setCurrentDelta(preset.delta);
  };

  const handleRandomize = () => {
    const randomVal = (95 + Math.random() * 25).toFixed(2);
    const randomDelta = Number(((Number(randomVal) - 100) * 0.4).toFixed(2));
    setActivePresetIndex(-1);
    setDisplayedValue(randomVal);
    setCurrentDelta(randomDelta);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Split-Flap Terminal Board */}
      <Panel variant="highlight" className="overflow-hidden">
        <PanelHeader
          kicker="[INDEX-01 // NATIONAL METRIC]"
          title="APIx — NATIONAL AIRFARE PRICE INDEX"
          statusDot="amber"
          actions={
            <div className="flex items-center gap-2">
              <TerminalBadge variant="default" size="xs">
                FREQ: DAILY 06:00 IST
              </TerminalBadge>
              <TerminalBadge variant="amber" size="xs">
                LASPEYRES NORMALIZED
              </TerminalBadge>
            </div>
          }
        />

        <PanelContent className="p-4 sm:p-6 lg:p-8 bg-surface-subtle/30">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left Column: Signature Solari Flap Board */}
            <div className="lg:col-span-7 flex flex-col items-start gap-4">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="font-mono text-xs text-secondary-muted uppercase tracking-wider">
                  INSTRUMENT VALUE (BASE 2026.01 = 100.00):
                </span>
                <DeltaBadge
                  value={currentDelta}
                  format="percent"
                  size="md"
                  prefix="24H "
                />
              </div>

              {/* Solari Split-Flap Display */}
              <div className="w-full">
                <SplitFlapDisplay
                  value={`APIX ${displayedValue}`}
                  size="hero"
                  enableAudio={audioEnabled}
                  staggerMs={60}
                  cycleSteps={3}
                />
              </div>

              {/* Sub-telemetry under flap */}
              <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-secondary pt-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-secondary-muted">REFERENCE PERIOD:</span>
                  <span className="text-primary font-semibold">JAN 2026</span>
                </div>
                <span className="text-border-subtle">|</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-secondary-muted">SAMPLE MEDIAN:</span>
                  <span className="text-primary font-semibold">
                    {formatINR(currentIndex.median_basket_fare)}
                  </span>
                </div>
                <span className="text-border-subtle">|</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-secondary-muted">WEIGHTED BASKET:</span>
                  <span className="text-primary font-semibold">
                    {formatINR(currentIndex.weighted_basket_fare)}
                  </span>
                </div>
              </div>
            </div>

            {/* Right Column: Interactive Flap Tester & Simulation Controls */}
            <div className="lg:col-span-5 bg-surface border border-border-subtle/80 rounded p-4 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-border-subtle/60 pb-2">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-amber-signal" />
                  <span className="font-mono text-xs font-semibold text-primary uppercase">
                    SIMULATION & FLAP CONTROLS
                  </span>
                </div>
                <span className="font-mono text-[10px] text-secondary-muted">
                  INTERACTIVE TEST
                </span>
              </div>

              <p className="text-xs text-secondary leading-relaxed">
                Click any preset below or randomize to trigger the mechanical Solari board flap cascade with realistic character transitions.
              </p>

              {/* Presets Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PRESETS.map((preset, idx) => (
                  <button
                    key={preset.value}
                    onClick={() => handleApplyPreset(preset, idx)}
                    className={`text-left p-2.5 rounded border transition-all font-mono text-xs flex flex-col gap-1 ${
                      activePresetIndex === idx
                        ? 'border-amber-signal/60 bg-amber-signal/10 text-primary shadow-amber-glow'
                        : 'border-border-subtle bg-surface-elevated/60 text-secondary hover:border-border-active hover:text-primary'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-primary">{preset.value}</span>
                      <DeltaBadge value={preset.delta} size="xs" />
                    </div>
                    <span className="text-[10px] text-secondary-muted truncate">
                      {preset.desc}
                    </span>
                  </button>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2 border-t border-border-subtle/60">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleRandomize}
                  className="flex-1"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1" />
                  RANDOMIZE FLAP VALUE
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleApplyPreset(PRESETS[0], 0)}
                  className="text-secondary"
                >
                  RESET
                </Button>
              </div>
            </div>
          </div>
        </PanelContent>
      </Panel>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Panel variant="default" className="p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-secondary-muted font-mono text-xs mb-2">
            <span>BASKET COVERAGE</span>
            <Layers className="w-4 h-4 text-amber-signal" />
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-primary">16 ROUTES</div>
            <p className="text-[11px] font-mono text-secondary mt-1">
              86.8% National DGCA volume (Trunk + Tier-2)
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-border-subtle/60 text-[10px] font-mono text-secondary-muted flex justify-between">
            <span>BASKET COMPOSITION</span>
            <span className="text-amber-signal">TRUNK + TIER-2</span>
          </div>
        </Panel>

        <Panel variant="default" className="p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-secondary-muted font-mono text-xs mb-2">
            <span>BOOKING WINDOWS</span>
            <Compass className="w-4 h-4 text-amber-signal" />
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-primary">T+1 TO T+45</div>
            <p className="text-[11px] font-mono text-secondary mt-1">
              5 Lead-time segments per city-pair
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-border-subtle/60 text-[10px] font-mono text-secondary-muted flex justify-between">
            <span>PRICE CURVE</span>
            <span className="text-delta-positive">DYNAMIC WEIGHTED</span>
          </div>
        </Panel>

        <Panel variant="default" className="p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-secondary-muted font-mono text-xs mb-2">
            <span>SAMPLED FARE QUOTES</span>
            <BarChart2 className="w-4 h-4 text-amber-signal" />
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-primary">1,420 / DAY</div>
            <p className="text-[11px] font-mono text-secondary mt-1">
              4 Airlines + 2 OTAs cleaned daily
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-border-subtle/60 text-[10px] font-mono text-secondary-muted flex justify-between">
            <span>TAX SPLIT</span>
            <span className="text-primary">BASE + GST NORMALIZED</span>
          </div>
        </Panel>

        <Panel variant="default" className="p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-secondary-muted font-mono text-xs mb-2">
            <span>PIPELINE HEALTH</span>
            <div className="w-2 h-2 rounded-full bg-delta-positive" />
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-delta-positive">NOMINAL</div>
            <p className="text-[11px] font-mono text-secondary mt-1">
              Robots.txt compliant, 0 drops
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-border-subtle/60 text-[10px] font-mono text-secondary-muted flex justify-between">
            <span>NEXT SCRAPE BATCH</span>
            <span className="text-secondary">06:00 IST (+19h)</span>
          </div>
        </Panel>
      </div>
    </div>
  );
}
