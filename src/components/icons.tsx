import type { Role } from '../data/heroes';

export function RoleIcon({ role, size = 16 }: { role: Role; size?: number }) {
  const props = { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true, focusable: false } as const;
  if (role === 'tank') {
    return (
      <svg {...props} fill="currentColor">
        <path d="M12 1.8 21.5 5v7.2c0 5-3.9 8.6-9.5 10-5.6-1.4-9.5-5-9.5-10V5z" />
      </svg>
    );
  }
  if (role === 'damage') {
    return (
      <svg {...props} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square">
        <circle cx="12" cy="12" r="6.2" />
        <path d="M12 1.6v5M12 17.4v5M1.6 12h5M17.4 12h5" />
      </svg>
    );
  }
  return (
    <svg {...props} fill="currentColor">
      <path d="M8.6 2.5h6.8v6.1h6.1v6.8h-6.1v6.1H8.6v-6.1H2.5V8.6h6.1z" />
    </svg>
  );
}

export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <path d="M20 1.5 36.5 11v18L20 38.5 3.5 29V11z" fill="#f99e1a" />
      <path d="M20 5.2 33.3 12.9v14.2L20 34.8 6.7 27.1V12.9z" fill="none" stroke="#1c1004" strokeOpacity=".28" strokeWidth="1.4" />
      <circle cx="13.2" cy="13.8" r="3.5" fill="#1c1004" />
      <circle cx="20" cy="20" r="3.5" fill="#1c1004" />
      <circle cx="26.8" cy="26.2" r="3.5" fill="#1c1004" />
    </svg>
  );
}
