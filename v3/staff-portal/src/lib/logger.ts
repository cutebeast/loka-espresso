if (process.env.NODE_ENV === "production") {
  const noop = () => {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (console as any).error = noop;
}
export const logError = (msg: string, err?: unknown) => {
  if (process.env.NODE_ENV !== "production") console.error(msg, err);
};
