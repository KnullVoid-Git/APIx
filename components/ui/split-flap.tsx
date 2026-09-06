'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export type SplitFlapSize = 'sm' | 'md' | 'lg' | 'hero';

interface SingleFlapProps {
  char: string;
  prevChar?: string;
  size?: SplitFlapSize;
  isFlipping?: boolean;
}

const CHAR_SET = ' 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ.-+%₹:';

// Helper for Web Audio API mechanical flap click
function playMechanicalTick() {
  try {
    if (typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    // Short mechanical snap click
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.025);
    
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.025);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.03);
  } catch {
    // Audio contexts might be blocked until user gesture, ignore silently
  }
}

/**
 * Renders a single Solari split-flap character unit with 3D top/bottom half flip
 */
export function SplitFlapDigit({
  char,
  prevChar = ' ',
  size = 'hero',
  isFlipping = false,
}: SingleFlapProps) {
  const [displayTop, setDisplayTop] = React.useState(char);
  const [displayBottom, setDisplayBottom] = React.useState(char);
  const [flipperTop, setFlipperTop] = React.useState(prevChar);
  const [flipperBottom, setFlipperBottom] = React.useState(char);
  const [animating, setAnimating] = React.useState(false);
  const prevCharRef = React.useRef(char);

  // When char changes, trigger the 3D flip lifecycle
  React.useEffect(() => {
    if (char === prevCharRef.current) return;

    const oldChar = prevCharRef.current;
    prevCharRef.current = char;

    setFlipperTop(oldChar);
    setFlipperBottom(char);
    setDisplayTop(char);
    setAnimating(true);

    const timer = setTimeout(() => {
      setDisplayBottom(char);
      setAnimating(false);
    }, 280);

    return () => clearTimeout(timer);
  }, [char]);

  // Special compact width for punctuation and spaces
  const isCompact = char === '.' || char === ':' || char === ' ' || char === '-';

  return (
    <div
      className={cn(
        'flap-container shrink-0 relative bg-[#0B0F17] rounded shadow-[0_2px_8px_rgba(0,0,0,0.6)] select-none border border-[#232F46]/80',
        `flap-size-${size}`
      )}
      style={{
        width: isCompact ? 'var(--flap-w-compact)' : 'var(--flap-w)',
        height: 'var(--flap-h)',
      }}
    >
      {/* Mechanical Side Hinges */}
      <div className="flap-hinge-left" />
      <div className="flap-hinge-right" />

      {/* 1. Static Upper Flap (shows next char top half) */}
      <div className="flap-half flap-top absolute top-0 left-0 right-0 w-full overflow-hidden text-primary font-mono h-1/2">
        <span
          className="absolute top-0 left-0 right-0 w-full text-center font-bold tracking-tight select-none"
          style={{
            fontSize: 'var(--flap-fs)',
            lineHeight: 'var(--flap-h)',
            height: 'var(--flap-h)',
          }}
        >
          {displayTop}
        </span>
      </div>

      {/* 2. Static Lower Flap (shows current char bottom half) */}
      <div className="flap-half flap-bottom absolute bottom-0 left-0 right-0 w-full overflow-hidden text-primary font-mono h-1/2">
        <span
          className="absolute top-[-100%] left-0 right-0 w-full text-center font-bold tracking-tight select-none"
          style={{
            fontSize: 'var(--flap-fs)',
            lineHeight: 'var(--flap-h)',
            height: 'var(--flap-h)',
          }}
        >
          {displayBottom}
        </span>
      </div>

      {/* 3. Animated Top Flipper (flips down from 0 to -90 deg) */}
      {animating && (
        <div
          className="flap-half flap-top absolute top-0 left-0 right-0 w-full overflow-hidden z-20 text-primary font-mono origin-bottom transition-transform duration-150 ease-in h-1/2"
          style={{
            transform: 'rotateX(-90deg)',
            backfaceVisibility: 'hidden',
          }}
        >
          <span
            className="absolute top-0 left-0 right-0 w-full text-center font-bold tracking-tight select-none"
            style={{
              fontSize: 'var(--flap-fs)',
              lineHeight: 'var(--flap-h)',
              height: 'var(--flap-h)',
            }}
          >
            {flipperTop}
          </span>
        </div>
      )}

      {/* 4. Animated Bottom Flipper (flips from 90 to 0 deg) */}
      {animating && (
        <div
          className="flap-half flap-bottom absolute bottom-0 left-0 right-0 w-full overflow-hidden z-20 text-primary font-mono origin-top animate-flip-bottom h-1/2"
          style={{
            backfaceVisibility: 'hidden',
          }}
        >
          <span
            className="absolute top-[-100%] left-0 right-0 w-full text-center font-bold tracking-tight select-none"
            style={{
              fontSize: 'var(--flap-fs)',
              lineHeight: 'var(--flap-h)',
              height: 'var(--flap-h)',
            }}
          >
            {flipperBottom}
          </span>
        </div>
      )}

      {/* Center Split Seam */}
      <div className="flap-seam" />
    </div>
  );
}

export interface SplitFlapDisplayProps {
  value: string | number;
  label?: string;
  sublabel?: string;
  size?: SplitFlapSize;
  minLength?: number;
  enableAudio?: boolean;
  staggerMs?: number;
  cycleSteps?: number; // Number of intermediate mechanical steps per flip
  className?: string;
}

/**
 * SplitFlapDisplay: The signature Solari / Airport Departure Board numeral display.
 * Handles strings, numbers, decimals, and staggered multi-digit mechanical transitions.
 * Fully fluid and responsive across mobile (375px), tablet (768px), and desktop (1440px).
 */
export function SplitFlapDisplay({
  value,
  label,
  sublabel,
  size = 'hero',
  minLength = 0,
  enableAudio = false,
  staggerMs = 45,
  cycleSteps = 3,
  className,
}: SplitFlapDisplayProps) {
  const targetStr = String(value ?? '').toUpperCase().padStart(minLength, ' ');
  const [currentChars, setCurrentChars] = React.useState<string[]>(
    () => targetStr.split('')
  );
  const [prevChars, setPrevChars] = React.useState<string[]>(
    () => targetStr.split('')
  );
  const isFirstRender = React.useRef(true);
  const timersRef = React.useRef<NodeJS.Timeout[]>([]);

  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];

    const targetArray = targetStr.split('');
    setCurrentChars((prev) => {
      const paddedCurrent = [...prev];
      while (paddedCurrent.length < targetArray.length) {
        paddedCurrent.unshift(' ');
      }
      setPrevChars([...paddedCurrent]);

      // Animate each column with staggered stepping
      targetArray.forEach((targetChar, index) => {
        const fromChar = paddedCurrent[index] || ' ';
        if (fromChar === targetChar) return;

        const delay = index * staggerMs;

        // Intermediate cycling steps for authentic airport Solari effect
        for (let step = 1; step <= cycleSteps; step++) {
          const t = setTimeout(() => {
            if (step === cycleSteps) {
              setCurrentChars((c) => {
                const next = [...c];
                next[index] = targetChar;
                return next;
              });
              if (enableAudio) {
                playMechanicalTick();
              }
            } else {
              // Pick a rolling intermediate character
              const fromIndex = CHAR_SET.indexOf(fromChar);
              const intermediate =
                CHAR_SET[(fromIndex + step * 3) % CHAR_SET.length];
              setCurrentChars((c) => {
                const next = [...c];
                next[index] = intermediate;
                return next;
              });
              if (enableAudio && step === 1) {
                playMechanicalTick();
              }
            }
          }, delay + step * 50);

          timersRef.current.push(t);
        }
      });

      return paddedCurrent;
    });

    return () => {
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current = [];
    };
  }, [targetStr, staggerMs, cycleSteps, enableAudio]);

  // Group characters into word units so words wrap cleanly onto multiple lines without mid-word breaking
  const charGroups = React.useMemo(() => {
    const groups: { wordIdx: number; chars: { char: string; prevChar: string; index: number }[] }[] = [];
    let currentGroup: { char: string; prevChar: string; index: number }[] = [];
    let wordCounter = 0;

    currentChars.forEach((ch, idx) => {
      if (ch === ' ') {
        if (currentGroup.length > 0) {
          groups.push({ wordIdx: wordCounter++, chars: currentGroup });
          currentGroup = [];
        }
      } else {
        currentGroup.push({
          char: ch,
          prevChar: prevChars[idx] || ' ',
          index: idx,
        });
      }
    });

    if (currentGroup.length > 0) {
      groups.push({ wordIdx: wordCounter++, chars: currentGroup });
    }

    if (groups.length === 0 && currentChars.length > 0) {
      groups.push({
        wordIdx: 0,
        chars: currentChars.map((ch, idx) => ({
          char: ch,
          prevChar: prevChars[idx] || ' ',
          index: idx,
        })),
      });
    }

    return groups;
  }, [currentChars, prevChars]);

  return (
    <div className={cn('flex flex-col gap-2 w-full max-w-full', className)}>
      {(label || sublabel) && (
        <div className="flex items-center justify-between font-mono text-xs">
          {label && (
            <span className="text-secondary tracking-wider uppercase font-semibold">
              {label}
            </span>
          )}
          {sublabel && (
            <span className="text-secondary-muted">{sublabel}</span>
          )}
        </div>
      )}

      {/* Flap Units Container: Fluid wrap, zero horizontal scrollbar */}
      <div className="flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-2 p-2 sm:p-3 md:p-4 bg-[#090D15] rounded-md border border-border-subtle shadow-panel-elevated w-full max-w-full overflow-hidden">
        {charGroups.map((group) => (
          <div
            key={`word-${group.wordIdx}`}
            className="flex flex-wrap items-center gap-1 sm:gap-1.5 shrink-0 max-w-full"
          >
            {group.chars.map((item) => (
              <SplitFlapDigit
                key={`flap-${item.index}`}
                char={item.char}
                prevChar={item.prevChar}
                size={size}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
