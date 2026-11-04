import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Info, Minus } from 'lucide-react';
import { cn, formatInt } from '../../../lib/format';
import type { Sample } from '../core';

const prefersNoMotion = () => document.documentElement.dataset.motion === 'off' || (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

/** Counts smoothly to a new value when it changes. The first value shows straight away. Screen readers only get the final number. */
export function AnimatedNumber({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const previous = useRef(value);

  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (from === value) return undefined;
    if (prefersNoMotion()) {
      setShown(value);
      return undefined;
    }
    const started = performance.now();
    let frame = 0;
    const tick = (time: number) => {
      const progress = Math.min(1, (time - started) / 700);
      setShown(Math.round(from + (value - from) * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <>
      <span aria-hidden="true">{formatInt(shown)}</span>
      <span className="sr-only">{formatInt(value)}</span>
    </>
  );
}

/** An info button whose explanation shows on hover, keyboard focus or tap. */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <span className="pstat-info">
      <button type="button" className="pstat-info__button" aria-label={`About ${label}`} aria-describedby={id} onClick={(event) => event.currentTarget.focus()}>
        <Info size={14} aria-hidden="true" />
      </button>
      <span className="pstat-info__text" role="tooltip" id={id}>{children}</span>
    </span>
  );
}

/** A percent change. The arrow and sign repeat the color, so meaning never rests on color alone. */
export function ChangeValue({ percent, className }: { percent: number; className?: string }) {
  const direction = percent > 0 ? 'up' : percent < 0 ? 'down' : 'flat';
  const Icon = direction === 'up' ? ArrowUp : direction === 'down' ? ArrowDown : Minus;
  const sign = percent > 0 ? '+' : percent < 0 ? '−' : '';
  return (
    <span className={cn('pstat-change', className)} data-trend={direction}>
      <Icon size={15} strokeWidth={2.8} aria-hidden="true" />
      <span>{sign}{Math.abs(percent).toFixed(1)}%</span>
      <span className="sr-only">{direction === 'up' ? ' increase' : direction === 'down' ? ' decrease' : ' no change'}</span>
    </span>
  );
}

const GAP = 2 * 3600;

/** A small line of recent activity, broken where recording stopped. The numbers beside it carry its meaning. */
export function Sparkline({ points, width = 132, height = 34 }: { points: Sample[]; width?: number; height?: number }) {
  if (points.length < 2) return null;
  const times = points.map(([time]) => time);
  const values = points.map(([, value]) => value);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const x = (time: number) => 2 + ((time - minTime) / (maxTime - minTime || 1)) * (width - 6);
  const y = (value: number) => height - 3 - ((value - low) / (high - low || 1)) * (height - 7);
  let path = '';
  points.forEach(([time, value], index) => {
    const breakHere = index === 0 || time - points[index - 1][0] > GAP;
    path += `${breakHere ? 'M' : 'L'}${x(time).toFixed(1)},${y(value).toFixed(1)}`;
  });
  const [lastTime, lastValue] = points[points.length - 1];
  return (
    <svg className="pstat-spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
      <path d={path} fill="none" />
      <circle cx={x(lastTime)} cy={y(lastValue)} r={2.5} />
    </svg>
  );
}
