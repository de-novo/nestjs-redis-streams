export class RequestsMap<T extends string | number | symbol, S> {
  private map: Record<T, S>;

  constructor() {
    this.map = {} as Record<T, S>;
  }

  public addEntry(requestId: T, handler: S): boolean {
    this.map[requestId] = handler;
    return true;
  }

  public getEntry(requestId: T): S | undefined {
    return this.map[requestId];
  }

  public removeEntry(requestId: T): boolean {
    delete this.map[requestId];
    return true;
  }

  public getMap(): Record<T, S> {
    return this.map;
  }
}
