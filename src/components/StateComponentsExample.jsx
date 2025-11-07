import React, { useState } from 'react';
import {
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
} from './LoadingStates';

import {
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
} from './EmptyStates';

/**
 * Example Component showcasing all Loading States and Empty States
 * This is for demonstration purposes - remove or modify as needed
 */

const StateComponentsExample = () => {
  const [showOverlay, setShowOverlay] = useState(false);
  const [progress, setProgress] = useState(45);
  const [activeTab, setActiveTab] = useState('loading');

  return (
    <div className="p-8 space-y-8">
      <div className="glass-panel p-6">
        <h1 className="text-3xl font-bold text-primary mb-2">
          State Components Library
        </h1>
        <p className="text-base text-tertiary">
          Professional loading states and empty states for your application
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="glass-panel p-2 flex gap-2">
        <button
          onClick={() => setActiveTab('loading')}
          className={`px-6 py-3 rounded-lg font-medium transition-all ${
            activeTab === 'loading'
              ? 'bg-gradient-to-br from-[rgba(100,150,255,0.2)] to-[rgba(100,150,255,0.1)] border border-[rgba(100,150,255,0.3)] text-primary'
              : 'bg-transparent border border-transparent text-secondary hover:bg-[rgba(255,255,255,0.05)]'
          }`}
        >
          Loading States
        </button>
        <button
          onClick={() => setActiveTab('empty')}
          className={`px-6 py-3 rounded-lg font-medium transition-all ${
            activeTab === 'empty'
              ? 'bg-gradient-to-br from-[rgba(100,150,255,0.2)] to-[rgba(100,150,255,0.1)] border border-[rgba(100,150,255,0.3)] text-primary'
              : 'bg-transparent border border-transparent text-secondary hover:bg-[rgba(255,255,255,0.05)]'
          }`}
        >
          Empty States
        </button>
      </div>

      {/* Loading States Tab */}
      {activeTab === 'loading' && (
        <div className="space-y-8">
          {/* Spinners */}
          <div className="glass-panel p-6">
            <h2 className="text-2xl font-semibold text-primary mb-4">Spinners</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div>
                <h3 className="text-base font-medium text-secondary mb-4">Default Spinner</h3>
                <div className="flex flex-col items-center gap-4">
                  <Spinner size="xs" />
                  <Spinner size="sm" />
                  <Spinner size="md" />
                  <Spinner size="lg" />
                </div>
              </div>
              <div>
                <h3 className="text-base font-medium text-secondary mb-4">Dots Spinner</h3>
                <div className="flex flex-col items-center gap-4">
                  <DotsSpinner size="sm" />
                  <DotsSpinner size="md" />
                  <DotsSpinner size="lg" />
                </div>
              </div>
              <div>
                <h3 className="text-base font-medium text-secondary mb-4">Ring Spinner</h3>
                <div className="flex flex-col items-center gap-4">
                  <RingSpinner size="sm" />
                  <RingSpinner size="md" />
                  <RingSpinner size="lg" />
                </div>
              </div>
            </div>
          </div>

          {/* Progress Bars */}
          <div className="glass-panel p-6">
            <h2 className="text-2xl font-semibold text-primary mb-4">Progress Bars</h2>
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-medium text-secondary mb-3">Linear Progress</h3>
                <ProgressBar progress={progress} showLabel={true} />
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => setProgress(Math.max(0, progress - 10))}
                    className="btn-secondary"
                  >
                    -10%
                  </button>
                  <button
                    onClick={() => setProgress(Math.min(100, progress + 10))}
                    className="btn-secondary"
                  >
                    +10%
                  </button>
                </div>
              </div>

              <div>
                <h3 className="text-base font-medium text-secondary mb-3">
                  Indeterminate Progress
                </h3>
                <IndeterminateProgress />
              </div>

              <div>
                <h3 className="text-base font-medium text-secondary mb-3">Circular Progress</h3>
                <div className="flex gap-6">
                  <CircularProgress progress={progress} size="sm" />
                  <CircularProgress progress={progress} size="md" />
                  <CircularProgress progress={progress} size="lg" />
                </div>
              </div>
            </div>
          </div>

          {/* Skeleton Loaders */}
          <div className="glass-panel p-6">
            <h2 className="text-2xl font-semibold text-primary mb-4">Skeleton Loaders</h2>
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-medium text-secondary mb-3">Text Skeleton</h3>
                <SkeletonText lines={4} />
              </div>

              <div>
                <h3 className="text-base font-medium text-secondary mb-3">Card Skeleton</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <SkeletonCard showImage={true} />
                  <SkeletonCard showImage={false} />
                </div>
              </div>

              <div>
                <h3 className="text-base font-medium text-secondary mb-3">List Item Skeleton</h3>
                <div className="space-y-2">
                  <SkeletonListItem showAvatar={true} />
                  <SkeletonListItem showAvatar={true} />
                  <SkeletonListItem showAvatar={false} />
                </div>
              </div>

              <div>
                <h3 className="text-base font-medium text-secondary mb-3">Table Skeleton</h3>
                <SkeletonTable rows={3} columns={4} />
              </div>

              <div>
                <h3 className="text-base font-medium text-secondary mb-3">Avatar Skeleton</h3>
                <div className="flex gap-4 items-center">
                  <SkeletonAvatar size="xs" />
                  <SkeletonAvatar size="sm" />
                  <SkeletonAvatar size="md" />
                  <SkeletonAvatar size="lg" />
                  <SkeletonAvatar size="xl" />
                </div>
              </div>
            </div>
          </div>

          {/* Full Page Loaders */}
          <div className="glass-panel p-6">
            <h2 className="text-2xl font-semibold text-primary mb-4">Full Page Loaders</h2>
            <div className="space-y-4">
              <button
                onClick={() => setShowOverlay(true)}
                className="btn-primary"
              >
                Show Loading Overlay
              </button>

              <div className="border border-glass-border rounded-lg p-4">
                <h3 className="text-base font-medium text-secondary mb-3">Content Loader</h3>
                <ContentLoader type="ring" message="Loading data..." />
              </div>

              <div>
                <h3 className="text-base font-medium text-secondary mb-3">Dashboard Loader</h3>
                <DashboardLoader />
              </div>

              <div>
                <h3 className="text-base font-medium text-secondary mb-3">Form Loader</h3>
                <FormLoader fields={3} />
              </div>
            </div>
          </div>

          {/* Inline Loader */}
          <div className="glass-panel p-6">
            <h2 className="text-2xl font-semibold text-primary mb-4">Inline Loaders</h2>
            <div className="flex gap-4">
              <button className="btn-primary" disabled>
                <InlineLoader size="sm" />
                Loading...
              </button>
              <button className="btn-secondary" disabled>
                <InlineLoader size="sm" />
                Processing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty States Tab */}
      {activeTab === 'empty' && (
        <div className="space-y-8">
          {/* Base Empty State */}
          <div className="glass-panel p-6">
            <h2 className="text-2xl font-semibold text-primary mb-4">Base Empty State</h2>
            <EmptyState
              icon="folder"
              title="Custom Empty State"
              description="This is a customizable empty state component with your own content."
              action={{
                label: 'Primary Action',
                onClick: () => alert('Primary action clicked')
              }}
              secondaryAction={{
                label: 'Secondary Action',
                onClick: () => alert('Secondary action clicked')
              }}
            />
          </div>

          {/* Preset Empty States */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass-panel p-6">
              <h3 className="text-lg font-semibold text-primary mb-4">Empty Data</h3>
              <EmptyData
                onImport={() => alert('Import clicked')}
                onRefresh={() => alert('Refresh clicked')}
              />
            </div>

            <div className="glass-panel p-6">
              <h3 className="text-lg font-semibold text-primary mb-4">No Results</h3>
              <EmptyResults
                query="search term"
                onClearFilters={() => alert('Clear filters clicked')}
                onReset={() => alert('Reset clicked')}
              />
            </div>

            <div className="glass-panel p-6">
              <h3 className="text-lg font-semibold text-primary mb-4">Empty Folder</h3>
              <EmptyFolder
                folderName="Documents"
                onCreate={() => alert('Create clicked')}
                onUpload={() => alert('Upload clicked')}
              />
            </div>

            <div className="glass-panel p-6">
              <h3 className="text-lg font-semibold text-primary mb-4">Empty Inbox</h3>
              <EmptyInbox />
            </div>

            <div className="glass-panel p-6">
              <h3 className="text-lg font-semibold text-primary mb-4">Empty List</h3>
              <EmptyList
                itemType="tasks"
                onCreate={() => alert('Create clicked')}
              />
            </div>

            <div className="glass-panel p-6">
              <h3 className="text-lg font-semibold text-primary mb-4">Empty Chart</h3>
              <EmptyChart chartType="analytics" />
            </div>

            <div className="glass-panel p-6">
              <h3 className="text-lg font-semibold text-primary mb-4">Empty Gallery</h3>
              <EmptyGallery onUpload={() => alert('Upload clicked')} />
            </div>

            <div className="glass-panel p-6">
              <h3 className="text-lg font-semibold text-primary mb-4">No Permission</h3>
              <EmptyPermission
                resource="this report"
                onRequest={() => alert('Request access clicked')}
              />
            </div>

            <div className="glass-panel p-6">
              <h3 className="text-lg font-semibold text-primary mb-4">Empty Users</h3>
              <EmptyUsers onInvite={() => alert('Invite clicked')} />
            </div>

            <div className="glass-panel p-6">
              <h3 className="text-lg font-semibold text-primary mb-4">Error State</h3>
              <ErrorState
                title="Connection Error"
                description="Failed to load data. Please check your connection and try again."
                onRetry={() => alert('Retry clicked')}
                onGoBack={() => alert('Go back clicked')}
              />
            </div>

            <div className="glass-panel p-6">
              <h3 className="text-lg font-semibold text-primary mb-4">Coming Soon</h3>
              <ComingSoon
                feature="Advanced Analytics"
                description="We're working on powerful analytics tools. Stay tuned!"
              />
            </div>
          </div>
        </div>
      )}

      {/* Loading Overlay Demo */}
      {showOverlay && (
        <LoadingOverlay
          message="Processing your request..."
          spinner="ring"
          transparent={false}
        />
      )}

      {/* Auto-close overlay after 3 seconds */}
      {showOverlay && setTimeout(() => setShowOverlay(false), 3000)}
    </div>
  );
};

export default StateComponentsExample;
