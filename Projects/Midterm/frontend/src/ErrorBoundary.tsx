import { Component, type ReactNode } from "react";
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="auth-card">
        <h1>The arena hit a snag.</h1>
        <p>Your saved results are safe on the server.</p>
        <button onClick={() => location.reload()}>Reload arena</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
