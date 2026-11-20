# Feed validation benchmark

Times what the node does in `validate_state` for a feed: parse it and re-verify every signature, with the contract
built as it ships (wasm32, `opt-level = "z"`). freenet-core gives each contract call 5 s, so this sets the record caps
(`tasks/010-contract-v2-migration.md`).

```bash
cargo build --release --target wasm32-unknown-unknown
node run.mjs target/wasm32-unknown-unknown/release/feedbench.wasm
```

Runs in V8, not in the node's wasmtime with fuel metering, so the node is slower: keep a margin.
