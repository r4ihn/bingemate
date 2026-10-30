import { useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MediaType, TitleStatus } from '@bingemate/shared';
import { ApiError } from '../../api/client.js';
import { creatorApi } from '../../api/creator.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.js';
import { StateMessage } from '../../components/StateMessage.js';
import { Button } from '../../components/ui/Button.js';
import { Field } from '../../components/ui/Field.js';
import { Panel } from '../../components/ui/Panel.js';
import { inputClass } from '../../components/ui/inputClass.js';
import { useAsync } from '../../hooks/useAsync.js';
import { POSTER_TYPES, checkPosterFile, shrinkPoster } from '../../image.js';
import { MEDIA_LABEL } from '../../labels.js';
import type { SubmissionInput } from '../../types/creator.js';

/** An image the creator picked, shrunk and ready to upload, with a local address for the preview. */
interface ChosenPoster {
  blob: Blob;
  previewUrl: string;
}

function Form({
  initial,
  initialPosterUrl = null,
  editingApproved,
  submitLabel,
  onSave,
}: {
  initial: SubmissionInput;
  /** The image the title has now (edit only). */
  initialPosterUrl?: string | null;
  editingApproved: boolean;
  submitLabel: string;
  onSave: (input: SubmissionInput) => Promise<void>;
}) {
  const [name, setName] = useState(initial.name);
  const [mediaType, setMediaType] = useState<MediaType>(initial.mediaType);
  const [synopsis, setSynopsis] = useState(initial.synopsis);
  const [nameError, setNameError] = useState<string>();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [poster, setPoster] = useState<ChosenPoster | null>(null);
  const [removeCurrent, setRemoveCurrent] = useState(false);
  const [posterError, setPosterError] = useState<string>();
  const [preparing, setPreparing] = useState(false);
  const inFlight = useRef(false);
  // Counts picks and removals. An image still being prepared when a newer one is picked, or when
  // the creator removes it, belongs to an older number and its result is dropped.
  const latestPick = useRef(0);
  const helpId = useId();
  // Release the preview's local address when it is replaced and when the form closes. Closing also
  // counts as a newer pick, so an image still being prepared is dropped instead of kept in memory.
  const previewUrl = useRef<string | null>(null);
  useEffect(
    () => () => {
      latestPick.current++;
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [],
  );

  async function onPickPoster(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets the same file be chosen again after it was removed
    if (!file) return;
    const pick = ++latestPick.current;
    const problem = checkPosterFile(file);
    if (problem) {
      setPosterError(problem);
      setPreparing(false); // an older pick, if any, is now stale
      return;
    }
    setPosterError(undefined);
    setPreparing(true);
    try {
      const blob = await shrinkPoster(file);
      if (pick !== latestPick.current) return;
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = URL.createObjectURL(blob);
      setPoster({ blob, previewUrl: previewUrl.current });
      setRemoveCurrent(false);
    } catch (err) {
      if (pick === latestPick.current) {
        setPosterError(err instanceof Error ? err.message : 'That image could not be used');
      }
    } finally {
      if (pick === latestPick.current) setPreparing(false);
    }
  }

  /** Throws away a chosen replacement first; only a second press removes the title's current image. */
  function onRemovePoster() {
    latestPick.current++;
    setPosterError(undefined);
    if (poster || preparing) {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = null;
      setPoster(null);
      setPreparing(false);
      return;
    }
    if (initialPosterUrl) setRemoveCurrent(true);
  }

  const shownPoster = poster
    ? { src: poster.previewUrl, alt: 'Preview of the chosen poster' }
    : initialPosterUrl && !removeCurrent
      ? { src: initialPosterUrl, alt: 'Current poster' }
      : null;

  async function save() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setSaveError(null);
    try {
      await onSave({
        name: name.trim(),
        mediaType,
        synopsis: synopsis.trim(),
        ...(poster ? { poster: poster.blob } : {}),
        ...(removeCurrent && !poster ? { removePoster: true } : {}),
      });
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Could not save. Try again.');
    } finally {
      inFlight.current = false;
      setPending(false);
      setConfirmOpen(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (preparing) return; // the image is still being shrunk
    if (!name.trim()) {
      setNameError('Enter a title');
      return;
    }
    setNameError(undefined);
    // Editing an approved title sends it back to PENDING, so confirm first (TASKS.md section 0)
    if (editingApproved) setConfirmOpen(true);
    else void save();
  }

  return (
    <Panel className="mx-auto max-w-xl">
      {editingApproved && (
        <p className="mb-4 rounded-xl border border-warn p-3 text-sm text-warn">
          This title is approved. Editing it means it is sent back for approval and hidden from
          browse until an admin approves it again.
        </p>
      )}
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        <Field label="Title" error={nameError}>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Type">
          <select
            value={mediaType}
            onChange={(e) => setMediaType(e.target.value as MediaType)}
            className={inputClass}
          >
            {Object.values(MediaType).map((m) => (
              <option key={m} value={m}>
                {MEDIA_LABEL[m]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Synopsis">
          <textarea
            rows={4}
            value={synopsis}
            onChange={(e) => setSynopsis(e.target.value)}
            className={inputClass}
          />
        </Field>
        <div className="grid gap-3">
          <Field label="Poster image (optional)" error={posterError}>
            <input
              type="file"
              accept={POSTER_TYPES.join(',')}
              onChange={(e) => void onPickPoster(e)}
              aria-describedby={helpId}
              className="block w-full cursor-pointer text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white"
            />
          </Field>
          <p id={helpId} className="text-xs text-muted">
            JPEG, PNG or WebP. It is shrunk to fit before it is uploaded.
          </p>
          {preparing && (
            <p role="status" className="text-sm text-muted">
              Preparing the image…
            </p>
          )}
          {shownPoster && (
            <div className="flex items-end gap-4">
              <img
                src={shownPoster.src}
                alt={shownPoster.alt}
                className="h-36 w-24 rounded-lg border border-line object-cover"
              />
              <Button type="button" variant="secondary" onClick={onRemovePoster}>
                Remove image
              </Button>
            </div>
          )}
        </div>
        {saveError && (
          <p role="alert" className="text-sm text-danger">
            {saveError}
          </p>
        )}
        <div className="flex items-center gap-4">
          <Button type="submit" loading={pending || preparing}>
            {submitLabel}
          </Button>
          <Link to="/creator" className="text-sm text-muted underline">
            Cancel
          </Link>
        </div>
      </form>
      <ConfirmDialog
        open={confirmOpen}
        title="Re-submit for approval?"
        body="This title is approved. Saving changes will send it back to PENDING and hide it from browse until an admin approves it again."
        confirmLabel="Save and re-submit"
        onConfirm={save}
        onCancel={() => setConfirmOpen(false)}
      />
    </Panel>
  );
}

function EditForm({ id }: { id: string }) {
  const navigate = useNavigate();
  const { state, reload } = useAsync(() => creatorApi.submissions(), []);

  if (state.status === 'loading') return <StateMessage kind="loading" />;
  if (state.status === 'error') {
    return (
      <StateMessage kind="error" detail="This submission could not be loaded." onRetry={reload} />
    );
  }
  const found = state.data.find((s) => s.title.id === id);
  if (!found) {
    return (
      <StateMessage
        kind="empty"
        title="Submission not found"
        detail="It may belong to another creator."
      />
    );
  }
  const { title } = found;
  return (
    <Form
      initial={{ name: title.name, mediaType: title.mediaType, synopsis: title.synopsis }}
      initialPosterUrl={title.posterUrl ?? null}
      editingApproved={title.status === TitleStatus.APPROVED}
      submitLabel="Save changes"
      onSave={async (input) => {
        await creatorApi.update(id, input);
        navigate('/creator');
      }}
    />
  );
}

export function SubmissionForm() {
  const { id } = useParams();
  const navigate = useNavigate();

  return (
    <section>
      <h1 className="mb-6 text-4xl font-semibold tracking-tight">
        {id ? 'Edit submission' : 'New submission'}
      </h1>
      {id ? (
        <EditForm id={id} />
      ) : (
        <Form
          initial={{ name: '', mediaType: MediaType.MOVIE, synopsis: '' }}
          editingApproved={false}
          submitLabel="Submit for approval"
          onSave={async (input) => {
            await creatorApi.submit(input);
            navigate('/creator');
          }}
        />
      )}
    </section>
  );
}
