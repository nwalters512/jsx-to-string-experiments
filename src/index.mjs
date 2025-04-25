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

/**
 * Converts JSX to html template literals
 * @param {object} jsxNode - The JSX node to convert
 * @param {object} babel - The Babel types object
 * @return {object} The result containing quasis and expressions
 */
function jsxToTemplateLiteral(jsxNode, t) {
  // Handle fragment case
  if (t.isJSXFragment(jsxNode)) {
    return processJSXFragment(jsxNode, t);
  }

  const { openingElement, closingElement, children } = jsxNode;

  // Handle element case
  if (!t.isJSXIdentifier(openingElement.name)) {
    // We don't handle complex tag names (like member expressions) yet
    return { quasis: [], expressions: [] };
  }

  const tag = openingElement.name.name;
  const isComponent = /^[A-Z]/.test(tag);

  // For components, call the component function
  if (isComponent) {
    // Create props object
    const propsObject = t.objectExpression([]);

    // Process all attributes into props
    for (const attr of openingElement.attributes) {
      if (t.isJSXAttribute(attr)) {
        const name = attr.name.name;
        if (attr.value === null) {
          propsObject.properties.push(
            t.objectProperty(t.stringLiteral(name), t.booleanLiteral(true)),
          );
        } else if (t.isStringLiteral(attr.value)) {
          propsObject.properties.push(
            t.objectProperty(
              t.stringLiteral(name),
              t.stringLiteral(attr.value.value),
            ),
          );
        } else if (t.isJSXExpressionContainer(attr.value)) {
          propsObject.properties.push(
            t.objectProperty(t.stringLiteral(name), attr.value.expression),
          );
        }
      } else if (t.isJSXSpreadAttribute(attr)) {
        propsObject.properties.push(t.spreadElement(attr.argument));
      }
    }

    // Handle children if any
    if (children.length > 0) {
      const childrenExpressions = [];
      for (const child of children) {
        if (t.isJSXText(child)) {
          const text = child.value.trim();
          if (text) {
            childrenExpressions.push(t.stringLiteral(text));
          }
        } else if (t.isJSXExpressionContainer(child)) {
          if (!t.isJSXEmptyExpression(child.expression)) {
            childrenExpressions.push(child.expression);
          }
        } else if (t.isJSXElement(child)) {
          const childResult = jsxToTemplateLiteral(child, t);
          if (
            childResult.expressions.length === 1 &&
            t.isCallExpression(childResult.expressions[0])
          ) {
            childrenExpressions.push(childResult.expressions[0]);
          } else {
            childrenExpressions.push(
              t.taggedTemplateExpression(
                t.identifier('html'),
                t.templateLiteral(childResult.quasis, childResult.expressions),
              ),
            );
          }
        }
      }

      if (childrenExpressions.length === 1) {
        propsObject.properties.push(
          t.objectProperty(t.stringLiteral('children'), childrenExpressions[0]),
        );
      } else if (childrenExpressions.length > 1) {
        propsObject.properties.push(
          t.objectProperty(
            t.stringLiteral('children'),
            t.arrayExpression(childrenExpressions),
          ),
        );
      }
    }

    // Return the component call directly without toString()
    return {
      quasis: [
        t.templateElement({ raw: '', cooked: '' }, false),
        t.templateElement({ raw: '', cooked: '' }, true),
      ],
      expressions: [t.callExpression(t.identifier(tag), [propsObject])],
    };
  }

  const isSelfClosing =
    SELF_CLOSING_TAGS.has(tag.toLowerCase()) || !closingElement;

  // Build expressions and quasi parts
  const expressions = [];
  const quasis = [];

  // Check for dangerouslySetInnerHTML
  let hasDangerousHTML = false;
  let dangerousHTMLExpression = null;

  // Track if we have any spread attributes
  let hasSpreadAttrs = false;

  // First pass - collect any spread attributes
  const spreadAttrs = [];
  for (const attr of openingElement.attributes) {
    if (t.isJSXSpreadAttribute(attr)) {
      hasSpreadAttrs = true;
      spreadAttrs.push(attr.argument);
    }
  }

  // If we have spread attributes, use a different approach
  if (hasSpreadAttrs) {
    // Start with the opening tag
    let currentQuasi = `<${tag}`;

    // Create an object with all the regular attributes
    const attrProps = [];

    for (const attr of openingElement.attributes) {
      if (t.isJSXAttribute(attr)) {
        const name = attr.name.name;

        // Skip dangerouslySetInnerHTML, handle it separately
        if (name === 'dangerouslySetInnerHTML') {
          hasDangerousHTML = true;
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
                dangerousHTMLExpression = prop.value;
                break;
              }
            }
          }
          continue;
        }

        // Convert className to class
        const attrName = name === 'className' ? 'class' : name;

        if (attr.value === null) {
          attrProps.push(
            t.objectProperty(t.stringLiteral(attrName), t.booleanLiteral(true)),
          );
        } else if (t.isStringLiteral(attr.value)) {
          attrProps.push(
            t.objectProperty(
              t.stringLiteral(attrName),
              t.stringLiteral(attr.value.value),
            ),
          );
        } else if (t.isJSXExpressionContainer(attr.value)) {
          attrProps.push(
            t.objectProperty(t.stringLiteral(attrName), attr.value.expression),
          );
        }
      }
    }

    // Create array of html template literals for each attribute
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
              t.logicalExpression(
                '&&',
                t.binaryExpression('!=', t.identifier('v'), t.nullLiteral()),
                t.logicalExpression(
                  '&&',
                  t.binaryExpression(
                    '!==',
                    t.identifier('v'),
                    t.identifier('undefined'),
                  ),
                  t.binaryExpression(
                    '!==',
                    t.identifier('v'),
                    t.booleanLiteral(false),
                  ),
                ),
              ),
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
            // For boolean attributes, use a template with just the key
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
            // For regular attributes, create key=value template
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

    // Join the attributes with spaces using joinHtml
    const joinedAttrsExpr = t.callExpression(t.identifier('joinHtml'), [
      attributesMapExpr,
      t.stringLiteral(' '),
    ]);

    quasis.push(
      t.templateElement({ raw: currentQuasi + ' ', cooked: undefined }, false),
    );
    expressions.push(joinedAttrsExpr);

    // Close the opening tag
    if (isSelfClosing) {
      currentQuasi = '/>';
    } else {
      currentQuasi = '>';

      // Process children
      if (hasDangerousHTML && dangerousHTMLExpression) {
        quasis.push(
          t.templateElement({ raw: currentQuasi, cooked: undefined }, false),
        );
        expressions.push(
          t.callExpression(t.identifier('escapeHtml'), [
            dangerousHTMLExpression,
          ]),
        );
        currentQuasi = `</${tag}>`;
      } else {
        // Process children normally
        for (const child of children) {
          if (t.isJSXText(child)) {
            // Append text directly
            currentQuasi += child.value;
          } else if (t.isJSXExpressionContainer(child)) {
            // Skip comments
            if (t.isJSXEmptyExpression(child.expression)) {
              continue;
            }

            // Add expression container
            quasis.push(
              t.templateElement(
                { raw: currentQuasi, cooked: undefined },
                false,
              ),
            );
            expressions.push(child.expression);
            currentQuasi = '';
          } else if (t.isJSXElement(child)) {
            // Handle nested element
            const nestedResult = jsxToTemplateLiteral(child, t);

            // Create template for nested element
            const nestedTemplate = t.taggedTemplateExpression(
              t.identifier('html'),
              t.templateLiteral(
                nestedResult.quasis.map((q, i) =>
                  t.templateElement(
                    { raw: q.value.raw, cooked: undefined },
                    i === nestedResult.quasis.length - 1,
                  ),
                ),
                nestedResult.expressions,
              ),
            );

            // Add to parent
            quasis.push(
              t.templateElement(
                { raw: currentQuasi, cooked: undefined },
                false,
              ),
            );
            expressions.push(nestedTemplate);
            currentQuasi = '';
          }
        }

        // Add closing tag
        currentQuasi += `</${tag}>`;
      }
    }

    quasis.push(
      t.templateElement({ raw: currentQuasi, cooked: undefined }, true),
    );
    return { quasis, expressions };
  }

  // No spread attributes, use the standard approach
  // Process attributes
  let currentQuasi = `<${tag}`; // Initialize currentQuasi

  for (const attr of openingElement.attributes) {
    if (t.isJSXAttribute(attr)) {
      const name = attr.name.name;

      // Handle dangerouslySetInnerHTML specially
      if (name === 'dangerouslySetInnerHTML') {
        hasDangerousHTML = true;
        // Extract the __html expression from the attribute value
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
              dangerousHTMLExpression = prop.value;
              break;
            }
          }
        }
        // Skip adding this attribute to the HTML output
        continue;
      }

      // Convert className to class
      const attrName = name === 'className' ? 'class' : name;

      if (attr.value === null) {
        // Boolean attribute (like disabled, checked, etc.)
        currentQuasi += ` ${attrName}`;
      } else if (t.isStringLiteral(attr.value)) {
        // Static attribute value
        currentQuasi += ` ${attrName}="${attr.value.value}"`;
      } else if (t.isJSXExpressionContainer(attr.value)) {
        // Special case for boolean expressions
        if (t.isBooleanLiteral(attr.value.expression)) {
          if (attr.value.expression.value === true) {
            currentQuasi += ` ${attrName}`;
          }
          // If false, don't add the attribute at all
          continue;
        }

        // Dynamic attribute value
        currentQuasi += ` ${attrName}="`;
        quasis.push(
          t.templateElement({ raw: currentQuasi, cooked: undefined }, false),
        );
        expressions.push(attr.value.expression);
        currentQuasi = '"';
      }
    }
  }

  // Close opening tag - self-closing if needed
  if (isSelfClosing) {
    currentQuasi += ' />';
  } else {
    currentQuasi += '>';

    // If self-closing, we don't process children or add a closing tag
    // If we have dangerouslySetInnerHTML, handle it specially
    if (hasDangerousHTML && dangerousHTMLExpression) {
      quasis.push(
        t.templateElement({ raw: currentQuasi, cooked: undefined }, false),
      );

      // Create escapeHtml call with the HTML content
      const escapeHtmlCall = t.callExpression(t.identifier('escapeHtml'), [
        dangerousHTMLExpression,
      ]);

      expressions.push(escapeHtmlCall);
      currentQuasi = '';
    } else {
      // Process children normally
      for (const child of children) {
        if (t.isJSXText(child)) {
          // Append text directly
          currentQuasi += child.value;
        } else if (t.isJSXExpressionContainer(child)) {
          // Skip comments in JSX expressions
          if (t.isJSXEmptyExpression(child.expression)) {
            continue;
          }

          // Expression container
          quasis.push(
            t.templateElement({ raw: currentQuasi, cooked: undefined }, false),
          );
          expressions.push(child.expression);
          currentQuasi = '';
        } else if (t.isJSXElement(child)) {
          // Handle nested JSX element recursively
          const nestedResult = jsxToTemplateLiteral(child, t);

          // Create a new template literal for the nested element
          const nestedQuasis = nestedResult.quasis.map((q, i) =>
            t.templateElement(
              { raw: q.value.raw, cooked: undefined },
              i === nestedResult.quasis.length - 1,
            ),
          );

          const nestedTemplate = t.taggedTemplateExpression(
            t.identifier('html'),
            t.templateLiteral(nestedQuasis, nestedResult.expressions),
          );

          // Add to parent's expressions
          quasis.push(
            t.templateElement({ raw: currentQuasi, cooked: undefined }, false),
          );
          expressions.push(nestedTemplate);
          currentQuasi = '';
        } else if (t.isJSXFragment(child)) {
          // Handle JSX fragments within elements by processing each child
          const fragmentResult = processJSXFragment(child, t);

          if (fragmentResult.length === 1) {
            // Single item - just add it
            quasis.push(
              t.templateElement(
                { raw: currentQuasi, cooked: undefined },
                false,
              ),
            );
            expressions.push(fragmentResult[0]);
            currentQuasi = '';
          } else if (fragmentResult.length > 1) {
            // Multiple items - convert to array and add comment
            quasis.push(
              t.templateElement(
                {
                  raw: currentQuasi + '<!-- Fragment Start -->',
                  cooked: undefined,
                },
                false,
              ),
            );

            expressions.push(t.arrayExpression(fragmentResult));
            currentQuasi = '<!-- Fragment End -->';
          }
          // Empty fragments are skipped
        }
      }
    }

    // Add closing tag
    currentQuasi += `</${tag}>`;
  }

  quasis.push(
    t.templateElement({ raw: currentQuasi, cooked: undefined }, true),
  );

  return { quasis, expressions };
}

/**
 * Process a JSX Fragment into an array of template literals or expressions
 * @param {object} fragmentNode - The fragment node
 * @param {object} t - Babel types
 * @return {Array} Array of template literals and expressions
 */
function processJSXFragment(fragmentNode, t) {
  const children = fragmentNode.children;
  const templateElements = [];

  // Process each child into its own html template literal
  for (const child of children) {
    if (t.isJSXText(child)) {
      const text = child.value.trim();
      if (text) {
        // Add non-empty text nodes as template literals
        templateElements.push(
          t.taggedTemplateExpression(
            t.identifier('html'),
            t.templateLiteral(
              [
                t.templateElement(
                  { raw: child.value, cooked: undefined },
                  true,
                ),
              ],
              [],
            ),
          ),
        );
      }
    } else if (t.isJSXExpressionContainer(child)) {
      // Skip comments in JSX expressions
      if (t.isJSXEmptyExpression(child.expression)) {
        continue;
      }

      // Add expression containers directly
      templateElements.push(child.expression);
    } else if (t.isJSXElement(child)) {
      // Transform the element
      const result = jsxToTemplateLiteral(child, t);

      // Create the tagged template expression
      const elementTemplate = t.taggedTemplateExpression(
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
      );

      templateElements.push(elementTemplate);
    } else if (t.isJSXFragment(child)) {
      // Handle nested fragments recursively
      const nestedFragmentResults = processJSXFragment(child, t);
      templateElements.push(...nestedFragmentResults);
    }
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
