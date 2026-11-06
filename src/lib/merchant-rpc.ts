// Turns an API call into one SQL function call. Names can't carry parameters, so they are
// checked here; what a role may call is decided by the grants and RLS on merchant_app.

const FUNCTION_NAME = /^[a-z][a-z0-9_]*$/;
const ARGUMENT_NAME = /^p_[a-z0-9_]+$/;

export class BadRpcCall extends Error {}

/** Lists of plain values are Postgres arrays (uuid[]); everything else structured is jsonb. */
function toParam(value: unknown): unknown {
  if (Array.isArray(value) && value.length && value.every((v) => typeof v !== "object")) return value;
  return value !== null && typeof value === "object" ? JSON.stringify(value) : value;
}

export function buildRpcCall(name: string, args: Record<string, unknown>) {
  if (!FUNCTION_NAME.test(name)) throw new BadRpcCall("Unknown function");
  const keys = Object.keys(args);
  if (!keys.every((k) => ARGUMENT_NAME.test(k))) throw new BadRpcCall("Bad argument name");
  const list = keys.map((k, i) => `${k} => $${i + 1}`).join(", ");
  return { text: `select * from merchant.${name}(${list})`, params: keys.map((k) => toParam(args[k])) };
}

/** Message and status for a failed call. Only messages our SQL raises on purpose reach the user. */
export function rpcError(e: unknown): { status: number; error: string } {
  if (e instanceof BadRpcCall) return { status: 400, error: e.message };
  const { code, message } = e as { code?: string; message?: string };
  if (code === "42883") return { status: 404, error: "Unknown function" };
  if (code === "42501") return { status: 403, error: message?.startsWith("Not allowed") ? message : "Not allowed" };
  if (code === "P0001") return { status: 400, error: message ?? "Rejected" };
  console.error("merchant rpc failed", e);
  return { status: 500, error: "Something went wrong" };
}
