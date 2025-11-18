declare module 'react-dom/client' {
  import type { ReactElement } from 'react';

  interface Root {
    render(children: ReactElement | null): void;
  }

  export function createRoot(container: Element | DocumentFragment): Root;
}
