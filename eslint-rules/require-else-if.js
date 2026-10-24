const exitTypes = new Set(['BreakStatement', 'ContinueStatement', 'ReturnStatement', 'ThrowStatement']);

function alwaysExits(node) {
  if (!node) {
    return false;
  } else if (exitTypes.has(node.type)) {
    return true;
  } else if (node.type === 'BlockStatement') {
    return node.body.some(alwaysExits);
  } else if (node.type === 'IfStatement') {
    return alwaysExits(node.consequent) && alwaysExits(node.alternate);
  } else if (node.type === 'LabeledStatement') {
    return alwaysExits(node.body);
  }

  return false;
}

function fallsThroughUnmatched(node) {
  if (!alwaysExits(node.consequent)) {
    return false;
  } else if (!node.alternate) {
    return true;
  }

  return node.alternate.type === 'IfStatement' && fallsThroughUnmatched(node.alternate);
}

export default {
  meta: {
    docs: { description: 'Require mutually exclusive branches to be written as an if/else if chain instead of consecutive if statements' },
    fixable: 'code',
    messages: { chainElseIf: 'Chain this onto the previous branch with `else if`. Consecutive `if` statements hide that the branches are mutually exclusive.' },
    schema: [],
    type: 'suggestion',
  },
  create(context) {
    const { sourceCode } = context;

    return {
      IfStatement(node) {
        const siblings = node.parent.type === 'SwitchCase' ? node.parent.consequent : node.parent.body;

        if (!Array.isArray(siblings)) {
          return;
        }

        const previous = siblings[siblings.indexOf(node) - 1];

        if (previous?.type !== 'IfStatement' || !fallsThroughUnmatched(previous)) {
          return;
        }

        const commented = sourceCode.getCommentsBefore(node).length > 0;

        context.report({
          fix: commented ? undefined : fixer => fixer.replaceTextRange([previous.range[1], node.range[0]], ' else '),
          messageId: 'chainElseIf',
          node: sourceCode.getFirstToken(node),
        });
      },
    };
  },
};
