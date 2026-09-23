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

    expect(screen.getByRole('status').textContent).toBe('Analyse de la photo en cours…');

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
