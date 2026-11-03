import { useId, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../lib/format';

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  ariaLabel?: string;
  disabled?: boolean;
}

/** Angled segmented control. `isActive` lets a control show several active segments at once. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  isActive,
  onChange,
  disabled = false,
  className,
}: {
  label: string;
  options: SegmentOption<T>[];
  value?: T;
  isActive?: (value: T) => boolean;
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('segmented', className)} role="group" aria-label={label}>
      {options.map((option) => {
        const active = isActive ? isActive(option.value) : option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className={cn('segmented__item', active && 'is-active')}
            aria-pressed={active}
            aria-label={option.ariaLabel}
            disabled={disabled || option.disabled}
            onClick={() => onChange(option.value)}
          >
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled = false }: { checked: boolean; onChange: (checked: boolean) => void; label: string; hint?: ReactNode; disabled?: boolean }) {
  const hintId = useId();
  return (
    <div className="toggle-row">
      <div className="toggle-row__text">
        <span className="toggle-row__label">{label}</span>
        {hint && <span className="toggle-row__hint" id={hintId}>{hint}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        aria-describedby={hint ? hintId : undefined}
        className={cn('switch', checked && 'is-on')}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span className="switch__thumb" />
      </button>
    </div>
  );
}

export function SelectField({ label, value, onChange, children, hideLabel = false, className }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode; hideLabel?: boolean; className?: string }) {
  return (
    <label className={cn('select-field', className)}>
      <span className={hideLabel ? 'sr-only' : 'select-field__label'}>{label}</span>
      <span className="select-field__control">
        <select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select>
        <ChevronDown size={15} aria-hidden="true" />
      </span>
    </label>
  );
}

export function Panel({ title, eyebrow, actions, className, children, id }: { title?: ReactNode; eyebrow?: ReactNode; actions?: ReactNode; className?: string; children: ReactNode; id?: string }) {
  return (
    <section className={cn('panel', className)} id={id}>
      {(title || actions) && (
        <header className="panel__head">
          <div className="panel__titles">
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            {title && <h2 className="panel__title">{title}</h2>}
          </div>
          {actions && <div className="panel__actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function StateBlock({ icon, title, children, actions, tone }: { icon?: ReactNode; title: string; children?: ReactNode; actions?: ReactNode; tone?: 'warn' | 'error' }) {
  return (
    <div className={cn('state-block', tone && 'state-block--' + tone)} role={tone === 'error' ? 'alert' : undefined}>
      {icon && <span className="state-block__icon" aria-hidden="true">{icon}</span>}
      <div className="state-block__text">
        <h3 className="state-block__title">{title}</h3>
        {children && <div className="state-block__body">{children}</div>}
        {actions && <div className="state-block__actions">{actions}</div>}
      </div>
    </div>
  );
}
