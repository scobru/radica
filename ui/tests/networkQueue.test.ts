import test from "node:test";
import assert from "node:assert/strict";
import { isInteractiveContract } from "../src/refresh.ts";

test("network: chat reads go in the foreground queue, social logs and feeds in the background", () => {
  for (const id of ["log:inbox/ab", "log:dm/ab:cd", "log:dm/secret_ab_cd", "log:devices/ab", "log:room/privroom_1", "media:00"])
    assert.equal(isInteractiveContract(id), true, id);
  for (const id of ["log:directory", "log:supporters", "log:handles", "log:wallets/ab", "feed:ab"]) assert.equal(isInteractiveContract(id), false, id);
});
