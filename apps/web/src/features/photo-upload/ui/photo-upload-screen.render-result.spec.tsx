import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { UploadState } from '../model/upload-state';
import { PhotoUploadScreen, type PhotoUploadScreenProps } from './photo-upload-screen';

const aJpeg = () =>
  new File([new Uint8Array([0xff, 0xd8, 0xff])], 'IMG_0001.jpg', { type: 'image/jpeg' });

const books = [{ author: 'Albert Camus', title: 'La Peste', confidence: 0.9 }];

/** Sends the photo with a submission that answers `state` at once. */
async function sendWith(state: UploadState, renderResult?: PhotoUploadScreenProps['renderResult']) {
  const submission = { submit: async () => state };
  render(<PhotoUploadScreen submit={submission.submit} renderResult={renderResult} />);
  fireEvent.change(screen.getByLabelText('Photo de l’étagère'), { target: { files: [aJpeg()] } });
  fireEvent.click(screen.getByRole('button', { name: 'Analyser la photo' }));
  await screen.findByRole('button', { name: 'Recommencer' });
}

const reconciledList = () => <p>reconciled list</p>;

// The shell fills the result with the reconciled list (specs/003, research §11): the slice only
// hands over the id of the analysis and its books.
describe('PhotoUploadScreen, rendering the result', () => {
  it('hands the id of the analysis and its books to the renderer, in place of the list', async () => {
    const renderResult = vi.fn<NonNullable<PhotoUploadScreenProps['renderResult']>>(reconciledList);

    await sendWith({ status: 'success', scanId: 'an-id', books }, renderResult);

    expect(renderResult).toHaveBeenCalledWith({ scanId: 'an-id', books });
    expect(screen.queryByText('reconciled list')).not.toBeNull();
    expect(screen.queryByRole('listitem')).toBeNull();
  });

  it('shows the plain list of books when nothing renders the result', async () => {
    await sendWith({ status: 'success', scanId: 'an-id', books });

    expect(screen.getByRole('listitem').textContent).toBe('La Peste — Albert Camus');
  });

  // Spec 001, US1 scenario 3: a shelf with no book keeps its own message.
  it('does not call the renderer for an analysis without any book', async () => {
    const renderResult = vi.fn<NonNullable<PhotoUploadScreenProps['renderResult']>>(reconciledList);

    await sendWith({ status: 'success', scanId: 'an-id', books: [] }, renderResult);

    expect(renderResult).not.toHaveBeenCalled();
    expect(screen.queryByText('Aucun livre détecté sur cette photo.')).not.toBeNull();
  });

  it('does not call the renderer for a failure', async () => {
    const renderResult = vi.fn<NonNullable<PhotoUploadScreenProps['renderResult']>>(reconciledList);

    await sendWith({ status: 'error', failure: 'offline' }, renderResult);

    expect(renderResult).not.toHaveBeenCalled();
  });
});
