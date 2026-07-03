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

export interface DictManifest {
  schemaVersion: 1;
  builtAt: string;
  sourceVersions: Record<string, string>;
  shards: DictShardRef[];
  licenses: DictionarySource[];
}
