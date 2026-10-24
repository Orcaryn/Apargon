const LONG_DASHES = /[\u2013\u2014]/g;

export default {
  meta: {
    docs: { description: 'Disallow the em dash (U+2014) and the en dash (U+2013); use contextually appropriate punctuation instead' },
    messages: {
      noLongDash:
        'Use the appropriate punctuation instead of an em dash (U+2014) or en dash (U+2013). Pick what fits the context: a comma or parentheses around an aside, a colon before a defining list or answer, a hyphen (-) inside a compound descriptor, or "to" between a numeric range.',
    },
    schema: [],
    type: 'problem',
  },
  create(context) {
    const { sourceCode } = context;

    return {
      'Program:exit'() {
        for (const match of sourceCode.text.matchAll(LONG_DASHES)) {
          context.report({ loc: sourceCode.getLocFromIndex(match.index), messageId: 'noLongDash' });
        }
      },
    };
  },
};
