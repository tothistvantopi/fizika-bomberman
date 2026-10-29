/** Stand-in for the `ws` package in the browser-only demo build (rooms.ts only needs the OPEN constant). */
export class WebSocket {
  static readonly OPEN = 1;
}
