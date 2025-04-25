import * as babel from '@babel/core';
import * as t from '@babel/types';

/**
 * @returns {import('rollup').Plugin}
 */
export default function rollupPlugin() {
  return {
    name: 'rollup-plugin',
    async transform(code, id) {
      console.log('Transforming', id);
      console.log(code);
      const res = await babel.transformAsync(code, {
        filename: id,
        sourceMaps: true,
        plugins: ['@babel/plugin-syntax-jsx', babelPlugin],
      });
      console.log('Transformed to:');
      console.log(res.code);
      return {
        code: res.code,
        map: res.map,
      };
    },
  };
}

// List of HTML tags that are self-closing
const SELF_CLOSING_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

// Utility functions for attribute handling
function processAttribute(attr, t) {
  if (t.isJSXAttribute(attr)) {
    const name = attr.name.name;
    // Convert className to class
    const attrName = name === 'className' ? 'class' : name;

    if (attr.value === null) {
      return { name: attrName, value: true, type: 'boolean' };
    } else if (t.isStringLiteral(attr.value)) {
      return { name: attrName, value: attr.value.value, type: 'string' };
    } else if (t.isJSXExpressionContainer(attr.value)) {
      if (t.isBooleanLiteral(attr.value.expression)) {
        return attr.value.expression.value
          ? { name: attrName, value: true, type: 'boolean' }
          : { name: attrName, value: false, type: 'skip' };
      }
      return {
        name: attrName,
        value: attr.value.expression,
        type: 'expression',
      };
    }
  }
  return null;
}

function processChildren(children, t) {
  const results = [];
  for (const child of children) {
    if (t.isJSXText(child)) {
      const text = child.value.trim();
      if (text) {
        results.push({
          type: 'text',
          value: text,
        });
      }
    } else if (t.isJSXExpressionContainer(child)) {
      if (!t.isJSXEmptyExpression(child.expression)) {
        results.push({
          type: 'expression',
          value: child.expression,
        });
      }
    } else if (t.isJSXElement(child)) {
      results.push({
        type: 'element',
        value: jsxToTemplateLiteral(child, t),
      });
    } else if (t.isJSXFragment(child)) {
      const fragmentResult = processJSXFragment(child, t);
      if (fragmentResult.length > 0) {
        results.push({
          type: 'fragment',
          value: fragmentResult,
        });
      }
    }
  }
  return results;
}

function createTemplateFromChildren(children, t) {
  const processed = processChildren(children, t);
  const quasis = [];
  const expressions = [];
  let currentQuasi = '';

  processed.forEach((item, index) => {
    switch (item.type) {
      case 'text':
        currentQuasi += item.value;
        break;
      case 'expression':
        quasis.push(
          t.templateElement({ raw: currentQuasi, cooked: undefined }, false),
        );
        expressions.push(item.value);
        currentQuasi = '';
        break;
      case 'element':
        quasis.push(
          t.templateElement({ raw: currentQuasi, cooked: undefined }, false),
        );
        expressions.push(
          t.taggedTemplateExpression(
            t.identifier('html'),
            t.templateLiteral(item.value.quasis, item.value.expressions),
          ),
        );
        currentQuasi = '';
        break;
      case 'fragment':
        quasis.push(
          t.templateElement({ raw: currentQuasi, cooked: undefined }, false),
        );
        if (item.value.length === 1) {
          expressions.push(item.value[0]);
        } else {
          expressions.push(t.arrayExpression(item.value));
        }
        currentQuasi = '';
        break;
    }
  });

  quasis.push(
    t.templateElement({ raw: currentQuasi, cooked: undefined }, true),
  );
  return { quasis, expressions };
}

function extractDangerousHtml(attributes, t) {
  for (const attr of attributes) {
    if (
      t.isJSXAttribute(attr) &&
      attr.name.name === 'dangerouslySetInnerHTML'
    ) {
      if (
        t.isJSXExpressionContainer(attr.value) &&
        t.isObjectExpression(attr.value.expression)
      ) {
        const properties = attr.value.expression.properties;
        for (const prop of properties) {
          if (
            t.isObjectProperty(prop) &&
            (t.isIdentifier(prop.key, { name: '__html' }) ||
              t.isStringLiteral(prop.key, { value: '__html' }))
          ) {
            return prop.value;
          }
        }
      }
    }
  }
  return null;
}

function createAttributesObject(attributes, t) {
  const attrProps = [];
  for (const attr of attributes) {
    const processed = processAttribute(attr, t);
    if (processed && processed.type !== 'skip') {
      if (processed.type === 'boolean') {
        attrProps.push(
          t.objectProperty(
            t.stringLiteral(processed.name),
            t.booleanLiteral(processed.value),
          ),
        );
      } else if (processed.type === 'string') {
        attrProps.push(
          t.objectProperty(
            t.stringLiteral(processed.name),
            t.stringLiteral(processed.value),
          ),
        );
      } else if (processed.type === 'expression') {
        attrProps.push(
          t.objectProperty(t.stringLiteral(processed.name), processed.value),
        );
      }
    }
  }
  return attrProps;
}

// Main JSX transformation functions
function jsxToTemplateLiteral(jsxNode, t) {
  // Handle fragment case
  if (t.isJSXFragment(jsxNode)) {
    return processJSXFragment(jsxNode, t);
  }

  const { openingElement, closingElement, children } = jsxNode;

  // Handle element case
  if (!t.isJSXIdentifier(openingElement.name)) {
    if (t.isJSXMemberExpression(openingElement.name)) {
      const memberExpr = t.memberExpression(
        t.identifier(openingElement.name.object.name),
        t.identifier(openingElement.name.property.name),
      );
      return {
        expressions: [t.callExpression(memberExpr, [t.objectExpression([])])],
        quasis: [
          t.templateElement({ raw: '', cooked: undefined }, false),
          t.templateElement({ raw: '', cooked: undefined }, true),
        ],
      };
    }
    return { quasis: [], expressions: [] };
  }

  const tag = openingElement.name.name;
  const isCustomElement = tag.includes('-');
  const isComponent = !isCustomElement && /^[A-Z]/.test(tag);
  const isSelfClosing =
    SELF_CLOSING_TAGS.has(tag.toLowerCase()) || !closingElement;

  // For components, handle differently
  if (isComponent) {
    const propsObject = t.objectExpression(
      createAttributesObject(openingElement.attributes, t),
    );

    // Handle children if any
    if (children.length > 0) {
      const childrenResults = processChildren(children, t);
      const childrenExpressions = childrenResults.map((result) => {
        switch (result.type) {
          case 'text':
            return t.stringLiteral(result.value);
          case 'expression':
            return result.value;
          case 'element':
            return t.taggedTemplateExpression(
              t.identifier('html'),
              t.templateLiteral(result.value.quasis, result.value.expressions),
            );
          case 'fragment':
            return result.value.length === 1
              ? result.value[0]
              : t.arrayExpression(result.value);
        }
      });

      if (childrenExpressions.length === 1) {
        propsObject.properties.push(
          t.objectProperty(t.stringLiteral('children'), childrenExpressions[0]),
        );
      } else if (childrenExpressions.length > 0) {
        propsObject.properties.push(
          t.objectProperty(
            t.stringLiteral('children'),
            t.arrayExpression(childrenExpressions),
          ),
        );
      }
    }

    return {
      quasis: [
        t.templateElement({ raw: '', cooked: undefined }, false),
        t.templateElement({ raw: '', cooked: undefined }, true),
      ],
      expressions: [t.callExpression(t.identifier(tag), [propsObject])],
    };
  }

  // Check for spread attributes
  const hasSpreadAttrs = openingElement.attributes.some((attr) =>
    t.isJSXSpreadAttribute(attr),
  );
  const dangerousHTML = extractDangerousHtml(openingElement.attributes, t);

  if (hasSpreadAttrs) {
    // Handle spread attributes case
    const spreadAttrs = openingElement.attributes
      .filter((attr) => t.isJSXSpreadAttribute(attr))
      .map((attr) => attr.argument);

    const attrProps = createAttributesObject(
      openingElement.attributes.filter((attr) => !t.isJSXSpreadAttribute(attr)),
      t,
    );

    const expressions = [];
    const quasis = [];
    let currentQuasi = `<${tag} `;

    // Create dynamic attributes expression
    const attributesMapExpr = t.callExpression(
      t.memberExpression(
        t.callExpression(
          t.memberExpression(
            t.callExpression(
              t.memberExpression(
                t.identifier('Object'),
                t.identifier('entries'),
              ),
              [
                t.callExpression(
                  t.memberExpression(
                    t.identifier('Object'),
                    t.identifier('assign'),
                  ),
                  [t.objectExpression(attrProps), ...spreadAttrs],
                ),
              ],
            ),
            t.identifier('filter'),
          ),
          [
            t.arrowFunctionExpression(
              [t.arrayPattern([t.identifier('_'), t.identifier('v')])],
              t.binaryExpression('!=', t.identifier('v'), t.nullLiteral()),
            ),
          ],
        ),
        t.identifier('map'),
      ),
      [
        t.arrowFunctionExpression(
          [t.arrayPattern([t.identifier('k'), t.identifier('v')])],
          t.conditionalExpression(
            t.binaryExpression(
              '===',
              t.identifier('v'),
              t.booleanLiteral(true),
            ),
            t.taggedTemplateExpression(
              t.identifier('html'),
              t.templateLiteral(
                [
                  t.templateElement({ raw: '', cooked: '' }, false),
                  t.templateElement({ raw: '', cooked: '' }, true),
                ],
                [t.identifier('k')],
              ),
            ),
            t.taggedTemplateExpression(
              t.identifier('html'),
              t.templateLiteral(
                [
                  t.templateElement({ raw: '', cooked: '' }, false),
                  t.templateElement({ raw: '="', cooked: '="' }, false),
                  t.templateElement({ raw: '"', cooked: '"' }, true),
                ],
                [t.identifier('k'), t.identifier('v')],
              ),
            ),
          ),
        ),
      ],
    );

    quasis.push(
      t.templateElement({ raw: currentQuasi, cooked: undefined }, false),
    );
    expressions.push(
      t.callExpression(t.identifier('joinHtml'), [
        attributesMapExpr,
        t.stringLiteral(' '),
      ]),
    );

    // Handle tag closing and children
    if (isSelfClosing) {
      quasis.push(t.templateElement({ raw: '/>', cooked: undefined }, true));
    } else {
      if (dangerousHTML) {
        quasis.push(t.templateElement({ raw: '>', cooked: undefined }, false));
        expressions.push(dangerousHTML);
        quasis.push(
          t.templateElement({ raw: `</${tag}>`, cooked: undefined }, true),
        );
      } else {
        const childResult = createTemplateFromChildren(children, t);
        quasis.push(
          t.templateElement({ raw: '>', cooked: undefined }, false),
          ...childResult.quasis.slice(0, -1),
          t.templateElement(
            {
              raw:
                childResult.quasis[childResult.quasis.length - 1].value.raw +
                `</${tag}>`,
              cooked: undefined,
            },
            true,
          ),
        );
        expressions.push(...childResult.expressions);
      }
    }

    return { quasis, expressions };
  }

  // Standard (non-spread) attributes case
  let currentQuasi = `<${tag}`;
  const expressions = [];
  const quasis = [];

  // Process regular attributes
  for (const attr of openingElement.attributes) {
    const processed = processAttribute(attr, t);
    if (processed && processed.type !== 'skip') {
      currentQuasi += ' ' + processed.name;
      if (processed.type === 'boolean' && processed.value === true) {
        continue;
      }
      currentQuasi += '="';
      if (processed.type === 'string') {
        currentQuasi += processed.value;
      } else if (processed.type === 'expression') {
        quasis.push(
          t.templateElement({ raw: currentQuasi, cooked: undefined }, false),
        );
        expressions.push(processed.value);
        currentQuasi = '"';
      }
      currentQuasi += '"';
    }
  }

  // Handle closing and children
  if (isSelfClosing) {
    currentQuasi += ' />';
    quasis.push(
      t.templateElement({ raw: currentQuasi, cooked: undefined }, true),
    );
  } else {
    currentQuasi += '>';

    if (dangerousHTML) {
      quasis.push(
        t.templateElement({ raw: currentQuasi, cooked: undefined }, false),
      );
      expressions.push(dangerousHTML);
      currentQuasi = `</${tag}>`;
      quasis.push(
        t.templateElement({ raw: currentQuasi, cooked: undefined }, true),
      );
    } else {
      const childResult = createTemplateFromChildren(children, t);
      quasis.push(
        t.templateElement({ raw: currentQuasi, cooked: undefined }, false),
        ...childResult.quasis.slice(0, -1),
        t.templateElement(
          {
            raw:
              childResult.quasis[childResult.quasis.length - 1].value.raw +
              `</${tag}>`,
            cooked: undefined,
          },
          true,
        ),
      );
      expressions.push(...childResult.expressions);
    }
  }

  return { quasis, expressions };
}

/**
 * Process a JSX Fragment into an array of template literals or expressions
 * @param {object} fragmentNode - The fragment node
 * @param {object} t - Babel types
 * @return {Array} Array of template literals and expressions
 */
function processJSXFragment(fragmentNode, t) {
  if (!t.isJSXFragment(fragmentNode)) {
    throw new Error('Expected a JSX Fragment node');
  }

  const children = fragmentNode.children;
  const templateElements = [];
  let hasContent = false;

  // Process each child into its own html template literal
  for (const child of children) {
    if (t.isJSXText(child)) {
      const text = child.value.trim();
      if (text) {
        hasContent = true;
        templateElements.push(
          t.taggedTemplateExpression(
            t.identifier('html'),
            t.templateLiteral(
              [t.templateElement({ raw: text, cooked: undefined }, true)],
              [],
            ),
          ),
        );
      }
    } else if (t.isJSXExpressionContainer(child)) {
      if (!t.isJSXEmptyExpression(child.expression)) {
        hasContent = true;
        templateElements.push(child.expression);
      }
    } else if (t.isJSXElement(child)) {
      hasContent = true;
      const result = jsxToTemplateLiteral(child, t);
      templateElements.push(
        t.taggedTemplateExpression(
          t.identifier('html'),
          t.templateLiteral(
            result.quasis.map((q, i) =>
              t.templateElement(
                { raw: q.value.raw, cooked: undefined },
                i === result.quasis.length - 1,
              ),
            ),
            result.expressions,
          ),
        ),
      );
    } else if (t.isJSXFragment(child)) {
      const nestedResults = processJSXFragment(child, t);
      if (nestedResults.length > 0) {
        hasContent = true;
        templateElements.push(...nestedResults);
      }
    }
  }

  // If fragment is empty or only contains whitespace, return empty array
  if (!hasContent) {
    return [];
  }

  return templateElements;
}

/** @type {import('@babel/core').PluginObj} */
const babelPlugin = {
  name: 'babel-plugin',
  visitor: {
    Program: {
      enter(path) {
        // We'll track if we need to add imports at the program level
        path.traverse({
          JSXElement() {
            if (!path.scope.getData('needsHtmlImport')) {
              path.scope.setData('needsHtmlImport', true);
            }
          },
          JSXFragment() {
            if (!path.scope.getData('needsHtmlImport')) {
              path.scope.setData('needsHtmlImport', true);
            }
          },
        });

        // Check if we need to import escapeHtml
        path.traverse({
          JSXAttribute(attrPath) {
            if (attrPath.node.name.name === 'dangerouslySetInnerHTML') {
              if (!path.scope.getData('needsEscapeHtmlImport')) {
                path.scope.setData('needsEscapeHtmlImport', true);
              }
            }
          },
        });
      },
      exit(path) {
        // Add imports if needed
        let needsHtmlImport = path.scope.getData('needsHtmlImport');
        let needsEscapeHtmlImport = path.scope.getData('needsEscapeHtmlImport');

        if (needsHtmlImport || needsEscapeHtmlImport) {
          let hasHtmlImport = false;
          let hasEscapeHtmlImport = false;
          let hasJoinHtmlImport = false;

          path.traverse({
            ImportDeclaration(importPath) {
              if (importPath.node.source.value === '@prairielearn/html') {
                importPath.node.specifiers.forEach((specifier) => {
                  if (t.isImportSpecifier(specifier)) {
                    if (
                      specifier.imported &&
                      specifier.imported.name === 'html'
                    ) {
                      hasHtmlImport = true;
                    }
                    if (
                      specifier.imported &&
                      specifier.imported.name === 'escapeHtml'
                    ) {
                      hasEscapeHtmlImport = true;
                    }
                    if (
                      specifier.imported &&
                      specifier.imported.name === 'joinHtml'
                    ) {
                      hasJoinHtmlImport = true;
                    }
                  }
                });
              }
            },
          });

          const specifiers = [];

          if (needsHtmlImport && !hasHtmlImport) {
            specifiers.push(
              t.importSpecifier(t.identifier('html'), t.identifier('html')),
            );
          }

          if (needsEscapeHtmlImport && !hasEscapeHtmlImport) {
            specifiers.push(
              t.importSpecifier(
                t.identifier('escapeHtml'),
                t.identifier('escapeHtml'),
              ),
            );
          }

          // Always include joinHtml if we're importing html
          if (needsHtmlImport && !hasJoinHtmlImport) {
            specifiers.push(
              t.importSpecifier(
                t.identifier('joinHtml'),
                t.identifier('joinHtml'),
              ),
            );
          }

          if (specifiers.length > 0) {
            const importDeclaration = t.importDeclaration(
              specifiers,
              t.stringLiteral('@prairielearn/html'),
            );

            path.unshiftContainer('body', importDeclaration);
          }
        }
      },
    },

    // Handle JSX fragments
    JSXFragment(path) {
      const templateElements = processJSXFragment(path.node, t);

      // Replace the fragment with an array of elements or a single element
      if (templateElements.length === 0) {
        path.replaceWith(t.arrayExpression([]));
      } else if (templateElements.length === 1) {
        path.replaceWith(templateElements[0]);
      } else {
        path.replaceWith(t.arrayExpression(templateElements));
      }
    },

    JSXElement(path) {
      // Transform the JSX element
      const result = jsxToTemplateLiteral(path.node, t);

      // Create the tagged template expression
      const tagged = t.taggedTemplateExpression(
        t.identifier('html'),
        t.templateLiteral(result.quasis, result.expressions),
      );

      path.replaceWith(tagged);
    },
  },
};
