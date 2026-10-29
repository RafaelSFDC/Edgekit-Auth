import React, { useId, type SVGProps } from 'react';

export type EdgekitModuleId = 'platform' | 'auth' | 'storage' | 'queue' | 'events';

// Legacy compatibility type
export type DioramaAppId = EdgekitModuleId | 'desktop' | 'driver' | 'update' | 'library' | 'care';

/**
 * Mapeamento das cores oficiais da família Edgekit.
 * Cada módulo possui uma cor de destaque no ecossistema, compartilhando o mesmo formato de logo.
 */
export const EDGEKIT_MODULE_HEX: Record<EdgekitModuleId, string> = {
  platform: '#F38020', // Orange (Cloudflare / Hub)
  auth: '#6366F1',     // Indigo (Auth / Sessions)
  storage: '#10B981',  // Emerald (Buckets / R2)
  queue: '#EC4899',    // Pink (Jobs / Messages)
  events: '#0EA5E9',   // Sky Blue (Realtime / WebSockets)
};

export const EDGEKIT_MODULE_COLORS: Record<EdgekitModuleId, string> = {
  platform: 'var(--primary, #6366F1)',
  auth: 'var(--primary, #6366F1)',
  storage: 'var(--primary, #6366F1)',
  queue: 'var(--primary, #6366F1)',
  events: 'var(--primary, #6366F1)',
};

export const EDGEKIT_MODULE_CSS_VARS: Record<EdgekitModuleId, string> = {
  platform: '--edgekit-platform',
  auth: '--edgekit-auth',
  storage: '--edgekit-storage',
  queue: '--edgekit-queue',
  events: '--edgekit-events',
};

// Backwards compatibility aliases
export const DIORAMA_APP_COLORS: Record<string, string> = {
  ...EDGEKIT_MODULE_COLORS,
  desktop: 'var(--edgekit-platform, #F38020)',
  driver: 'var(--edgekit-auth, #6366F1)',
  update: 'var(--edgekit-storage, #10B981)',
  library: 'var(--edgekit-queue, #EC4899)',
  care: 'var(--edgekit-events, #0EA5E9)',
};

export interface EdgekitLogoProps extends SVGProps<SVGSVGElement> {
  size?: number;
  variant?: 'app-icon' | 'symbol' | 'glow';
  module?: EdgekitModuleId;
  app?: DioramaAppId; // Alias for module
}

/**
 * Componente oficial de Logo do Edgekit.
 * No ecossistema Edgekit, todos os projetos compartilham a mesma marca vetorial
 * de alta performance, variando apenas a cor de identificação de cada módulo.
 */
export function EdgekitLogo({
  size = 24,
  variant = 'app-icon',
  module = 'auth',
  app,
  className = '',
  fill,
  ...props
}: EdgekitLogoProps) {
  const gradientId = useId();
  const activeModule = (app as EdgekitModuleId) ?? module;

  const brandColor =
    fill ??
    (activeModule && EDGEKIT_MODULE_COLORS[activeModule]
      ? EDGEKIT_MODULE_COLORS[activeModule]
      : 'var(--edgekit-auth, #6366F1)');

  const coreFill = variant === 'symbol' ? (fill ?? 'currentColor') : brandColor;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <defs>
        <linearGradient
          id={`edge-grad-${gradientId}`}
          x1="5"
          y1="3"
          x2="35"
          y2="37"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor={coreFill} stopOpacity="0.8" />
          <stop offset="1" stopColor={coreFill} stopOpacity="0.15" />
        </linearGradient>

        <filter
          id={`edge-glow-${gradientId}`}
          x="-20%"
          y="-20%"
          width="140%"
          height="140%"
          filterUnits="userSpaceOnUse"
        >
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Camada de Glow para variantes destacadas */}
      {variant === 'glow' && (
        <path
          d="M7 6C7 4.89543 7.89543 4 9 4H31C32.1046 4 33 4.89543 33 6V11H12V29H7V6Z"
          fill={coreFill}
          opacity="0.3"
          filter={`url(#edge-glow-${gradientId})`}
        />
      )}

      {/* Braço Superior (Lado Horizontal do E) */}
      <path
        d="M6 7C6 5.34315 7.34315 4 9 4H31C32.1046 4 33 4.89543 33 6C33 7.10457 32.1046 8 31 8H11C9.89543 8 9 8.89543 9 10V11H31C32.1046 11 33 11.8954 33 13C33 14.1046 32.1046 15 31 15H9V25H27C28.1046 25 29 25.8954 29 27C29 28.1046 28.1046 29 27 29H9V30C9 31.1046 9.89543 32 11 32H31C32.1046 32 33 32.8954 33 34C33 35.1046 32.1046 36 31 36H9C7.34315 36 6 34.6569 6 33V7Z"
        fill={coreFill}
      />

      {/* Nó Central Luminoso / Geometria de Conexão */}
      <circle
        cx="29"
        cy="20"
        r="3"
        fill={coreFill}
        opacity={variant === 'symbol' ? '1' : '0.9'}
      />

      {/* Tracejado de Conexão Rápida / Borda de Alta Precisão */}
      <path
        d="M20 20H26"
        stroke={coreFill}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="2 2"
        opacity="0.8"
      />
    </svg>
  );
}
