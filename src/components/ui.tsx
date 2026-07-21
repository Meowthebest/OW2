import { useEffect, useId, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  CheckCircle2,
  Crosshair,
  Heart,
  LockKeyhole,
  Plus,
  Search,
  Shield,
  Skull,
  Star,
  X,
} from 'lucide-react';
import type { Hero, Role } from '../types';

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function RoleIcon({ role, size = 16 }: { role: Role; size?: number }) {
  if (role === 'Tank') return <Shield size={size} aria-hidden="true" />;
  if (role === 'Damage') return <Crosshair size={size} aria-hidden="true" />;
  return <Plus size={size} aria-hidden="true" />;
}

export function HeroPortrait({ hero, className, decorative = false }: { hero: Hero | undefined; className?: string; decorative?: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={cn('hero-portrait', className)}>
      {hero && !failed ? (
        <img src={hero.image} alt={decorative ? '' : hero.name} aria-hidden={decorative || undefined} onError={() => setFailed(true)} />
      ) : (
        <span>{hero ? hero.name.slice(0, 2).toUpperCase() : '?'}</span>
      )}
    </span>
  );
}

export type HeroCardStatus = 'available' | 'selected' | 'completed' | 'eliminated' | 'locked' | 'excluded' | 'out' | 'recent';

const statusCopy: Record<HeroCardStatus, string> = {
  available: 'Available',
  selected: 'Selected',
  completed: 'Completed',
  eliminated: 'Eliminated',
  locked: 'Locked',
  excluded: 'Excluded',
  out: 'Out of lives',
  recent: 'Recently used',
};

function StatusIcon({ status }: { status: HeroCardStatus }) {
  if (status === 'completed') return <CheckCircle2 size={13} />;
  if (status === 'eliminated' || status === 'out') return <Skull size={13} />;
  if (status === 'locked' || status === 'excluded') return <LockKeyhole size={13} />;
  if (status === 'selected') return <Check size={13} />;
  return null;
}

export function HeroCard({
  hero,
  status = 'available',
  compact = false,
  favorite = false,
  detail,
  disabled = false,
  onSelect,
  onFavorite,
}: {
  hero: Hero;
  status?: HeroCardStatus;
  compact?: boolean;
  favorite?: boolean;
  detail?: string;
  disabled?: boolean;
  onSelect?: () => void;
  onFavorite?: () => void;
}) {
  return (
    <article className={cn('hero-card', 'role-' + hero.role.toLowerCase(), 'state-' + status, compact && 'is-compact')}>
      <button
        type="button"
        className="hero-card__select"
        onClick={onSelect}
        disabled={disabled}
        aria-label={statusCopy[status] + ': ' + hero.name + (detail ? '. ' + detail : '')}
        aria-pressed={status === 'selected'}
      >
        <HeroPortrait hero={hero} decorative />
        <span className="hero-card__shade" aria-hidden="true" />
        <span className="hero-card__content">
          <span className="hero-card__role"><RoleIcon role={hero.role} size={13} /> {hero.role}</span>
          <strong>{hero.name}</strong>
          {detail && <small>{detail}</small>}
        </span>
        {status !== 'available' && status !== 'recent' && (
          <span className="hero-card__status"><StatusIcon status={status} /> {statusCopy[status]}</span>
        )}
        {status === 'recent' && <span className="hero-card__recent">Recent</span>}
      </button>
      {onFavorite && (
        <button
          type="button"
          className={cn('hero-card__favorite', favorite && 'is-active')}
          onClick={onFavorite}
          aria-label={(favorite ? 'Remove ' : 'Add ') + hero.name + (favorite ? ' from favorites' : ' to favorites')}
          aria-pressed={favorite}
          title={favorite ? 'Remove favorite' : 'Favorite hero'}
        >
          <Star size={15} fill={favorite ? 'currentColor' : 'none'} />
        </button>
      )}
    </article>
  );
}

export function SearchField({ value, onChange, placeholder = 'Search heroes…' }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="search-field">
      <Search size={17} aria-hidden="true" />
      <span className="sr-only">Search</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      {value && <button type="button" onClick={() => onChange('')} aria-label="Clear search"><X size={15} /></button>}
    </label>
  );
}

export function Metric({ label, value, detail, icon }: { label: string; value: ReactNode; detail?: string; icon?: ReactNode }) {
  return (
    <div className="metric-card">
      {icon && <span className="metric-card__icon">{icon}</span>}
      <span><small>{label}</small><strong>{value}</strong>{detail && <em>{detail}</em>}</span>
    </div>
  );
}

export function ProgressBar({ value, max, label, tone = 'orange' }: { value: number; max: number; label: string; tone?: 'orange' | 'green' | 'red' | 'blue' }) {
  const percent = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={cn('progress', 'progress--' + tone)}>
      <span className="progress__copy"><span>{label}</span><strong>{value} / {max}</strong></span>
      <span className="progress__track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
        <span style={{ width: percent + '%' }} />
      </span>
    </div>
  );
}

export function Toggle({ checked, onChange, title, description }: { checked: boolean; onChange: (checked: boolean) => void; title: string; description?: string }) {
  const id = useId();
  return (
    <label className="toggle-row" htmlFor={id}>
      <span><strong>{title}</strong>{description && <small>{description}</small>}</span>
      <input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="toggle-control" aria-hidden="true"><span /></span>
    </label>
  );
}

export function Modal({ open, onClose, title, eyebrow, children, size = 'medium', className }: { open: boolean; onClose: () => void; title: string; eyebrow?: string; children: ReactNode; size?: 'small' | 'medium' | 'large' | 'drawer'; className?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.classList.add('modal-open');
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('modal-open');
    };
  }, [onClose, open]);

  if (!open) return null;
  return createPortal(
    <div className="modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={cn('modal', 'modal--' + size, className)} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal__header">
          <div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={19} /></button>
        </header>
        <div className="modal__body">{children}</div>
      </section>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({ open, title = 'Are you sure?', message, confirmLabel = 'Confirm', danger = true, onConfirm, onCancel }: { open: boolean; title?: string; message: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal open={open} onClose={onCancel} title={title} eyebrow="Confirmation" size="small" className="confirm-dialog">
      <div className="confirm-dialog__symbol">{danger ? <Skull size={28} /> : <Heart size={28} />}</div>
      <div className="confirm-dialog__message">{message}</div>
      <footer className="modal-actions">
        <button type="button" className="button button--ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className={cn('button', danger ? 'button--danger' : 'button--primary')} onClick={onConfirm}>{confirmLabel}</button>
      </footer>
    </Modal>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      {icon && <span className="empty-state__icon">{icon}</span>}
      <div><h3>{title}</h3><p>{description}</p></div>
      {action}
    </div>
  );
}

export function ToastRegion({ message, error }: { message: string; error: string }) {
  return (
    <div className="toast-region" aria-live="polite" aria-atomic="true">
      {message && <div className="toast toast--success"><CheckCircle2 size={18} />{message}</div>}
      {error && <div className="toast toast--error"><X size={18} />{error}</div>}
    </div>
  );
}
