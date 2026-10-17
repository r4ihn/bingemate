import { Link } from 'react-router-dom';
import { creatorApi } from '../../api/creator.js';
import { StateMessage } from '../../components/StateMessage.js';
import { Table, Td } from '../../components/ui/Table.js';
import { useAsync } from '../../hooks/useAsync.js';

export function CreatorStats() {
  const { state, reload } = useAsync(() => creatorApi.stats(), []);

  return (
    <section>
      <h1 className="text-4xl font-semibold tracking-tight">Stats</h1>
      <p className="mt-2 text-muted">
        How your approved titles are doing.{' '}
        <Link to="/creator" className="underline">
          Back to submissions
        </Link>
      </p>
      <div className="mt-8">
        {state.status === 'loading' && <StateMessage kind="loading" />}
        {state.status === 'error' && (
          <StateMessage kind="error" detail="Stats could not be loaded." onRetry={reload} />
        )}
        {state.status === 'ready' &&
          (state.data.length === 0 ? (
            <StateMessage
              kind="empty"
              title="No stats yet"
              detail="Stats appear once one of your titles is approved."
            />
          ) : (
            <Table
              caption="Stats per title"
              columns={['Title', 'Avg rating', 'Reviews', 'List adds']}
            >
              {state.data.map((s) => (
                <tr key={s.titleId}>
                  <Td>{s.name}</Td>
                  <Td>{s.avgRating.toFixed(1)}</Td>
                  <Td>{s.reviewCount}</Td>
                  <Td>{s.listAdds}</Td>
                </tr>
              ))}
            </Table>
          ))}
      </div>
    </section>
  );
}
