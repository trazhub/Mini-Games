import type { ButtonHTMLAttributes } from 'react';

export function ArcadeButton({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'soft' | 'danger' | 'ink' | 'ghost' }) {
  return <button type="button" className={`btn btn-${variant} ${className}`} {...props} />;
}

export function Arrow({ className = '' }: { className?: string }) {
  return <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 12h15M12 5l7 7-7 7" /></svg>;
}

export function Spark({ className = '' }: { className?: string }) {
  return <svg className={className} width="30" height="30" viewBox="0 0 40 40" fill="currentColor" aria-hidden="true"><path d="m20 0 4.5 12 11-7.5L28 16l12 4-12 4 7.5 11.5-11-7.5L20 40l-4.5-12-11 7.5L12 24 0 20l12-4L4.5 4.5l11 7.5Z" /></svg>;
}
