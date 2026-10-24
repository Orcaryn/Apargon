const marker = /@intentional-comment\b[ \t]+reason:[ \t]+\S/;

export default {
  meta: {
    docs: { description: 'Require a specific rationale before allowing a source comment' },
    messages: {
      missingMarker:
        'Comments are disabled by default, remove it. Then rethink this comment first: improve the code, the names, structure so the intent is self-explanatory. Remove the comment if that makes it unnecessary. As a last resort, add `@intentional-comment reason: <why the intent cannot be expressed clearly in code>`.',
    },
    schema: [],
    type: 'suggestion',
  },
  create(context) {
    const { sourceCode } = context;

    return {
      'Program:exit'() {
        for (const comment of sourceCode.getAllComments()) {
          if (comment.type === 'Shebang') {
            continue;
          }

          if (!marker.test(comment.value)) {
            context.report({ messageId: 'missingMarker', loc: comment.loc });
          }
        }
      },
    };
  },
};
