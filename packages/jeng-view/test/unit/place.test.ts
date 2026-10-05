import { describe, expect, test } from "bun:test";
import { place } from "../../src/place";

describe("a path", () => {
    test("is said relative to the directory it sits in", () => {
        expect(place("/work/jeng/.jeng", "/work/jeng")).toBe(".jeng");
    });

    test("is said in full when it is somewhere else", () => {
        expect(place("/home/jeng", "/work/jeng")).toBe("/home/jeng");
    });

    test("is a dot when it is the cwd itself", () => {
        expect(place("/work/jeng", "/work/jeng")).toBe(".");
    });

    test("is not shortened by a folder whose name merely begins the same", () => {
        expect(place("/workspace", "/work")).toBe("/workspace");
    });

    test("reads a windows path the same as any other", () => {
        expect(place("C:\\work\\jeng\\.jeng", "C:\\work\\jeng")).toBe(".jeng");
    });

    test("does not mind a cwd written with a separator on the end", () => {
        expect(place("/work/jeng", "/work/")).toBe("jeng");
    });
});
