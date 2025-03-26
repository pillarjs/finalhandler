import { IncomingMessage, ServerResponse, createServer } from "node:http";
import { expectTypeOf } from "expect-type";
import finalhandler, { Options } from "..";

const req = {} as IncomingMessage;
const res = {} as ServerResponse;

const options: Options = {
  env: "anEnv",
  onerror: (err, req, res) => {
    expectTypeOf(err).toBeAny();
    expectTypeOf(req).toEqualTypeOf<IncomingMessage>();
    expectTypeOf(res).toEqualTypeOf<ServerResponse>();
  },
};

expectTypeOf(options.env).toEqualTypeOf<string | undefined>();

// finalhandler without options
{
  const result = finalhandler(req, res);
  expectTypeOf(result).toBeFunction();
  expectTypeOf(result).parameters.toEqualTypeOf<[any?]>();
  expectTypeOf(result).returns.toBeVoid();
  expectTypeOf(result).toBeCallableWith(new Error());
}

// finalhandler with options
{
  const result = finalhandler(req, res, options);
  expectTypeOf(result).toBeFunction();
  expectTypeOf(result).parameters.toEqualTypeOf<[any?]>();
  expectTypeOf(result).returns.toBeVoid();
  expectTypeOf(result).toBeCallableWith(new Error());
}

// serve-static-like request handler
declare function requestHandler(
  request: IncomingMessage,
  response: ServerResponse,
  next: (err?: any) => void
): any;

createServer((req, res) => {
  requestHandler(req, res, finalhandler(req, res));
});
