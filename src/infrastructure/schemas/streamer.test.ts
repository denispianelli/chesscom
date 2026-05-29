import { describe, expect, it } from "vitest";
import streamers from "../../../test/fixtures/streamers.json";
import { streamersSchema } from "./streamer.js";

describe("streamersSchema", () => {
  it("accepts the real streamers list", () => {
    const { streamers: list } = streamersSchema.parse(streamers);
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]?.username).toBeTypeOf("string");
  });

  it("rejects a streamer missing its username", () => {
    expect(
      streamersSchema.safeParse({ streamers: [{ url: "x" }] }).success,
    ).toBe(false);
  });
});
