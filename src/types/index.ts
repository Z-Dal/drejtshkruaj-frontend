export interface DrejtshkruajApi {
  matches: MatchesEntity[];
  user_id?: string;
  TAT?: number;
  TST?: number;
}

export interface Software {
  name: string;
  version: string;
  buildDate: string;
  apiVersion: number;
  premium: boolean;
  premiumHint: string;
  status: string;
}
export interface Warnings {
  incompleteResults: boolean;
}
export interface Language {
  name: string;
  code: string;
  detectedLanguage: DetectedLanguage;
}
export interface DetectedLanguage {
  name: string;
  code: string;
  confidence: number;
}

export interface ReplacementsEntity {
  value: string;
}
export interface Context {
  text: string;
  offset: number;
  length: number;
}
export interface Type {
  typeName: string;
}

export interface Rule {
  id: string;
  description: string;
  issueType: string;
  category: Category;
}
export interface Category {
  id: string;
  name: string;
}
//
export type DrejtshkruajApiParams = {
  text: string;
  data: string;
  language: string;
  username: string;
  apiKey: string;
  dicts: string;
  motherTongue: string;
  preferredVariants: string;
  enabledRules: string;
  disabledRules: string;
  enabledCategories: string;
  disabledCategories: string;
  enabledOnly: string;
  level: "picky" | "default";
  [key: string]: any;
};


//dali examples
export interface SpellingApiResponse {
  user_id: string;
  TAT: number;
  TST: number;
  matches: MatchesEntity[];
}

export interface Suggestion {
  value: string;
}

export interface MatchesEntity {
  wordform: string;
  misspelled: boolean;
  suggestions: Array<Suggestion>;
  message: string;
  shortMessage: string;
  action: string;
  offset: number;
  length: number;
  contextWord?: string;
  insertPosition?: 'before' | 'after';
  originalOffset?: number;
}

export type SpellingApiParams = {
  text: string;
}

// export interface MatchesEntity {
//   message: string;
//   shortMessage: string;
//   replacements?: ReplacementsEntity[] | null;
//   offset: number;
//   length: number;
//   context: Context;
//   sentence: string;
//   type: Type;
//   rule: Rule;
//   ignoreForIncompleteSentence: boolean;
//   contextForSureMatch: number;
// }