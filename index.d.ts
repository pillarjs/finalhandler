/// <reference types="node" />

import { IncomingMessage, ServerResponse } from "node:http";

declare function finalhandler(
  req: IncomingMessage,
  res: ServerResponse,
  options?: finalhandler.Options
): (err?: any) => void;

declare namespace finalhandler {
  interface Options {
    env?: string | undefined;
    onerror?:
      | ((err: any, req: IncomingMessage, res: ServerResponse) => void)
      | undefined;
  }
}

export = finalhandler;
