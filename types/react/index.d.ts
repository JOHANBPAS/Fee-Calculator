// Minimal React type stubs to satisfy the compiler in environments without @types/react

declare namespace React {
  type Key = string | number;
  type ReactText = string | number;
  type ReactChild = ReactElement | ReactText;
  type ReactNode = ReactChild | ReactChild[] | boolean | null | undefined;

  interface Attributes {
    key?: Key;
  }

  interface DOMAttributes<T> {
    children?: ReactNode;
    onClick?: (event: any) => void;
    onChange?: (event: any) => void;
    onSubmit?: (event: any) => void;
  }

  interface HTMLAttributes<T> extends DOMAttributes<T> {
    className?: string;
  }

  interface DetailedHTMLProps<E extends HTMLAttributes<T>, T> extends E {}

  interface FunctionComponent<P = {}> {
    (props: P & { children?: ReactNode }): ReactElement<any, any> | null;
  }
  type FC<P = {}> = FunctionComponent<P>;

  interface ReactElement<P = any, T extends string | JSXElementConstructor<any> = any> {
    type: T;
    props: P;
    key: Key | null;
  }

  interface JSXElementConstructor<P> {
    (props: P): ReactElement<any, any> | null;
  }

  type FormEvent = any;

  function createElement<P>(
    type: string | JSXElementConstructor<P>,
    props?: any,
    ...children: ReactNode[]
  ): ReactElement<P>;

  function useState<S>(initialState: S | (() => S)): [S, (value: S | ((prev: S) => S)) => void];
  function useEffect(effect: () => void | (() => void), deps?: any[]): void;
  function useMemo<T>(factory: () => T, deps?: any[]): T;
  function useContext<T>(ctx: Context<T>): T;
  function createContext<T>(defaultValue: T): Context<T>;
  function useRef<T>(initial: T | null): { current: T | null };

  interface Context<T> {
    Provider: FC<{ value: T }>;
    Consumer: FC<{ children: (value: T) => ReactNode }>;
  }

  const Fragment: unique symbol;
  const StrictMode: FC<{ children?: ReactNode }>;
}

declare module 'react' {
  export = React;
}

declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}
