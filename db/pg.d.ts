declare module 'pg' {
  export interface QueryResult<R = Record<string, unknown>> {
    rows: R[];
    rowCount: number | null;
  }
  export interface ClientConfig {
    connectionString?: string;
    connectionTimeoutMillis?: number;
  }
  export interface Queryable {
    query<R = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<QueryResult<R>>;
  }
  export class Client implements Queryable {
    constructor(config?: ClientConfig);
    connect(): Promise<void>;
    query<R = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<QueryResult<R>>;
    end(): Promise<void>;
  }
  export interface PoolClient extends Queryable {
    release(): void;
  }
  export class Pool implements Queryable {
    constructor(config?: ClientConfig);
    connect(): Promise<PoolClient>;
    query<R = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<QueryResult<R>>;
    end(): Promise<void>;
  }
  const pg: { Client: typeof Client; Pool: typeof Pool };
  export default pg;
}
