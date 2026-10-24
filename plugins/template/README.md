# Bridge connector template
1. Edit `manifest.json` (see `packages/plugin-sdk/src/manifest.ts` for the schema).
2. Implement `server.mjs` (or any language) speaking the JSON protocol in `packages/plugin-sdk/src/protocol.ts`.
3. Put sample responses in `fixtures/*.json` and run `npm test` to validate manifest + records with the SDK runner.
4. Register: open a PR adding your manifest to `plugins/registry.json` (community plugins are reviewed before listing) or insert it into `public.plugins` on your own Bridge deployment.
Rules the host enforces: HTTPS only (except localhost dev), timeouts, byte and record limits, schema validation, no private-network hosts, followers/following are never upgraded to personal relationships, suggested tags are never confirmed automatically.
