/** PostgREST when a table/view is absent or not yet in the schema cache. */
export function isPostgrestMissingRelation(err: {
  code?: string;
  message?: string;
}): boolean {
  const msg = err.message ?? "";
  const m = msg.toLowerCase();
  return (
    err.code === "PGRST205" ||
    (m.includes("could not find") && m.includes("schema cache")) ||
    /relation\s+[\w".]+\s+does not exist/i.test(msg)
  );
}
