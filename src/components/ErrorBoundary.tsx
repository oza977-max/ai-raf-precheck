import { Component, type ErrorInfo, type ReactNode } from 'react';
import { clearDraft, clearFormDraft } from './intake-draft';

// CR6-04 (Critical, BC-002). No error boundary existed around the intake
// flow — a render-time crash (an incompatible draft shape reaching a
// component that indexes into it, or any other defect) blanked the whole
// screen with no way back except a manual reload, which would just
// restore the identical bad draft and crash again.
//
// Rule 4 (cross-cutting.md §7): presentation-only, and deliberately says as
// little as it can get away with. An error boundary genuinely cannot know
// WHAT went wrong — NF-2/honesty bars it from guessing a cause it has no
// way to verify, the same discipline CONFIRMATION_REFUSAL_MESSAGE's
// 'already-decided' wording follows (IntakeFlow.tsx, CR6-15). Its one
// recovery action is unconditional: clear the saved draft and let React
// remount whatever was below it fresh.
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Kept for whoever diagnoses a real crash; the person sees the plain
    // message below instead — same posture as runConfirmAndEvaluate's own
    // console.error (IntakeFlow.tsx).
    console.error('Counterpoise: the intake flow crashed:', error, info.componentStack);
  }

  private handleStartFresh = (): void => {
    clearDraft();
    // Same pair handleStartOver clears (IntakeFlow.tsx): the guided form keeps
    // its answers under a second key.
    clearFormDraft();
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="intake-flow__crash" role="alert">
          <p>Something went wrong and this check could not continue.</p>
          <p className="field-help">
            Something went wrong and this screen could not be shown. Anything already saved is on
            the register. Starting a fresh check clears this unfinished one.
          </p>
          <button type="button" onClick={this.handleStartFresh}>
            Start a fresh check
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
