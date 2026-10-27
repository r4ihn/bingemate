import { useState } from 'react';
import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { titlesApi } from '../api/titles.js';
import { ApiError } from '../api/client.js';
import { StateMessage } from '../components/StateMessage.js';
import { TitleOverview } from '../components/TitleOverview.js';
import { ReviewForm } from '../components/review/ReviewForm.js';
import { ReviewList } from '../components/review/ReviewList.js';
import { useAsync } from '../hooks/useAsync.js';
import { MEDIA_SECTION } from '../labels.js';
import { NotFound } from './NotFound.js';

// The layout lets this page run full-bleed, so non-hero states need their own padding
function Shell({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-[1100px] px-8 pt-32 pb-16">{children}</div>;
}

export function TitleDetail() {
  const { id = '' } = useParams();
  const { state, reload } = useAsync(() => titlesApi.get(id), [id]);
  // Bumping this remounts ReviewList so a new review shows up (and the list returns to page 1)
  const [reviewsVersion, setReviewsVersion] = useState(0);
  // Bumped on every post or delete; tells the review form to check again whether the user has reviewed
  const [changes, setChanges] = useState(0);
  const reviewsChanged = () => {
    setChanges((v) => v + 1);
    reload(); // the average and review count in the overview
  };

  if (state.status === 'loading') {
    return (
      <Shell>
        <StateMessage kind="loading" />
      </Shell>
    );
  }
  if (state.status === 'error') {
    return (
      <Shell>
        {state.error instanceof ApiError && state.error.status === 404 ? (
          <NotFound />
        ) : (
          <StateMessage kind="error" detail="This title could not be loaded." onRetry={reload} />
        )}
      </Shell>
    );
  }

  const title = state.data;
  return (
    <>
      <TitleOverview
        title={title}
        breadcrumb={['Main', MEDIA_SECTION[title.mediaType], title.name]}
      />
      <section
        id="reviews"
        className="mx-auto max-w-[1100px] border-t border-line px-6 py-12 sm:px-8"
      >
        <h2 className="mb-6 text-2xl font-semibold tracking-tight">Reviews</h2>
        <div className="mb-8">
          <ReviewForm
            title={title}
            version={changes}
            onSubmitted={() => {
              setReviewsVersion((v) => v + 1);
              reviewsChanged();
            }}
          />
        </div>
        <ReviewList
          key={reviewsVersion}
          titleId={title.id}
          titleOwnerId={title.createdById ?? null}
          onDeleted={reviewsChanged}
        />
      </section>
    </>
  );
}
