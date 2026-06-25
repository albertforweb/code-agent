import { useEffect, useState } from 'react';

export type PromiseState<T> =
  | { status: 'pending' }
  | { status: 'fulfilled'; value: T }
  | { status: 'rejected'; error: unknown };

export function usePromiseState<T>(promise: Promise<T>): PromiseState<T> {
  const [state, setState] = useState<PromiseState<T>>({ status: 'pending' });

  useEffect(() => {
    let active = true;
    setState({ status: 'pending' });
    promise.then(
      value => {
        if (active) setState({ status: 'fulfilled', value });
      },
      error => {
        if (active) setState({ status: 'rejected', error });
      },
    );
    return () => {
      active = false;
    };
  }, [promise]);

  return state;
}
