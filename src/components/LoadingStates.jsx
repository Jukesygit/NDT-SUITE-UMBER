import React from 'react';
import '../styles/glassmorphic.css';
import { MatrixLogoRacer } from './MatrixLogoLoader';

/**
 * Loading States Component Library
 * Provides various skeleton loaders, spinners, and progress indicators
 * matching the professional design system.
 */

// Shimmer effect keyframes are already in glassmorphic.css

// ========================================
// Spinner Components
// ========================================

/**
 * Primary Spinner - Elegant rotating loader
 */
export const Spinner = ({ size = 'md', color = 'primary', className = '' }) => {
  const sizes = {
    xs: '16px',
    sm: '20px',
    md: '32px',
    lg: '48px',
    xl: '64px'
  };

  const colors = {
    primary: 'var(--accent-blue)',
    white: 'var(--text-primary)',
    success: 'var(--success)',
    warning: 'var(--warning)',
    danger: 'var(--danger)'
  };

  return (
    <div
      className={`spinner ${className}`}
      style={{
        width: sizes[size],
        height: sizes[size],
        border: `${size === 'xs' || size === 'sm' ? '2px' : '3px'} solid rgba(255, 255, 255, 0.1)`,
        borderTopColor: colors[color],
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite'
      }}
      role="status"
      aria-label="Loading"
    />
  );
};

/**
 * Dots Spinner - Three animated dots
 */
export const DotsSpinner = ({ size = 'md', color = 'primary', className = '' }) => {
  const sizes = {
    sm: '6px',
    md: '8px',
    lg: '12px'
  };

  const colors = {
    primary: 'var(--accent-blue)',
    white: 'var(--text-primary)',
    success: 'var(--success)',
    warning: 'var(--warning)',
    danger: 'var(--danger)'
  };

  const dotStyle = {
    width: sizes[size],
    height: sizes[size],
    borderRadius: '50%',
    backgroundColor: colors[color],
    animation: 'subtlePulse 1.4s ease-in-out infinite'
  };

  return (
    <div
      className={`flex items-center gap-2 ${className}`}
      role="status"
      aria-label="Loading"
    >
      <div style={{ ...dotStyle, animationDelay: '0s' }} />
      <div style={{ ...dotStyle, animationDelay: '0.2s' }} />
      <div style={{ ...dotStyle, animationDelay: '0.4s' }} />
    </div>
  );
};

/**
 * Ring Spinner - Dual rotating rings
 */
export const RingSpinner = ({ size = 'md', className = '' }) => {
  const sizes = {
    sm: '24px',
    md: '40px',
    lg: '56px'
  };

  return (
    <div
      className={`relative ${className}`}
      style={{ width: sizes[size], height: sizes[size] }}
      role="status"
      aria-label="Loading"
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          border: '3px solid transparent',
          borderTopColor: 'var(--accent-blue)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: '4px',
          border: '3px solid transparent',
          borderTopColor: 'var(--accent-blue-dim)',
          borderRadius: '50%',
          animation: 'spin 1.5s linear infinite reverse'
        }}
      />
    </div>
  );
};

// ========================================
// Progress Bars
// ========================================

/**
 * Linear Progress Bar
 */
export const ProgressBar = ({
  progress = 0,
  showLabel = true,
  color = 'primary',
  height = 'md',
  className = ''
}) => {
  const colors = {
    primary: 'var(--accent-blue)',
    success: 'var(--success)',
    warning: 'var(--warning)',
    danger: 'var(--danger)'
  };

  const heights = {
    sm: '4px',
    md: '8px',
    lg: '12px'
  };

  return (
    <div className={className}>
      {showLabel && (
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-secondary font-medium">Loading...</span>
          <span className="text-sm text-tertiary font-medium">{Math.round(progress)}%</span>
        </div>
      )}
      <div
        style={{
          width: '100%',
          height: heights[height],
          backgroundColor: 'var(--glass-bg-secondary)',
          borderRadius: 'var(--radius-full)',
          overflow: 'hidden',
          border: '1px solid var(--glass-border)'
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${progress}%`,
            backgroundColor: colors[color],
            transition: 'width var(--transition-base)',
            boxShadow: `0 0 8px ${colors[color]}40`
          }}
        />
      </div>
    </div>
  );
};

/**
 * Indeterminate Progress Bar
 */
export const IndeterminateProgress = ({ color = 'primary', height = 'md', className = '' }) => {
  const colors = {
    primary: 'var(--accent-blue)',
    success: 'var(--success)',
    warning: 'var(--warning)',
    danger: 'var(--danger)'
  };

  const heights = {
    sm: '4px',
    md: '8px',
    lg: '12px'
  };

  return (
    <div
      className={className}
      style={{
        width: '100%',
        height: heights[height],
        backgroundColor: 'var(--glass-bg-secondary)',
        borderRadius: 'var(--radius-full)',
        overflow: 'hidden',
        border: '1px solid var(--glass-border)',
        position: 'relative'
      }}
    >
      <div
        style={{
          position: 'absolute',
          height: '100%',
          width: '40%',
          backgroundColor: colors[color],
          animation: 'shimmer 1.5s ease-in-out infinite',
          boxShadow: `0 0 8px ${colors[color]}40`
        }}
      />
    </div>
  );
};

/**
 * Circular Progress
 */
export const CircularProgress = ({
  progress = 0,
  size = 'md',
  showLabel = true,
  color = 'primary',
  className = ''
}) => {
  const sizes = {
    sm: { size: 40, stroke: 3 },
    md: { size: 64, stroke: 4 },
    lg: { size: 96, stroke: 5 }
  };

  const colors = {
    primary: 'var(--accent-blue)',
    success: 'var(--success)',
    warning: 'var(--warning)',
    danger: 'var(--danger)'
  };

  const { size: diameter, stroke } = sizes[size];
  const radius = (diameter - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className={`relative inline-flex ${className}`} style={{ width: diameter, height: diameter }}>
      <svg width={diameter} height={diameter} className="transform -rotate-90">
        <circle
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          stroke="var(--glass-bg-secondary)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          stroke={colors[color]}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{
            transition: 'stroke-dashoffset var(--transition-base)',
            filter: `drop-shadow(0 0 4px ${colors[color]}40)`
          }}
        />
      </svg>
      {showLabel && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-semibold text-primary">{Math.round(progress)}%</span>
        </div>
      )}
    </div>
  );
};

// ========================================
// Skeleton Loaders
// ========================================

/**
 * Base Skeleton Component
 */
export const Skeleton = ({
  width = '100%',
  height = '1rem',
  borderRadius = 'var(--radius-md)',
  className = ''
}) => {
  return (
    <div
      className={`skeleton ${className}`}
      style={{
        width,
        height,
        borderRadius,
        background: 'linear-gradient(90deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.08) 50%, rgba(255, 255, 255, 0.03) 100%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite'
      }}
      role="status"
      aria-label="Loading content"
    />
  );
};

/**
 * Text Skeleton - Multiple lines
 */
export const SkeletonText = ({ lines = 3, className = '' }) => {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          height="0.875rem"
          width={index === lines - 1 ? '60%' : '100%'}
        />
      ))}
    </div>
  );
};

/**
 * Card Skeleton
 */
export const SkeletonCard = ({ showImage = true, className = '' }) => {
  return (
    <div
      className={`glass-card p-6 ${className}`}
      style={{ minHeight: '200px' }}
    >
      {showImage && (
        <Skeleton
          height="140px"
          borderRadius="var(--radius-lg)"
          className="mb-4"
        />
      )}
      <Skeleton height="1.25rem" width="70%" className="mb-3" />
      <SkeletonText lines={2} />
      <div className="flex gap-2 mt-4">
        <Skeleton height="2rem" width="80px" borderRadius="var(--radius-md)" />
        <Skeleton height="2rem" width="80px" borderRadius="var(--radius-md)" />
      </div>
    </div>
  );
};

/**
 * List Item Skeleton
 */
export const SkeletonListItem = ({ showAvatar = true, className = '' }) => {
  return (
    <div className={`flex items-center gap-4 p-4 ${className}`}>
      {showAvatar && (
        <Skeleton
          width="48px"
          height="48px"
          borderRadius="var(--radius-full)"
        />
      )}
      <div className="flex-1 space-y-2">
        <Skeleton height="1rem" width="40%" />
        <Skeleton height="0.875rem" width="80%" />
      </div>
      <Skeleton width="60px" height="1.5rem" borderRadius="var(--radius-md)" />
    </div>
  );
};

/**
 * Table Skeleton
 */
export const SkeletonTable = ({ rows = 5, columns = 4, className = '' }) => {
  return (
    <div className={`glass-panel p-6 ${className}`}>
      {/* Header */}
      <div className="flex gap-4 mb-4 pb-4 border-b border-glass-border">
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={index} height="1rem" width="100px" />
        ))}
      </div>
      {/* Rows */}
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="flex gap-4">
            {Array.from({ length: columns }).map((_, colIndex) => (
              <Skeleton
                key={colIndex}
                height="0.875rem"
                width={colIndex === 0 ? '120px' : '80px'}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Avatar Skeleton
 */
export const SkeletonAvatar = ({ size = 'md', className = '' }) => {
  const sizes = {
    xs: '24px',
    sm: '32px',
    md: '48px',
    lg: '64px',
    xl: '96px'
  };

  return (
    <Skeleton
      width={sizes[size]}
      height={sizes[size]}
      borderRadius="var(--radius-full)"
      className={className}
    />
  );
};

// ========================================
// Full Page Loaders
// ========================================

/**
 * Full Page Loading Overlay
 */
export const LoadingOverlay = ({
  message = 'Loading...',
  spinner = 'matrix',
  transparent = false,
  className = ''
}) => {
  const spinners = {
    default: <Spinner size="lg" />,
    ring: <RingSpinner size="lg" />,
    dots: <DotsSpinner size="lg" />,
    matrix: <MatrixLogoRacer size={180} duration={4} />
  };

  // Matrix spinner uses different styling
  if (spinner === 'matrix') {
    return (
      <div
        className={`fixed inset-0 flex items-center justify-center z-50 ${className}`}
        style={{
          backgroundColor: transparent ? 'rgba(0, 0, 0, 0.5)' : 'rgba(10, 10, 10, 0.95)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)'
        }}
      >
        <div className="flex flex-col items-center gap-6">
          {spinners[spinner]}
          {message && (
            <p className="text-base text-gray-400 font-medium animate-pulse">{message}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center z-50 ${className}`}
      style={{
        backgroundColor: transparent ? 'rgba(0, 0, 0, 0.3)' : 'var(--bg-dark-overlay)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)'
      }}
    >
      <div
        className="glass-panel p-8 flex flex-col items-center gap-4"
        style={{ minWidth: '200px' }}
      >
        {spinners[spinner]}
        {message && (
          <p className="text-base text-secondary font-medium">{message}</p>
        )}
      </div>
    </div>
  );
};

/**
 * Content Loading State
 */
export const ContentLoader = ({
  type = 'matrix',
  message = 'Loading content...',
  className = ''
}) => {
  return (
    <div className={`flex flex-col items-center justify-center py-16 ${className}`}>
      {type === 'spinner' && <Spinner size="lg" />}
      {type === 'ring' && <RingSpinner size="lg" />}
      {type === 'dots' && <DotsSpinner size="lg" />}
      {type === 'matrix' && <MatrixLogoRacer size={160} duration={4} />}
      {message && (
        <p className={`text-base font-medium mt-4 ${type === 'matrix' ? 'text-gray-400 animate-pulse' : 'text-secondary'}`}>{message}</p>
      )}
    </div>
  );
};

/**
 * Inline Loader - for buttons and small spaces
 */
export const InlineLoader = ({ size = 'sm', className = '' }) => {
  return (
    <Spinner size={size} className={className} />
  );
};

// ========================================
// Composite Loading States
// ========================================

/**
 * Dashboard Loading State
 */
export const DashboardLoader = ({ className = '' }) => {
  return (
    <div className={`p-6 space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex justify-between items-center">
        <Skeleton height="2rem" width="200px" />
        <div className="flex gap-3">
          <Skeleton height="2.5rem" width="100px" borderRadius="var(--radius-md)" />
          <Skeleton height="2.5rem" width="100px" borderRadius="var(--radius-md)" />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="glass-card p-6">
            <Skeleton height="1rem" width="60%" className="mb-3" />
            <Skeleton height="2rem" width="40%" />
          </div>
        ))}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <SkeletonCard showImage={true} />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonListItem key={index} showAvatar={true} />
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * Form Loading State
 */
export const FormLoader = ({ fields = 4, className = '' }) => {
  return (
    <div className={`glass-panel p-6 space-y-4 ${className}`}>
      <Skeleton height="1.5rem" width="200px" className="mb-4" />
      {Array.from({ length: fields }).map((_, index) => (
        <div key={index} className="space-y-2">
          <Skeleton height="0.875rem" width="100px" />
          <Skeleton height="2.5rem" width="100%" borderRadius="var(--radius-md)" />
        </div>
      ))}
      <div className="flex gap-3 mt-6">
        <Skeleton height="2.5rem" width="120px" borderRadius="var(--radius-md)" />
        <Skeleton height="2.5rem" width="100px" borderRadius="var(--radius-md)" />
      </div>
    </div>
  );
};

// Export all components
export default {
  Spinner,
  DotsSpinner,
  RingSpinner,
  ProgressBar,
  IndeterminateProgress,
  CircularProgress,
  Skeleton,
  SkeletonText,
  SkeletonCard,
  SkeletonListItem,
  SkeletonTable,
  SkeletonAvatar,
  LoadingOverlay,
  ContentLoader,
  InlineLoader,
  DashboardLoader,
  FormLoader
};
