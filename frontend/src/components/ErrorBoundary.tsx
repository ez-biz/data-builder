import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 p-8">
          <div className="flex items-center gap-3 text-destructive">
            <AlertTriangle className="h-8 w-8" />
            <h1 className="text-xl font-semibold">Something went wrong</h1>
          </div>
          <p className="max-w-md text-center text-sm text-muted-foreground">
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <Button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.href = "/";
            }}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Return to Dashboard
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
