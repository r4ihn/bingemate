import { Component } from 'react';
import type { ReactNode } from 'react';
import { StateMessage } from './StateMessage.js';

/** Catches render errors so one bad response cannot blank the whole app. Resets when `resetKey` changes. */
export class ErrorBoundary extends Component<
  { children: ReactNode; resetKey?: string },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey)
      this.setState({ failed: false });
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="mx-auto max-w-[1100px] px-8 pt-32">
        <StateMessage
          kind="error"
          detail="This page hit an unexpected problem."
          onRetry={() => this.setState({ failed: false })}
        />
      </div>
    );
  }
}
