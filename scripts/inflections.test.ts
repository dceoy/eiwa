import { describe, expect, it } from "vitest";
import { englishForms, japaneseForms } from "./inflections";

describe("build-time morphology", () => {
  it("generates English regular and irregular word/phrase forms with POS gates", () => {
    expect(englishForms("take", ["verb"])).toContain("took");
    expect(englishForms("take off", ["verb"])).toContain("took off");
    expect(englishForms("go", ["verb"])).toContain("went");
    expect(englishForms("good", ["adjective"])).toContain("better");
    expect(englishForms("child", ["noun"])).toContain("children");
    expect(englishForms("study", ["verb"])).toEqual(["studies", "studied", "studying"]);
    expect(englishForms("walk", ["verb"])).toContain("walked");
    expect(englishForms("stop", ["verb"])).toContain("stopped");
    expect(englishForms("name", ["proper name"])).toEqual([]);
  });
  it("keeps invariant fish plurals without suppressing regular verb forms", () => {
    expect(englishForms("fish", ["noun"])).toEqual(["fish"]);
    expect(englishForms("fish", ["verb"])).toEqual(["fishes", "fished", "fishing"]);
    expect(englishForms("fish", ["noun", "verb"])).toEqual(["fish", "fishes", "fished", "fishing"]);
  });
  it("selects fly irregulars only for verbs, retaining regular noun plurals", () => {
    expect(englishForms("fly", ["noun"])).toEqual(["flies"]);
    expect(englishForms("fly", ["verb"])).toEqual(["flies", "flew", "flown", "flying"]);
    expect(englishForms("fly", ["noun", "verb"])).toEqual(["flies", "flew", "flown", "flying"]);
  });
  it("scopes child, good and run exceptions to their grammatical category", () => {
    expect(englishForms("child", ["noun"])).toEqual(["children"]);
    expect(englishForms("good", ["adjective"])).toEqual(["better", "best"]);
    expect(englishForms("good", ["noun"])).toEqual(["goods"]);
    expect(englishForms("run", ["noun"])).toEqual(["runs"]);
    expect(englishForms("run", ["verb"])).toEqual(["runs", "ran", "running"]);
    expect(englishForms("run off", ["verb"])).toEqual(["runs off", "ran off", "running off"]);
  });
  it("uses JMdict conjugation classes, not guesses from endings", () => {
    expect(japaneseForms("食べる", ["Ichidan verb"])).toContain("食べた");
    expect(japaneseForms("走る", ["Godan verb with 'ru' ending"])).toContain("走った");
    expect(japaneseForms("行く", ["Godan verb - Iku/Yuku special class"])).toContain("行った");
    expect(japaneseForms("書く", ["Godan verb with 'ku' ending"])).toContain("書いて");
    expect(japaneseForms("飲む", ["Godan verb with 'mu' ending"])).toContain("飲んでいる");
    expect(japaneseForms("高い", ["adjective (keiyoushi)"])).toContain("高かった");
    expect(japaneseForms("静か", ["adjectival nouns or quasi-adjectives (keiyodoshi)"])).toContain(
      "静かだった",
    );
    expect(japaneseForms("光る", ["noun"])).toEqual([]);
  });
});
