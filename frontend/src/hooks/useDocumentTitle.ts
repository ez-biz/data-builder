import { useEffect } from "react";

export function useDocumentTitle(title: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = title ? `${title} — Data Builder` : "Data Builder";
    return () => {
      document.title = prev;
    };
  }, [title]);
}
