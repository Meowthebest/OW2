import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Clapperboard, Gift, IdCard, ImageOff, KeyRound, Mic, PartyPopper, Quote, Shirt, Smile, SprayCan, Swords, UserRound, X, ZoomIn, type LucideIcon } from 'lucide-react';
import { cn } from '../../../lib/format';
import type { CosmeticType } from '../core/types';
import { resizedImage } from '../core/text';

const TYPE_ICON: Record<CosmeticType, LucideIcon> = {
  skin: Shirt,
  'weapon-skin': Swords,
  'weapon-charm': KeyRound,
  souvenir: Gift,
  'highlight-intro': Clapperboard,
  'victory-pose': PartyPopper,
  emote: Smile,
  spray: SprayCan,
  'voice-line': Mic,
  'name-card': IdCard,
  'player-icon': UserRound,
  'player-title': Quote,
};

export function TypeIcon({ type, size = 16 }: { type: CosmeticType | null; size?: number }) {
  const Icon = type ? TYPE_ICON[type] : ImageOff;
  return <Icon size={size} aria-hidden="true" />;
}

/** A cosmetic's image. Holds its space while loading and falls back gracefully, so a missing image never moves the layout. */
export function Thumb({ src, alt = '', width = 400, type = null, text, className, eager = false, fit = 'contain' }: { src: string | null | undefined; alt?: string; width?: number; type?: CosmeticType | null; text?: string; className?: string; eager?: boolean; fit?: 'contain' | 'cover' }) {
  // Tied to one image, so a new image starts fresh and a very fast failure can't be undone by a reset.
  const [state, setState] = useState({ src, stage: 0, loaded: false });
  const current = state.src === src ? state : { src, stage: 0, loaded: false };
  const { stage, loaded } = current;
  const image = useRef<HTMLImageElement>(null);

  // An image from the browser's cache can finish before React attaches onLoad.
  useEffect(() => {
    if (image.current?.complete && image.current.naturalWidth > 0) setState({ src, stage, loaded: true });
  }, [stage, src]);

  if (!src || stage === 2) {
    return (
      <span className={cn('cx-thumb cx-thumb--empty', text && 'cx-thumb--text', className)}>
        {text ? <span className="cx-thumb__text">{text}</span> : <TypeIcon type={type} size={30} />}
      </span>
    );
  }

  const url = stage === 0 ? resizedImage(src, width) : src;
  return (
    <span className={cn('cx-thumb', loaded && 'is-loaded', fit === 'cover' && 'cx-thumb--cover', className)}>
      <img
        ref={image}
        src={url}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => setState({ src, stage, loaded: true })}
        onError={() => setState({ src, stage: url === src ? 2 : 1, loaded: false })}
      />
    </span>
  );
}

/** A full-size view of an image, opened from a button so it works by keyboard too. */
export function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="cx-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <button ref={closeButton} type="button" className="cx-lightbox__close" aria-label="Close image" onClick={onClose}>
        <X size={22} aria-hidden="true" />
      </button>
      <img src={src} alt={alt} referrerPolicy="no-referrer" />
    </div>
  );
}

/** An image that opens the full-size view when it has one to show. */
export function ZoomableImage({ src, alt, width = 800, type = null, text, children }: { src: string | null | undefined; alt: string; width?: number; type?: CosmeticType | null; text?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!src) return <Thumb src={null} type={type} text={text} />;
  return (
    <>
      <button type="button" className="cx-zoom" aria-label={`View a larger image of ${alt}`} onClick={() => setOpen(true)}>
        <Thumb src={src} alt={alt} width={width} type={type} eager />
        <span className="cx-zoom__hint" aria-hidden="true"><ZoomIn size={16} /></span>
        {children}
      </button>
      {open && <Lightbox src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}
