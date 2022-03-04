module.exports = {
  rules: {
    'use-fancy-stores': {
      meta: { fixable: 'code' },
      create(context) {
        return {
          ImportDeclaration(node) {
            const { source } = node;
            if (source.value !== 'svelte/store') {
              return;
            }
            context.report({
              node,
              message: 'Import stores from svelte-fancy-stores',
              fix: (fixer) => {
                return fixer.replaceText(source, "'svelte-fancy-stores'");
              },
            });
          },
        };
      },
    },
  },
};
