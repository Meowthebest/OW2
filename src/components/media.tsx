import { useEffect, useState } from 'react';
import type { Role } from '../data/heroes';
import { heroPortrait } from '../lib/assets';
import { cn } from '../lib/format';

function initials(name: string) {
  return name.replace(/[^\p{L}\p{N} ]/gu, '').split(' ').map((word) => word[0]).join('').slice(0, 2).toUpperCase() || '?';
}

/** Hero headshot that falls back to role-tinted initials if the file is missing. */
export function HeroPortrait({ id, name, role, className, eager = false }: { id: string; name: string; role?: Role; className?: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [id]);
  if (failed) {
    return <span className={cn('portrait portrait--fallback', className)} data-role={role} aria-hidden="true">{initials(name)}</span>;
  }
  return (
    <img
      className={cn('portrait', className)}
      src={heroPortrait(id)}
      alt=""
      width={256}
      height={256}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

/** Image from a third-party URL (player avatar, rank icon) with a graceful fallback. */
export function RemoteImage({ src, alt = '', className, fallback }: { src?: string | null; alt?: string; className?: string; fallback: React.ReactNode }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return <>{fallback}</>;
  return <img className={className} src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}
