/** The filter's wasm is 44 MiB, over the 32 MiB a Freenet node allows for one file, so it is published gzipped
 *  (moderation/filter/ModeratorWeb.gz.bin) and unpacked here, as the Response the moderator package would have fetched.
 *  A server that already decoded it (Content-Encoding) hands over the wasm itself: told apart by the first bytes. */
export async function filterWasmResponse(url: string, fetchFn: typeof fetch = fetch): Promise<Response> {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`filter wasm: HTTP ${res.status}`);
  let bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
  }
  // a node that cannot open the container answers with text ("failed unpacking contract"): report that, not a CompileError
  if (!(bytes[0] === 0 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6d)) {
    throw new Error(`filter wasm: not a wasm file (${new TextDecoder().decode(bytes.slice(0, 60))})`);
  }
  return new Response(bytes, { headers: { "Content-Type": "application/wasm" } });
}
