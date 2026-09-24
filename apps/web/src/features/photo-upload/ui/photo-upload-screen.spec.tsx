import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { UploadState } from '../model/upload-state';
import { PhotoUploadScreen } from './photo-upload-screen';

const aJpeg = () =>
  new File([new Uint8Array([0xff, 0xd8, 0xff])], 'IMG_0001.jpg', { type: 'image/jpeg' });

/** A submission the test settles by hand, to observe the screen while it is in flight. */
function aPendingSubmission() {
  const submitted: File[] = [];
  const resolvers: ((state: UploadState) => void)[] = [];
  const submit = async (file: File) => {
    submitted.push(file);
    return new Promise<UploadState>((resolve) => {
      resolvers.push(resolve);
    });
  };
  const settle = (state: UploadState) => {
    for (const resolve of resolvers) {
      resolve(state);
    }
  };

  return { submitted, submit, settle };
}

function choose(file: File) {
  fireEvent.change(screen.getByLabelText('Photo de l’étagère'), { target: { files: [file] } });
}

const sendButton = () => screen.getByRole('button', { name: 'Analyser la photo' });

describe('PhotoUploadScreen, happy path', () => {
  it('shows a loading state, then the detected books', async () => {
    const submission = aPendingSubmission();
    render(<PhotoUploadScreen submit={submission.submit} />);

    choose(aJpeg());
    fireEvent.click(sendButton());

    expect(screen.getByRole('status').textContent).toBe(
      'Analyse de la photo en cours, cela peut prendre une trentaine de secondes…',
    );

    await act(async () => {
      submission.settle({
        status: 'success',
        books: [{ author: 'Albert Camus', title: 'La Peste', confidence: 0.9 }],
      });
    });

    expect(screen.getByRole('listitem').textContent).toBe('La Peste — Albert Camus');
    expect(submission.submitted).toHaveLength(1);
  });

  it('cannot send before a photo is chosen', () => {
    render(<PhotoUploadScreen submit={aPendingSubmission().submit} />);

    expect(sendButton()).toHaveProperty('disabled', true);
  });
});

// FR-007: one submission at a time.
describe('PhotoUploadScreen, while a photo is being analysed', () => {
  it('disables both the picker and the send button', () => {
    render(<PhotoUploadScreen submit={aPendingSubmission().submit} />);

    choose(aJpeg());
    fireEvent.click(sendButton());

    expect(sendButton()).toHaveProperty('disabled', true);
    expect(screen.getByLabelText('Photo de l’étagère')).toHaveProperty('disabled', true);
  });

  it('never sends a second request', () => {
    const submission = aPendingSubmission();
    render(<PhotoUploadScreen submit={submission.submit} />);

    choose(aJpeg());
    fireEvent.click(sendButton());
    fireEvent.click(sendButton());

    expect(submission.submitted).toHaveLength(1);
  });
});

// US2, FR-003: a file refused before sending never reaches the network.
describe('PhotoUploadScreen, with a file it cannot send', () => {
  it('explains why a non-image is refused, without sending it', () => {
    const submission = aPendingSubmission();
    render(<PhotoUploadScreen submit={submission.submit} />);

    choose(new File(['%PDF'], 'devis.pdf', { type: 'application/pdf' }));

    expect(screen.getByRole('alert').textContent).toContain('JPEG, PNG, WebP ou HEIC');
    expect(sendButton()).toHaveProperty('disabled', true);
    expect(submission.submitted).toHaveLength(0);
  });

  it('explains why an oversized photo is refused, without sending it', () => {
    const submission = aPendingSubmission();
    render(<PhotoUploadScreen submit={submission.submit} />);

    choose(new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' }));

    expect(screen.getByRole('alert').textContent).toContain('20 Mo');
    expect(sendButton()).toHaveProperty('disabled', true);
  });

  it('shows the message of a failed submission', async () => {
    const submission = aPendingSubmission();
    render(<PhotoUploadScreen submit={submission.submit} />);

    choose(aJpeg());
    fireEvent.click(sendButton());
    await act(async () => {
      submission.settle({ status: 'error', message: 'Le service est indisponible.' });
    });

    expect(screen.getByRole('alert').textContent).toBe('Le service est indisponible.');
  });
});

// US4, FR-008: back to the start, without reloading the page.
const startOver = () => screen.getByRole('button', { name: 'Recommencer' });

describe('PhotoUploadScreen, starting over', () => {
  it.each([
    ['a result', { status: 'success', books: [] }],
    ['an error', { status: 'error', message: 'Le service est indisponible.' }],
  ] satisfies [string, UploadState][])(
    'comes back to the start after %s',
    async (_label, outcome) => {
      const submission = aPendingSubmission();
      render(<PhotoUploadScreen submit={submission.submit} />);
      choose(aJpeg());
      fireEvent.click(sendButton());
      await act(async () => {
        submission.settle(outcome);
      });

      fireEvent.click(startOver());

      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByText('Aucun livre détecté sur cette photo.')).toBeNull();
      expect(sendButton()).toHaveProperty('disabled', true);
      expect(screen.getByLabelText<HTMLInputElement>('Photo de l’étagère').value).toBe('');
    },
  );

  it('offers no way back while nothing has happened yet', () => {
    render(<PhotoUploadScreen submit={aPendingSubmission().submit} />);

    expect(screen.queryByRole('button', { name: 'Recommencer' })).toBeNull();
  });
});
