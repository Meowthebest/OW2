import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Flag, Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import type uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { formatInt } from '../../../lib/format';
import { extremes, formatCompactCount, niceMax } from '../core';

const SURFACE = '#10151f';
const INK = '#f5f8fc';
const INK_MUTED = '#8497b1';
const GRID = '#222c3b';
const FONT = '"Sofia Sans Condensed", "Arial Narrow", system-ui, sans-serif';

export interface ChartSeries {
  label: string;
  color: string;
  values: Array<number | null>;
  fill?: boolean;
}

export interface ChartMarker {
  id: string;
  time: number;
  label: string;
  href: string;
}

export interface PlayerChartProps {
  x: number[];
  series: ChartSeries[];
  low?: Array<number | null> | null;
  high?: Array<number | null> | null;
  start: number;
  end: number;
  markers?: ChartMarker[];
  height?: number;
  /** Spoken summary of what the chart shows. */
  label: string;
  /** Shades between the high and low series, for lines showing averages. */
  band?: boolean;
  /** The shortest time span the chart can zoom to, in seconds. */
  minSpan?: number;
  /** Words for the tooltip's low and high, such as "Day". */
  rowName?: string;
  /** Called with the visible time range whenever it changes. */
  onView?: (from: number, to: number) => void;
}

const formatTime = (seconds: number) => new Date(seconds * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

function setText(parent: HTMLElement, tag: string, className: string, text: string) {
  const node = document.createElement(tag);
  node.className = className;
  // Always text, never markup.
  node.textContent = text;
  parent.appendChild(node);
  return node;
}

/** The nearest index holding a real value, so a tooltip never reads across a gap. */
function nearestValueIndex(values: Array<number | null>, index: number) {
  if (values[index] !== null && values[index] !== undefined) return index;
  for (let step = 1; step < 4; step += 1) {
    if (values[index - step] !== null && values[index - step] !== undefined) return index - step;
    if (values[index + step] !== null && values[index + step] !== undefined) return index + step;
  }
  return null;
}

export function PlayerChart({ x, series, low, high, start, end, markers = [], height = 340, label, band = false, minSpan = 1800, rowName = 'Hour', onView }: PlayerChartProps) {
  const box = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const hintId = useId();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState({ from: start, to: end });
  const [positions, setPositions] = useState<Array<{ id: string; left: number }>>([]);
  const [plotBox, setPlotBox] = useState({ top: 0, height: 0 });

  const fullFrom = x.length > 1 ? start : start - 1800;
  const fullTo = x.length > 1 ? Math.max(end, start + 60) : end + 1800;
  const zoomed = view.from > fullFrom + 1 || view.to < fullTo - 1;

  const latest = useRef({ markers, onView, fullFrom, fullTo, minSpan });
  latest.current = { markers, onView, fullFrom, fullTo, minSpan };

  const applyView = useCallback((from: number, to: number) => {
    const u = plot.current;
    if (!u) return;
    const { fullFrom: lower, fullTo: upper } = latest.current;
    const span = Math.min(upper - lower, Math.max(latest.current.minSpan, to - from));
    let left = from;
    if (left < lower) left = lower;
    if (left + span > upper) left = upper - span;
    u.setScale('x', { min: left, max: left + span });
  }, []);

  const zoomBy = useCallback((factor: number, center?: number) => {
    const u = plot.current;
    if (!u) return;
    const from = u.scales.x.min as number;
    const to = u.scales.x.max as number;
    const middle = center ?? (from + to) / 2;
    applyView(middle - (middle - from) * factor, middle + (to - middle) * factor);
  }, [applyView]);

  const panBy = useCallback((share: number) => {
    const u = plot.current;
    if (!u) return;
    const from = u.scales.x.min as number;
    const to = u.scales.x.max as number;
    const shift = (to - from) * share;
    applyView(from + shift, to + shift);
  }, [applyView]);

  const resetView = useCallback(() => {
    applyView(latest.current.fullFrom, latest.current.fullTo);
  }, [applyView]);

  const placeMarkers = useCallback((u: uPlot) => {
    const from = u.scales.x.min as number;
    const to = u.scales.x.max as number;
    const dpr = window.devicePixelRatio || 1;
    setPlotBox({ top: u.bbox.top / dpr, height: u.bbox.height / dpr });
    setPositions(
      latest.current.markers
        .filter((marker) => marker.time >= from && marker.time <= to)
        .map((marker) => ({ id: marker.id, left: u.valToPos(marker.time, 'x') + u.bbox.left / dpr })),
    );
  }, []);

  const showBand = Boolean(band && low && high);
  const dataKey = `${x.length}|${x[0]}|${x[x.length - 1]}|${showBand}|${series.map((item) => `${item.label}:${item.values.length}`).join(',')}`;

  useEffect(() => {
    let alive = true;
    let instance: uPlot | null = null;
    let observer: ResizeObserver | null = null;
    const cleanups: Array<() => void> = [];

    import('uplot')
      .then(({ default: UPlot }) => {
        const node = box.current;
        if (!alive || !node) return;
        const primary = series[0].values;
        const bandSeries = showBand ? [high as Array<number | null>, low as Array<number | null>] : [];
        const highIndex = series.length + 1;
        const plotData = () => [x, ...series.map((item) => item.values), ...bandSeries] as uPlot.AlignedData;

        const updateTip = (u: uPlot) => {
          const element = tip.current;
          if (!element) return;
          const index = u.cursor.idx;
          const left = u.cursor.left ?? -10;
          if (index === null || index === undefined || left < 0) {
            element.hidden = true;
            return;
          }
          const found = nearestValueIndex(primary, index);
          if (found === null) {
            element.hidden = true;
            return;
          }
          element.replaceChildren();
          setText(element, 'strong', 'pstat-charttip__value', `${formatInt(primary[found])} players`);
          setText(element, 'span', 'pstat-charttip__time', formatTime(x[found]));
          if (low && high && low[found] !== null && high[found] !== null) {
            setText(element, 'span', 'pstat-charttip__range', `${rowName} low ${formatInt(low[found])}, high ${formatInt(high[found])}`);
          }
          series.slice(1).forEach((item) => {
            const value = item.values[found];
            if (value === null || value === undefined) return;
            const row = setText(element, 'span', 'pstat-charttip__row', `${item.label}: ${formatInt(value)}`);
            row.style.setProperty('--key', item.color);
          });
          element.hidden = false;
          const width = element.offsetWidth;
          const room = node.clientWidth;
          const dpr = window.devicePixelRatio || 1;
          const plotLeft = u.bbox.left / dpr;
          const wanted = plotLeft + left + 14;
          element.style.left = `${wanted + width > room ? Math.max(4, plotLeft + left - width - 14) : wanted}px`;
          element.style.top = `${u.bbox.top / dpr + 6}px`;
        };

        const options: uPlot.Options = {
          width: Math.max(240, node.clientWidth),
          height,
          padding: [10, 12, 0, 0],
          legend: { show: false },
          cursor: {
            y: false,
            points: { size: (_u, index) => (index > series.length ? 0 : 9), width: 2, stroke: SURFACE },
            drag: { x: true, y: false, setScale: true },
            bind: {
              // Hold Shift and drag to move along the chart. A plain drag selects a range to zoom into.
              mousedown: (u, _target, handler) => (event: MouseEvent) => {
                if (!event.shiftKey) {
                  handler(event);
                  return null;
                }
                const startX = event.clientX;
                const from = u.scales.x.min as number;
                const to = u.scales.x.max as number;
                const perPixel = (to - from) / (u.over.clientWidth || 1);
                const move = (moveEvent: MouseEvent) => {
                  const shift = (startX - moveEvent.clientX) * perPixel;
                  applyView(from + shift, to + shift);
                };
                const up = () => {
                  window.removeEventListener('mousemove', move);
                  window.removeEventListener('mouseup', up);
                };
                window.addEventListener('mousemove', move);
                window.addEventListener('mouseup', up);
                return null;
              },
            },
          },
          scales: {
            x: { time: true },
            y: { range: (_u, _min, max) => [0, niceMax(max ?? 1)] },
          },
          axes: [
            { stroke: INK_MUTED, font: `500 12px ${FONT}`, grid: { stroke: GRID, width: 1 }, ticks: { stroke: GRID, width: 1, size: 4 } },
            { stroke: INK_MUTED, font: `500 12px ${FONT}`, size: 46, grid: { stroke: GRID, width: 1 }, ticks: { show: false }, values: (_u, splits) => splits.map((value) => formatCompactCount(value)) },
          ],
          series: [
            {},
            ...series.map((item, index) => ({
              label: item.label,
              stroke: item.color,
              width: 2,
              spanGaps: false,
              fill: item.fill ? `${item.color}1a` : undefined,
              points: { show: index === 0 && x.length <= 40, size: 8, stroke: SURFACE, fill: item.color, width: 2 },
            })),
            ...bandSeries.map((_values, index) => ({ label: index === 0 ? 'High' : 'Low', stroke: 'transparent', width: 0, spanGaps: false, points: { show: false } })),
          ],
          bands: showBand ? [{ series: [highIndex, highIndex + 1], fill: `${series[0].color}2e` }] : undefined,
          hooks: {
            setCursor: [updateTip],
            setScale: [
              (u, key) => {
                if (key !== 'x') return;
                const from = u.scales.x.min as number;
                const to = u.scales.x.max as number;
                setView({ from, to });
                placeMarkers(u);
                latest.current.onView?.(from, to);
              },
            ],
            setSize: [placeMarkers],
            ready: [placeMarkers],
            draw: [
              (u) => {
                const from = u.scales.x.min as number;
                const to = u.scales.x.max as number;
                const found = extremes(x, primary, from, to, high, low);
                if (!found || found.high.players === found.low.players) return;
                const ratio = window.devicePixelRatio || 1;
                const { ctx } = u;
                const { left: boxLeft, top: boxTop, width: boxWidth } = u.bbox;
                ctx.save();
                ctx.font = `700 ${12 * ratio}px ${FONT}`;
                ctx.textBaseline = 'middle';
                ctx.textAlign = 'left';
                const mark = (point: { time: number; players: number }, text: string, above: boolean) => {
                  const px = u.valToPos(point.time, 'x', true);
                  const py = u.valToPos(point.players, 'y', true);
                  ctx.beginPath();
                  ctx.arc(px, py, 4 * ratio, 0, Math.PI * 2);
                  ctx.fillStyle = series[0].color;
                  ctx.strokeStyle = SURFACE;
                  ctx.lineWidth = 2 * ratio;
                  ctx.fill();
                  ctx.stroke();
                  const width = ctx.measureText(text).width;
                  const gap = 9 * ratio;
                  const onRight = px + gap + width < boxLeft + boxWidth;
                  const textX = onRight ? px + gap : px - gap - width;
                  // Keeps clear of the patch flags along the top edge.
                  const textY = Math.max(boxTop + 30 * ratio, py + (above ? -13 : 13) * ratio);
                  ctx.lineWidth = 3 * ratio;
                  ctx.strokeStyle = SURFACE;
                  ctx.strokeText(text, textX, textY);
                  ctx.fillStyle = INK;
                  ctx.fillText(text, textX, textY);
                };
                mark(found.high, `Peak ${formatInt(found.high.players)}`, true);
                mark(found.low, `Low ${formatInt(found.low.players)}`, false);
                ctx.restore();
              },
            ],
          },
        };

        instance = new UPlot(options, plotData(), node);
        plot.current = instance;
        setFailed(false);
        setReady(true);

        const over = instance.over;
        over.addEventListener('mouseleave', () => {
          if (tip.current) tip.current.hidden = true;
        });

        // Ctrl or Cmd with the wheel zooms. Plain scrolling is left alone so the page still scrolls.
        const onWheel = (event: WheelEvent) => {
          if (!event.ctrlKey && !event.metaKey) return;
          event.preventDefault();
          const u = plot.current;
          if (!u) return;
          const rect = over.getBoundingClientRect();
          zoomBy(event.deltaY < 0 ? 0.75 : 1.33, u.posToVal(event.clientX - rect.left, 'x'));
        };
        over.addEventListener('wheel', onWheel, { passive: false });
        cleanups.push(() => over.removeEventListener('wheel', onWheel));

        // Touch: one finger reads values or moves along the chart when zoomed, two fingers pinch to zoom.
        const touches = new Map<number, { x: number; y: number }>();
        let pinchDistance = 0;
        const onPointerDown = (event: PointerEvent) => {
          if (event.pointerType !== 'touch') return;
          touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
          if (touches.size === 2) {
            const [a, b] = [...touches.values()];
            pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
          }
        };
        const onPointerMove = (event: PointerEvent) => {
          if (event.pointerType !== 'touch' || !touches.has(event.pointerId)) return;
          const previous = touches.get(event.pointerId) as { x: number; y: number };
          touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
          const u = plot.current;
          if (!u) return;
          const rect = over.getBoundingClientRect();
          if (touches.size === 2) {
            const [a, b] = [...touches.values()];
            const distance = Math.hypot(a.x - b.x, a.y - b.y);
            if (pinchDistance > 0 && distance > 0) zoomBy(pinchDistance / distance, u.posToVal((a.x + b.x) / 2 - rect.left, 'x'));
            pinchDistance = distance;
            return;
          }
          const isZoomed = (u.scales.x.min as number) > latest.current.fullFrom + 1 || (u.scales.x.max as number) < latest.current.fullTo - 1;
          if (isZoomed) {
            const perPixel = ((u.scales.x.max as number) - (u.scales.x.min as number)) / (over.clientWidth || 1);
            const shift = (previous.x - event.clientX) * perPixel;
            applyView((u.scales.x.min as number) + shift, (u.scales.x.max as number) + shift);
          }
          u.setCursor({ left: event.clientX - rect.left, top: Math.max(0, event.clientY - rect.top) });
        };
        const onPointerUp = (event: PointerEvent) => {
          touches.delete(event.pointerId);
          pinchDistance = 0;
        };
        over.addEventListener('pointerdown', onPointerDown);
        over.addEventListener('pointermove', onPointerMove);
        over.addEventListener('pointerup', onPointerUp);
        over.addEventListener('pointercancel', onPointerUp);

        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(() => {
            if (node.clientWidth > 0 && instance) instance.setSize({ width: node.clientWidth, height });
          });
          observer.observe(node);
        }
      })
      .catch(() => {
        if (alive) setFailed(true);
      });

    return () => {
      alive = false;
      observer?.disconnect();
      cleanups.forEach((run) => run());
      instance?.destroy();
      if (plot.current === instance) plot.current = null;
    };
    // The key covers the data. Series arrays are rebuilt on every render, and rebuilding the chart for those would reset any zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey, height, applyView, placeMarkers, zoomBy]);

  // Reports the starting view, since uPlot only fires setScale once it has data.
  useLayoutEffect(() => {
    setView({ from: fullFrom, to: fullTo });
  }, [fullFrom, fullTo]);

  // Redraw series colors and values when an overlay changes without a change in length.
  const valuesKey = series.map((item) => item.values.reduce<number>((sum, value) => sum + (value ?? 0), 0)).join('|');
  useEffect(() => {
    plot.current?.setData([x, ...series.map((item) => item.values), ...(showBand ? [high as Array<number | null>, low as Array<number | null>] : [])] as uPlot.AlignedData, false);
    plot.current?.redraw(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valuesKey]);

  useEffect(() => {
    if (plot.current) placeMarkers(plot.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers.length, markers[0]?.id, ready]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowLeft') panBy(-0.2);
    else if (event.key === 'ArrowRight') panBy(0.2);
    else if (event.key === '+' || event.key === '=') zoomBy(0.75);
    else if (event.key === '-') zoomBy(1.33);
    else if (event.key === '0') resetView();
    else return;
    event.preventDefault();
  };

  if (failed) return <p className="pstat-note">The chart could not load in this browser. The table below has the same values.</p>;

  return (
    <div className="pstat-chart">
      <div className="pstat-chart__tools" role="group" aria-label="Chart zoom">
        <button type="button" className="pstat-tool" aria-label="Zoom in" onClick={() => zoomBy(0.6)}><ZoomIn size={16} aria-hidden="true" /></button>
        <button type="button" className="pstat-tool" aria-label="Zoom out" disabled={!zoomed} onClick={() => zoomBy(1.6)}><ZoomOut size={16} aria-hidden="true" /></button>
        <button type="button" className="pstat-tool" aria-label="Move earlier" disabled={!zoomed || view.from <= fullFrom + 1} onClick={() => panBy(-0.3)}><ChevronLeft size={16} aria-hidden="true" /></button>
        <button type="button" className="pstat-tool" aria-label="Move later" disabled={!zoomed || view.to >= fullTo - 1} onClick={() => panBy(0.3)}><ChevronRight size={16} aria-hidden="true" /></button>
        <button type="button" className="pstat-tool pstat-tool--wide" disabled={!zoomed} onClick={resetView}><Maximize2 size={14} aria-hidden="true" /> Reset zoom</button>
      </div>
      <div className="pstat-chart__stage" tabIndex={0} role="group" aria-label={label} aria-describedby={hintId} onKeyDown={onKeyDown}>
        <div className="pstat-chart__plot" ref={box} style={{ minHeight: height }} />
        <div className="pstat-charttip" ref={tip} hidden aria-hidden="true" />
        {positions.map((position) => {
          const marker = markers.find((item) => item.id === position.id);
          if (!marker) return null;
          return (
            <a key={marker.id} className="pstat-marker" href={marker.href} style={{ left: position.left, top: plotBox.top, height: plotBox.height }} aria-label={`${marker.label}. Open these patch notes`} title={marker.label}>
              <Flag size={12} aria-hidden="true" />
            </a>
          );
        })}
      </div>
      <p className="pstat-chart__hint" id={hintId}>
        Drag across the chart to zoom. Shift and drag, or the arrow keys, move along it. On touch, pinch to zoom.
      </p>
    </div>
  );
}

export default PlayerChart;
