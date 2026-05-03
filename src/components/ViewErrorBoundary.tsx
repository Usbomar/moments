"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Etiqueta per al missatge d’error (p. ex. nom de la vista). */
  label: string;
};

type State = { hasError: boolean; message: string };

export class ViewErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || "Error desconegut" };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (process.env.NODE_ENV !== "production") {
      console.error(`[ViewErrorBoundary:${this.props.label}]`, error, info.componentStack);
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="view-error-fallback" role="alert">
          <p style={{ fontWeight: 600, marginBottom: 8 }}>No s’ha pogut carregar: {this.props.label}</p>
          <p className="modal-muted" style={{ marginBottom: 12 }}>
            {this.state.message}
          </p>
          <button type="button" className="primary" onClick={() => this.setState({ hasError: false, message: "" })}>
            Tornar a intentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
