import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { QueryErrorState } from '@/components/QueryErrorState';
import { useLiveQuery } from '@/db/hooks';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-system-ui', () => ({ setBackgroundColorAsync: jest.fn() }));

jest.setTimeout(60000);

let retry: (() => void) | null = null;

function Harness({ loader }: { loader: () => Promise<unknown> }) {
  const { error, refresh } = useLiveQuery(loader, [], 'test-query');
  retry = refresh;
  if (error) return <QueryErrorState onRetry={refresh} />;
  return <Text>loaded</Text>;
}

/** Let the live query's promise settle and re-render. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

function renderText(tree: ReactTestRenderer): string {
  return JSON.stringify(tree.toJSON());
}

describe('useLiveQuery error handling', () => {
  it('shows the shared error state when the query throws', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const loader = jest.fn(() => Promise.reject(new Error('boom')));
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<Harness loader={loader} />);
    });
    await flush();

    const text = renderText(tree);
    expect(text).toContain("Couldn't load this.");
    expect(text).toContain('Try again.');
    expect(loader).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it('shows the content, not the error state, when the query succeeds', async () => {
    const loader = jest.fn(() => Promise.resolve('ok'));
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<Harness loader={loader} />);
    });
    await flush();

    const text = renderText(tree);
    expect(text).toContain('loaded');
    expect(text).not.toContain("Couldn't load this.");
  });

  it('re-runs the query when retried after a failure', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const loader = jest.fn(() => Promise.reject(new Error('boom')));
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<Harness loader={loader} />);
    });
    await flush();
    expect(loader).toHaveBeenCalledTimes(1);

    await act(async () => {
      retry?.();
    });
    await flush();
    expect(loader).toHaveBeenCalledTimes(2);

    errorSpy.mockRestore();
  });
});
