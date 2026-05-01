/**
 * CompanionNotificationContext
 *
 * Centralised notification bus for companion errors and status updates.
 * Provides useCompanionNotify() hook for pushing notifications and a
 * CompanionNotificationProvider that renders CompanionToastStack.
 *
 * Rules:
 *  - 'error' and 'critical' severity never auto-dismiss
 *  - 'info' and 'warning' auto-dismiss after 8 s
 *  - Duplicate notifications (same title + message) are suppressed
 */

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  type ReactNode,
} from 'react';
import type { CompanionErrorSeverity, CompanionRecovery } from '../types/companion';
import { CompanionToastStack } from '../components/companion/CompanionToastStack';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CompanionNotification {
  /** Unique ID — generated internally. */
  id: string;
  title: string;
  message: string;
  severity: CompanionErrorSeverity;
  recovery: CompanionRecovery;
  /** Label for the action button, if any. */
  actionLabel?: string;
  onAction?: () => void;
  createdAt: number;
}

export type PushNotificationInput = Omit<CompanionNotification, 'id' | 'createdAt'>;

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

type NotificationState = CompanionNotification[];

type NotificationAction =
  | { type: 'PUSH'; payload: CompanionNotification }
  | { type: 'DISMISS'; id: string }
  | { type: 'DISMISS_ALL' };

function notificationReducer(
  state: NotificationState,
  action: NotificationAction,
): NotificationState {
  switch (action.type) {
    case 'PUSH': {
      const incoming = action.payload;
      // Deduplicate: suppress if a notification with the same title + message already exists
      const isDuplicate = state.some(
        (n) => n.title === incoming.title && n.message === incoming.message,
      );
      if (isDuplicate) return state;
      // Keep at most 5 notifications; drop the oldest if needed
      const capped = state.length >= 5 ? state.slice(1) : state;
      return [...capped, incoming];
    }
    case 'DISMISS':
      return state.filter((n) => n.id !== action.id);
    case 'DISMISS_ALL':
      return [];
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface CompanionNotificationContextValue {
  notifications: CompanionNotification[];
  push: (notification: PushNotificationInput) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

const CompanionNotificationContext =
  createContext<CompanionNotificationContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

let idCounter = 0;
function generateId(): string {
  return `cn-${Date.now()}-${++idCounter}`;
}

export function CompanionNotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, dispatch] = useReducer(notificationReducer, []);

  const push = useCallback((input: PushNotificationInput) => {
    dispatch({
      type: 'PUSH',
      payload: { ...input, id: generateId(), createdAt: Date.now() },
    });
  }, []);

  const dismiss = useCallback((id: string) => {
    dispatch({ type: 'DISMISS', id });
  }, []);

  const dismissAll = useCallback(() => {
    dispatch({ type: 'DISMISS_ALL' });
  }, []);

  return (
    <CompanionNotificationContext.Provider value={{ notifications, push, dismiss, dismissAll }}>
      {children}
      <CompanionToastStack />
    </CompanionNotificationContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Access the companion notification system.
 *
 * Must be used within <CompanionNotificationProvider>.
 * Returns { push, dismiss, dismissAll, notifications }.
 */
export function useCompanionNotify(): CompanionNotificationContextValue {
  const ctx = useContext(CompanionNotificationContext);
  if (!ctx) {
    throw new Error('useCompanionNotify must be used within CompanionNotificationProvider');
  }
  return ctx;
}

/** Internal hook used only by CompanionToastStack — exposes raw context. */
export function useCompanionNotificationContext(): CompanionNotificationContextValue | null {
  return useContext(CompanionNotificationContext);
}
