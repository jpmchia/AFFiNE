import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

import * as styles from './batch-progress.css';

interface BatchState {
  label: string;
  done: number;
  total: number;
}

interface BatchProgressContextValue {
  /**
   * Processes `items` through `fn` in chunks, yielding to the browser
   * between chunks so the UI stays responsive, and showing a progress
   * modal for larger batches. Small batches run synchronously.
   */
  run: <T>(label: string, items: T[], fn: (item: T) => void) => Promise<void>;
}

/** items processed per chunk before yielding back to the event loop */
const CHUNK_SIZE = 10;
/** batches at or below this size run synchronously without a modal */
const SYNC_THRESHOLD = 2;

const BatchProgressContext = createContext<BatchProgressContextValue>({
  // fallback used outside the provider: run synchronously
  run: (_label, items, fn) => {
    items.forEach(fn);
    return Promise.resolve();
  },
});

export const useBatchProgress = () => useContext(BatchProgressContext);

export const BatchProgressProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [state, setState] = useState<BatchState | null>(null);

  const run = useCallback(
    async <T,>(label: string, items: T[], fn: (item: T) => void) => {
      if (items.length <= SYNC_THRESHOLD) {
        items.forEach(fn);
        return;
      }
      setState({ label, done: 0, total: items.length });
      try {
        for (let i = 0; i < items.length; i += CHUNK_SIZE) {
          for (const item of items.slice(i, i + CHUNK_SIZE)) {
            fn(item);
          }
          setState({
            label,
            done: Math.min(i + CHUNK_SIZE, items.length),
            total: items.length,
          });
          // let the browser paint between chunks
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      } finally {
        setState(null);
      }
    },
    []
  );

  const value = useMemo(() => ({ run }), [run]);

  return (
    <BatchProgressContext.Provider value={value}>
      {children}
      {state ? (
        <div className={styles.overlay} data-testid="timeline-batch-progress">
          <div className={styles.dialog}>
            <div className={styles.label}>{state.label}</div>
            <div className={styles.track}>
              <div
                className={styles.bar}
                style={{
                  width: `${Math.round((state.done / state.total) * 100)}%`,
                }}
              />
            </div>
            <div className={styles.counter}>
              {state.done} / {state.total}
            </div>
          </div>
        </div>
      ) : null}
    </BatchProgressContext.Provider>
  );
};
