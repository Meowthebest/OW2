import { ArrowDown, ArrowLeftRight, ArrowUp, Circle, CircleHelp, Wrench, type LucideIcon } from 'lucide-react';
import { cn } from '../../../lib/format';
import type { BalanceChange, HeroClass } from '../core/types';
import { CLASS_LABEL, DIRECTION_LABEL } from '../format';

const DIRECTION_ICON: Record<BalanceChange['direction'], LucideIcon> = {
  buff: ArrowUp,
  nerf: ArrowDown,
  neutral: Circle,
  qol: Circle,
  bugfix: Wrench,
  'needs-review': CircleHelp,
};

const CLASS_ICON: Record<HeroClass, LucideIcon> = {
  buff: ArrowUp,
  nerf: ArrowDown,
  mixed: ArrowLeftRight,
  neutral: Circle,
  fix: Wrench,
  'needs-review': CircleHelp,
};

/** A line's result. The arrow and its color repeat the text, so nothing depends on color alone. */
export function DirectionLabel({ direction, situational = false, className }: { direction: BalanceChange['direction']; situational?: boolean; className?: string }) {
  const Icon = DIRECTION_ICON[direction];
  return (
    <span className={cn('direction', className)} data-direction={direction}>
      <Icon size={14} strokeWidth={2.6} aria-hidden="true" />
      <span>{situational ? `Situational ${DIRECTION_LABEL[direction].toLowerCase()}` : DIRECTION_LABEL[direction]}</span>
    </span>
  );
}

export function DirectionMark({ direction }: { direction: BalanceChange['direction'] }) {
  const Icon = DIRECTION_ICON[direction];
  return (
    <span className="direction-mark" data-direction={direction} aria-hidden="true">
      <Icon size={14} strokeWidth={2.8} />
    </span>
  );
}

/** A hero's overall result in one patch and format. */
export function ClassBadge({ classification, className }: { classification: HeroClass; className?: string }) {
  const Icon = CLASS_ICON[classification];
  return (
    <span className={cn('class-badge', className)} data-class={classification}>
      <Icon size={14} strokeWidth={2.8} aria-hidden="true" />
      <span><span className="sr-only">Overall result: </span>{CLASS_LABEL[classification]}</span>
    </span>
  );
}

export { CLASS_ICON };
