export type DictLang = "en" | "ja";

export interface DictionarySource {
  name: string;
  license: string;
  url?: string;
}

export interface DictionaryTranslation {
  text: string;
  lang: DictLang;
  priority?: number;
}

export interface DictionarySense {
  gloss: string;
  translation?: string;
  examples?: string[];
  tags?: string[];
}

export interface DictionaryPronunciation {
  ipa?: string;
  kana?: string;
  audioText?: string;
}

export interface DictionaryEntry {
  id: string;
  headword: string;
  lang: DictLang;
  reading?: string;
  /** Build-time published frequency score (higher is more common). */
  frequency?: number;
  headwordFrequency?: number;
  /** Runtime search metadata; never dictionary or AI-generated facts. */
  match?: { kind: "inflection" | "prefix" | "partial"; query: string };
  pronunciation?: DictionaryPronunciation;
  pos: string[];
  translations: DictionaryTranslation[];
  senses: DictionarySense[];
  etymology?: string;
  derivedWords?: string[];
  source: DictionarySource[];
}

export interface DictShardRef {
  lang: DictLang;
  key: string;
  path: string;
  entryCount: number;
  checksum: string;
}

export type HeadwordRow = [word: string, frequency: number];
export type InflectionRow = [form: string, lemmas: string[]];
export interface SearchIndexRef {
  lang: DictLang;
  kind: "headwords" | "inflections";
  path: string;
  start: string;
  end: string;
  entryCount: number;
  bytes: number;
  checksum: string;
}

export interface DictManifest {
  schemaVersion: 1;
  builtAt: string;
  sourceVersions: Record<string, string>;
  shards: DictShardRef[];
  search?: SearchIndexRef[];
  licenses: DictionarySource[];
}
