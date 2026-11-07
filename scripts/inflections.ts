import type { DictionaryEntry } from "../src/dict-types";

// Deliberately bounded morphology, not a general-purpose analyzer. POS gates
// avoid treating arbitrary glosses/names as verbs. Phrase verbs inflect the
// first word only. Irregulars suppress the corresponding regular forms.
const irregularVerbs: Record<string, string[]> = {
  be: ["am", "is", "are", "was", "were", "been", "being"],
  have: ["has", "had", "having"],
  do: ["does", "did", "done", "doing"],
  go: ["goes", "went", "gone", "going"],
  take: ["takes", "took", "taken", "taking"],
  run: ["runs", "ran", "running"],
  eat: ["eats", "ate", "eaten", "eating"],
  get: ["gets", "got", "gotten", "getting"],
  make: ["makes", "made", "making"],
  see: ["sees", "saw", "seen", "seeing"],
  give: ["gives", "gave", "given", "giving"],
  come: ["comes", "came", "coming"],
  write: ["writes", "wrote", "written", "writing"],
  say: ["says", "said", "saying"],
  buy: ["buys", "bought", "buying"],
  think: ["thinks", "thought", "thinking"],
  bring: ["brings", "brought", "bringing"],
  speak: ["speaks", "spoke", "spoken", "speaking"],
  find: ["finds", "found", "finding"],
  leave: ["leaves", "left", "leaving"],
  know: ["knows", "knew", "known", "knowing"],
  read: ["reads", "reading"],
  understand: ["understands", "understood", "understanding"],
  sit: ["sits", "sat", "sitting"],
  stand: ["stands", "stood", "standing"],
  sleep: ["sleeps", "slept", "sleeping"],
  feel: ["feels", "felt", "feeling"],
  keep: ["keeps", "kept", "keeping"],
  hold: ["holds", "held", "holding"],
  meet: ["meets", "met", "meeting"],
  pay: ["pays", "paid", "paying"],
  put: ["puts", "putting"],
  cut: ["cuts", "cutting"],
  let: ["lets", "letting"],
  win: ["wins", "won", "winning"],
  lose: ["loses", "lost", "losing"],
  begin: ["begins", "began", "begun", "beginning"],
  break: ["breaks", "broke", "broken", "breaking"],
  choose: ["chooses", "chose", "chosen", "choosing"],
  drive: ["drives", "drove", "driven", "driving"],
  fall: ["falls", "fell", "fallen", "falling"],
  fly: ["flies", "flew", "flown", "flying"],
  forget: ["forgets", "forgot", "forgotten", "forgetting"],
  grow: ["grows", "grew", "grown", "growing"],
  hear: ["hears", "heard", "hearing"],
  lead: ["leads", "led", "leading"],
  sell: ["sells", "sold", "selling"],
  send: ["sends", "sent", "sending"],
  teach: ["teaches", "taught", "teaching"],
  tell: ["tells", "told", "telling"],
  wear: ["wears", "wore", "worn", "wearing"],
  swim: ["swims", "swam", "swum", "swimming"],
  show: ["shows", "showed", "shown", "showing"],
  sing: ["sings", "sang", "sung", "singing"],
};
const irregularNouns: Record<string, string[]> = {
  fish: ["fish"],
  sheep: ["sheep"],
  deer: ["deer"],
  species: ["species"],
  life: ["lives"],
  wife: ["wives"],
  knife: ["knives"],
  leaf: ["leaves"],
  wolf: ["wolves"],
  child: ["children"],
  person: ["people"],
  man: ["men"],
  woman: ["women"],
  mouse: ["mice"],
  foot: ["feet"],
  tooth: ["teeth"],
  goose: ["geese"],
};
const irregularAdjectives: Record<string, string[]> = {
  good: ["better", "best"],
  well: ["better", "best"],
  bad: ["worse", "worst"],
};
function plural(word: string): string {
  return /[^aeiou]y$/.test(word)
    ? `${word.slice(0, -1)}ies`
    : /(?:s|x|z|ch|sh)$/.test(word)
      ? `${word}es`
      : `${word}s`;
}
export function englishForms(word: string, pos: string[]): string[] {
  word = word.toLowerCase();
  const [first = "", ...rest] = word.split(" ");
  const tags = pos.join(" ").toLowerCase();
  const verb = /verb/.test(tags) && !/adverb/.test(tags);
  const noun = /noun/.test(tags);
  const adjective = /adjective|adj-i|adj-na/.test(tags);
  if (!/^[a-z]+$/.test(first) || !(verb || noun || adjective)) return [];
  const forms: string[] = [];
  const exceptions = (table: Record<string, string[]>) =>
    Object.hasOwn(table, first) ? table[first] : undefined;
  if (noun && !rest.length) forms.push(...(exceptions(irregularNouns) ?? [plural(first)]));
  // Double only unambiguous one-syllable CVC stems; do not invent e.g.
  // "visitted". Wider irregular/lexical coverage belongs in sourced data.
  const cvc = /^[^aeiou]+[aeiou][bdgmnprt]$/.test(first);
  const doubled = cvc ? first + first.slice(-1) : first;
  if (verb)
    forms.push(
      ...(exceptions(irregularVerbs) ?? [
        plural(first),
        /e$/.test(first)
          ? `${first}d`
          : /[^aeiou]y$/.test(first)
            ? `${first.slice(0, -1)}ied`
            : `${doubled}ed`,
        /ie$/.test(first)
          ? `${first.slice(0, -2)}ying`
          : /[^e]e$/.test(first)
            ? `${first.slice(0, -1)}ing`
            : `${doubled}ing`,
      ]),
    );
  if (adjective && !rest.length) {
    const stem = /[^aeiou]y$/.test(first) ? `${first.slice(0, -1)}i` : doubled;
    forms.push(
      ...(exceptions(irregularAdjectives) ??
        (first.length <= 6
          ? [
              `${stem}${first.endsWith("e") ? "r" : "er"}`,
              `${stem}${first.endsWith("e") ? "st" : "est"}`,
            ]
          : [])),
    );
  }
  return [...new Set(forms)].map((form) => [form, ...rest].join(" "));
}

export function japaneseForms(word: string, pos: string[]): string[] {
  const tags = pos.join(" ");
  const forms: string[] = [];
  const addVerb = (stem: string, i: string, a: string, te: string, ta: string) => {
    forms.push(
      `${stem + i}ます`,
      `${stem + i}ました`,
      `${stem + i}ません`,
      `${stem + a}ない`,
      `${stem + a}なかった`,
      stem + te,
      stem + ta,
      `${stem + te}いる`,
      `${stem + te}いた`,
    );
  };
  if (/Ichidan verb/.test(tags) && word.endsWith("る")) {
    addVerb(word.slice(0, -1), "", "", "て", "た");
  } else if (/Godan verb/.test(tags)) {
    const endings: Record<string, string[]> = {
      う: ["い", "わ", "って", "った"],
      く: ["き", "か", "いて", "いた"],
      ぐ: ["ぎ", "が", "いで", "いだ"],
      す: ["し", "さ", "して", "した"],
      つ: ["ち", "た", "って", "った"],
      ぬ: ["に", "な", "んで", "んだ"],
      ぶ: ["び", "ば", "んで", "んだ"],
      む: ["み", "ま", "んで", "んだ"],
      る: ["り", "ら", "って", "った"],
    };
    const ending = endings[word.slice(-1)];
    if (ending) {
      const [i = "", a = "", te = "", ta = ""] = ending;
      const iku = /Iku\/Yuku/.test(tags);
      addVerb(word.slice(0, -1), i, a, iku ? "って" : te, iku ? "った" : ta);
    }
  } else if (/suru verb - included/.test(tags) && word.endsWith("する")) {
    addVerb(word.slice(0, -2), "し", "し", "して", "した");
  } else if (/Kuru verb/.test(tags)) {
    if (word.endsWith("来る"))
      forms.push(
        ...["来た", "来て", "来ます", "来ました", "来ない", "来なかった"].map(
          (s) => word.slice(0, -2) + s,
        ),
      );
    if (word.endsWith("くる"))
      forms.push(
        ...["きた", "きて", "きます", "きました", "こない", "こなかった"].map(
          (s) => word.slice(0, -2) + s,
        ),
      );
  }
  if (/adjective \(keiyoushi\)/.test(tags) && word.endsWith("い")) {
    const stem =
      /yoi\/ii class/.test(tags) && word.endsWith("いい")
        ? `${word.slice(0, -2)}よ`
        : word.slice(0, -1);
    forms.push(`${stem}かった`, `${stem}くない`, `${stem}くなかった`, `${stem}くて`);
  }
  if (/adjectival nouns|na-adjective/.test(tags))
    forms.push(`${word}だった`, `${word}ではない`, `${word}じゃない`, `${word}でした`);
  return forms;
}

export function inflections(entry: DictionaryEntry): string[] {
  return entry.lang === "en"
    ? englishForms(entry.headword, entry.pos)
    : [
        ...japaneseForms(entry.headword, entry.pos),
        ...(entry.reading ? japaneseForms(entry.reading, entry.pos) : []),
      ];
}
