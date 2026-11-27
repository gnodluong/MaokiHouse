/** Environment variables as the handlers see them (process.env in Node, Deno.env in the Edge Function). */
export type Env = Record<string, string | undefined>;
