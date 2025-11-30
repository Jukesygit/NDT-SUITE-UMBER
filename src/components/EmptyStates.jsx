import React from 'react';
import '../styles/glassmorphic.css';

/**
 * Empty States Component Library
 * Provides various empty state templates with subtle illustrations,
 * clear messaging, and call-to-action buttons.
 */

// ========================================
// Empty State Icons (CSS/SVG)
// ========================================

const EmptyStateIcon = ({ type = 'default', size = 'lg' }) => {
  const sizes = {
    sm: '48px',
    md: '64px',
    lg: '96px',
    xl: '128px'
  };

  const icons = {
    default: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
      </svg>
    ),
    folder: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    ),
    document: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    search: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
    users: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
    data: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
      </svg>
    ),
    chart: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    inbox: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
      </svg>
    ),
    filter: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
      </svg>
    ),
    image: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    clipboard: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    )
  };

  return (
    <div
      style={{
        width: sizes[size],
        height: sizes[size],
        color: 'var(--text-dim)',
        opacity: 0.6,
        margin: '0 auto'
      }}
    >
      {icons[type] || icons.default}
    </div>
  );
};

// ========================================
// Base Empty State Component
// ========================================

/**
 * Base Empty State - Customizable foundation
 */
export const EmptyState = ({
  icon = 'default',
  iconSize = 'lg',
  title,
  description,
  action,
  secondaryAction,
  className = '',
  children
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center py-16 px-6 ${className}`}
      style={{ maxWidth: '480px', margin: '0 auto' }}
    >
      {/* Icon */}
      <div className="mb-6 opacity-0 animate-fadeIn" style={{ animationDelay: '0ms' }}>
        <EmptyStateIcon type={icon} size={iconSize} />
      </div>

      {/* Title */}
      {title && (
        <h3
          className="text-xl font-semibold text-primary mb-3 opacity-0 animate-slideInUp"
          style={{ animationDelay: '100ms', animationFillMode: 'forwards' }}
        >
          {title}
        </h3>
      )}

      {/* Description */}
      {description && (
        <p
          className="text-base text-tertiary leading-relaxed mb-6 opacity-0 animate-slideInUp"
          style={{ animationDelay: '200ms', animationFillMode: 'forwards' }}
        >
          {description}
        </p>
      )}

      {/* Custom Children */}
      {children && (
        <div
          className="mb-6 opacity-0 animate-slideInUp"
          style={{ animationDelay: '250ms', animationFillMode: 'forwards' }}
        >
          {children}
        </div>
      )}

      {/* Actions */}
      {(action || secondaryAction) && (
        <div
          className="flex flex-wrap gap-3 justify-center opacity-0 animate-slideInUp"
          style={{ animationDelay: '300ms', animationFillMode: 'forwards' }}
        >
          {action && (
            <button
              onClick={action.onClick}
              className="btn-primary"
              disabled={action.disabled}
            >
              {action.icon && <span dangerouslySetInnerHTML={{ __html: action.icon }} />}
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className="btn-secondary"
              disabled={secondaryAction.disabled}
            >
              {secondaryAction.icon && <span dangerouslySetInnerHTML={{ __html: secondaryAction.icon }} />}
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ========================================
// Preset Empty States
// ========================================

/**
 * No Data Empty State
 */
export const EmptyData = ({ title, description, onRefresh, onImport, className = '' }) => {
  return (
    <EmptyState
      icon="data"
      iconSize="xl"
      title={title || 'No Data Available'}
      description={description || 'There is no data to display at this time. Get started by importing or creating new records.'}
      action={onImport ? {
        label: 'Import Data',
        onClick: onImport,
        icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>'
      } : undefined}
      secondaryAction={onRefresh ? {
        label: 'Refresh',
        onClick: onRefresh,
        icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>'
      } : undefined}
      className={className}
    />
  );
};

/**
 * No Results Empty State (for search/filter)
 */
export const EmptyResults = ({ query, onClearFilters, onReset, className = '' }) => {
  return (
    <EmptyState
      icon="search"
      iconSize="lg"
      title="No Results Found"
      description={
        query
          ? `We couldn't find any results for "${query}". Try adjusting your search or filters.`
          : "No items match your current filters. Try adjusting your criteria."
      }
      action={onClearFilters ? {
        label: 'Clear Filters',
        onClick: onClearFilters
      } : undefined}
      secondaryAction={onReset ? {
        label: 'Reset Search',
        onClick: onReset
      } : undefined}
      className={className}
    />
  );
};

/**
 * Empty Folder/Collection
 */
export const EmptyFolder = ({ folderName, onCreate, onUpload, className = '' }) => {
  return (
    <EmptyState
      icon="folder"
      iconSize="xl"
      title={folderName ? `${folderName} is Empty` : 'This Folder is Empty'}
      description="There are no files or items in this folder yet. Start by adding some content."
      action={onCreate ? {
        label: 'Create New',
        onClick: onCreate,
        icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>'
      } : undefined}
      secondaryAction={onUpload ? {
        label: 'Upload',
        onClick: onUpload,
        icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>'
      } : undefined}
      className={className}
    />
  );
};

/**
 * Empty Inbox/Notifications
 */
export const EmptyInbox = ({ title, description, className = '' }) => {
  return (
    <EmptyState
      icon="inbox"
      iconSize="xl"
      title={title || 'All Caught Up!'}
      description={description || 'You have no new notifications. We\'ll let you know when something arrives.'}
      className={className}
    />
  );
};

/**
 * Empty List
 */
export const EmptyList = ({ itemType = 'items', onCreate, className = '' }) => {
  return (
    <EmptyState
      icon="clipboard"
      iconSize="lg"
      title={`No ${itemType} Yet`}
      description={`You haven't created any ${itemType} yet. Get started by creating your first one.`}
      action={onCreate ? {
        label: `Create ${itemType.slice(0, -1)}`,
        onClick: onCreate,
        icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>'
      } : undefined}
      className={className}
    />
  );
};

/**
 * Empty Chart/Analytics
 */
export const EmptyChart = ({ chartType = 'chart', description, className = '' }) => {
  return (
    <EmptyState
      icon="chart"
      iconSize="lg"
      title={`No ${chartType} Data`}
      description={description || `There isn't enough data to display this ${chartType} yet. Data will appear here as it becomes available.`}
      className={className}
    />
  );
};

/**
 * Empty Gallery/Images
 */
export const EmptyGallery = ({ onUpload, className = '' }) => {
  return (
    <EmptyState
      icon="image"
      iconSize="xl"
      title="No Images"
      description="There are no images in this gallery yet. Upload some images to get started."
      action={onUpload ? {
        label: 'Upload Images',
        onClick: onUpload,
        icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>'
      } : undefined}
      className={className}
    />
  );
};

/**
 * No Access/Permission
 */
export const EmptyPermission = ({ resource = 'this content', onRequest, className = '' }) => {
  return (
    <EmptyState
      icon="default"
      iconSize="lg"
      title="Access Restricted"
      description={`You don't have permission to view ${resource}. Contact your administrator if you believe this is an error.`}
      action={onRequest ? {
        label: 'Request Access',
        onClick: onRequest
      } : undefined}
      className={className}
    />
  );
};

/**
 * No Users/Team Members
 */
export const EmptyUsers = ({ onInvite, className = '' }) => {
  return (
    <EmptyState
      icon="users"
      iconSize="xl"
      title="No Team Members"
      description="Your team is empty. Invite colleagues to collaborate and work together."
      action={onInvite ? {
        label: 'Invite Members',
        onClick: onInvite,
        icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>'
      } : undefined}
      className={className}
    />
  );
};

/**
 * Error State (not technically empty, but similar pattern)
 */
export const ErrorState = ({ title, description, onRetry, onGoBack, className = '' }) => {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center py-16 px-6 ${className}`}
      style={{ maxWidth: '480px', margin: '0 auto' }}
    >
      {/* Error Icon */}
      <div className="mb-6">
        <div
          style={{
            width: '96px',
            height: '96px',
            color: 'var(--danger)',
            opacity: 0.8,
            margin: '0 auto'
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
      </div>

      {/* Title */}
      <h3 className="text-xl font-semibold text-primary mb-3">
        {title || 'Something Went Wrong'}
      </h3>

      {/* Description */}
      <p className="text-base text-tertiary leading-relaxed mb-6">
        {description || 'An unexpected error occurred. Please try again or contact support if the problem persists.'}
      </p>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 justify-center">
        {onRetry && (
          <button onClick={onRetry} className="btn-primary">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Try Again
          </button>
        )}
        {onGoBack && (
          <button onClick={onGoBack} className="btn-secondary">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Go Back
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * Coming Soon State
 */
export const ComingSoon = ({ feature, description, className = '' }) => {
  return (
    <EmptyState
      icon="default"
      iconSize="xl"
      title={feature ? `${feature} Coming Soon` : 'Coming Soon'}
      description={description || 'This feature is currently under development. Check back soon for updates!'}
      className={className}
    />
  );
};

// Export all components
export default {
  EmptyState,
  EmptyData,
  EmptyResults,
  EmptyFolder,
  EmptyInbox,
  EmptyList,
  EmptyChart,
  EmptyGallery,
  EmptyPermission,
  EmptyUsers,
  ErrorState,
  ComingSoon
};
