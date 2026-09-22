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

const restart = () => fireEvent.click(screen.getByRole('button', { name: /recommencer/iu }));

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

describe('PhotoUploadScreen, a file the API would refuse (US2)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refuses a file that is not an image, without calling the API', async () => {
    const fetchMock = mockFetch();
    render(<PhotoUploadScreen />);

    select(new File([new Uint8Array([1, 2, 3])], 'facture.pdf', { type: 'application/pdf' }));

    await expect(screen.findByRole('alert')).resolves.toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(submitDisabled()).toBe(true);
  });

  it('refuses a photo heavier than 20 MB, without calling the API', async () => {
    const fetchMock = mockFetch();
    render(<PhotoUploadScreen />);
    const tooHeavy = jpeg();
    Object.defineProperty(tooHeavy, 'size', { value: 20 * 1024 * 1024 + 1 });

    select(tooHeavy);

    await expect(screen.findByText(/20 Mo/u)).resolves.toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // The refusal is undone by choosing another photo, not by reloading the page (FR-008).
  it('lets another photo be chosen right after a refusal', async () => {
    mockFetch(...storedThenScanned([]));
    render(<PhotoUploadScreen />);

    select(new File([new Uint8Array([1, 2, 3])], 'facture.pdf', { type: 'application/pdf' }));
    await expect(screen.findByRole('alert')).resolves.toBeDefined();
    select(jpeg());
    submit();

    await expect(screen.findByText(/aucun livre/iu)).resolves.toBeDefined();
  });
});

describe('PhotoUploadScreen, starting over (US4)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns to the initial state after a result, ready for another photo', async () => {
    mockFetch(
      ...storedThenScanned([{ author: 'Albert Camus', title: 'La Peste', confidence: 0.92 }]),
    );
    render(<PhotoUploadScreen />);

    select(jpeg());
    submit();
    await expect(screen.findByText('La Peste')).resolves.toBeDefined();
    restart();

    expect(screen.queryByText('La Peste')).toBeNull();
    expect(screen.queryByRole('button', { name: /recommencer/iu })).toBeNull();
    expect(submitDisabled()).toBe(true);
  });

  it('returns to the initial state after an error too', async () => {
    mockFetch(new TypeError('Failed to fetch'));
    render(<PhotoUploadScreen />);

    select(jpeg());
    submit();
    await expect(screen.findByRole('alert')).resolves.toBeDefined();
    restart();

    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('PhotoUploadScreen, two photos in a row (SC-003)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends a second photo without the page ever reloading', async () => {
    mockFetch(
      ...storedThenScanned([]),
      ...storedThenScanned([{ author: 'Albert Camus', title: 'La Peste', confidence: 0.92 }]),
    );
    render(<PhotoUploadScreen />);

    select(jpeg());
    submit();
    await expect(screen.findByText(/aucun livre/iu)).resolves.toBeDefined();
    restart();
    select(jpeg());
    submit();

    await expect(screen.findByText('La Peste')).resolves.toBeDefined();
  });
});
