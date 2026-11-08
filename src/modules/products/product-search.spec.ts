import { tokenize } from './product-search.service.js';

describe('search tokenize', () => {
  it('lower-cases, strips punctuation and splits on spaces and hyphens', () => {
    expect(tokenize('  Red  SILK-Sarees!! ')).toEqual(['red', 'silk', 'sarees']);
  });

  it('drops stop words and duplicates', () => {
    expect(tokenize('a saree for the wedding saree')).toEqual(['saree', 'wedding']);
  });

  it('keeps at most 6 words', () => {
    expect(tokenize('one two three four five six seven eight')).toHaveLength(6);
  });

  it('turns SQL/LIKE characters into nothing searchable', () => {
    expect(tokenize("'; DROP TABLE \"Product\";--")).toEqual(['drop', 'table', 'product']);
    expect(tokenize('%%% ___')).toEqual([]);
  });

  it('keeps non-English letters (e.g. Bengali)', () => {
    expect(tokenize('বালুচরী শাড়ি')).toHaveLength(2);
  });
});
