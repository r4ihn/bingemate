import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
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
import { MEDIA_LABEL } from '../../labels.js';
import type { SubmissionInput } from '../../types/creator.js';

function Form({
  initial,
  editingApproved,
  submitLabel,
  onSave,
}: {
  initial: SubmissionInput;
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
  const inFlight = useRef(false);

  async function save() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setSaveError(null);
    try {
      await onSave({ name: name.trim(), mediaType, synopsis: synopsis.trim() });
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
        <p className="mb-4 rounded-xl border border-warn p-3 text-[0.85rem] text-warn">
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
        {saveError && (
          <p role="alert" className="text-[0.8rem] text-danger">
            {saveError}
          </p>
        )}
        <div className="flex items-center gap-4">
          <Button type="submit" loading={pending}>
            {submitLabel}
          </Button>
          <Link to="/creator" className="text-[0.85rem] text-muted underline">
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
