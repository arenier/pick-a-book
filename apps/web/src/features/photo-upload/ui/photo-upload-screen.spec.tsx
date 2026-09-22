import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PhotoUploadScreen } from './photo-upload-screen';

const jpeg = () =>
  new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'IMG_0001.jpg', { type: 'image/jpeg' });

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Answers the chained calls in order; `'pending'` stands for a request that never returns. */
const mockFetch = (...responses: (Response | Error | 'pending')[]) => {
  let answered = 0;
  const fetchMock = vi.fn<() => Promise<Response>>(async () => {
    const next = responses.at(answered);
    answered += 1;
    if (next === 'pending') {
      // Never settles: the screen stays in its loading state for as long as the test needs.
      return new Promise<Response>(() => {
        /* no settlement, ever */
      });
    }
    if (next instanceof Error) {
      throw next;
    }

    return next ?? jsonResponse(200, { books: [] });
  });
  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
};

const select = (file: File) => {
  const input = screen.getByLabelText(/photo/iu);
  fireEvent.change(input, { target: { files: [file] } });

  return input;
};

const submit = () => fireEvent.click(screen.getByRole('button', { name: /analyser/iu }));

const submitDisabled = () =>
  screen.getByRole('button', { name: /analyser/iu }).hasAttribute('disabled');

const storedThenScanned = (books: unknown[]) => [
  jsonResponse(201, { id: 'a-uuid' }),
  jsonResponse(200, { books }),
];

describe('PhotoUploadScreen, sending a photo', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a loading state while the photo is being read, then the books', async () => {
    mockFetch(
      ...storedThenScanned([{ author: 'Albert Camus', title: 'La Peste', confidence: 0.92 }]),
    );
    render(<PhotoUploadScreen />);

    select(jpeg());
    submit();

    await expect(screen.findByRole('status')).resolves.toBeDefined();
    await expect(screen.findByText('La Peste')).resolves.toBeDefined();
  });

  // Same screen whether the photo was just taken or picked from the gallery: which one it is
  // is the browser's business, not this screen's (US1 scenarios 1-2, FR-001).
  it('accepts a photo picked from the gallery just the same', async () => {
    mockFetch(...storedThenScanned([]));
    render(<PhotoUploadScreen />);

    select(new File([new Uint8Array([1, 2, 3])], 'vacances.png', { type: 'image/png' }));
    submit();

    await expect(screen.findByText(/aucun livre/iu)).resolves.toBeDefined();
  });

  it('asks for nothing before a photo is chosen', () => {
    const fetchMock = mockFetch();
    render(<PhotoUploadScreen />);

    expect(submitDisabled()).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('PhotoUploadScreen, one analysis at a time (FR-007)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refuses a second submission while one is running', async () => {
    const fetchMock = mockFetch('pending');
    render(<PhotoUploadScreen />);

    select(jpeg());
    submit();
    await waitFor(() => {
      expect(submitDisabled()).toBe(true);
    });

    submit();
    submit();

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('leaves the picker untouchable while an analysis is running', async () => {
    mockFetch('pending');
    render(<PhotoUploadScreen />);

    const input = select(jpeg());
    submit();

    await waitFor(() => {
      expect(input.hasAttribute('disabled')).toBe(true);
    });
  });
});
