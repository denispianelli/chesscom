import { describe, expect, it } from "vitest";
import puzzle from "../../../test/fixtures/puzzle.json";
import { puzzleSchema } from "./puzzle.js";

describe("puzzleSchema", () => {
  it("accepts the real daily puzzle", () => {
    const parsed = puzzleSchema.parse(puzzle);
    expect(parsed.fen).toBeTypeOf("string");
    expect(parsed.pgn).toContain("[");
  });

  it("rejects a puzzle missing its fen", () => {
    const { fen, ...rest } = puzzle;
    void fen;
    expect(puzzleSchema.safeParse(rest).success).toBe(false);
  });
});
