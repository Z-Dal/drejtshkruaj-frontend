export default function debug(...args: any[]) {
  if (process.env.NODE_ENV !== "production") {
    console.debug("QuillDrejtshkruaj", ...args);
  }
}
