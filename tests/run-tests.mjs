/**
 * Test runner for JSX-to-string transformations
 *
 * This script imports the transpiled components from the dist folder,
 * renders them with test props, and logs the resulting HTML strings.
 */
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { html } from '@prairielearn/html';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '../dist');

// Test data for components that require props
const testProps = {
  FixtureAttributeProp: {
    id: 'test-id-123',
    ariaLabel: 'Test Label',
  },
  FixtureGreeting: {
    name: 'World',
  },
  FixtureDangerousHtml: {
    htmlContent: '<em>Some emphasized text</em>',
  },
  FixtureSelfClosing: {
    src: 'https://example.com/image.jpg',
    alt: 'Example Image',
  },
  FixtureSpreadAttrs: {
    customAttrs: {
      'data-testid': 'custom-test-id',
      'aria-hidden': false,
    },
  },
  FixtureProductList: {
    products: [
      {
        id: '1',
        name: 'Premium Coffee Maker',
        description:
          'A high-end coffee maker with precision temperature control',
        imageUrl: 'https://example.com/coffee-maker.jpg',
      },
      {
        id: '2',
        name: 'Smart Thermostat',
        description: 'Energy-efficient thermostat with smartphone control',
        imageUrl: 'https://example.com/thermostat.jpg',
      },
    ],
  },
};

async function runTests() {
  // Get all JS files in the dist directory
  const files = await fs.readdir(distDir);
  const jsFiles = files.filter((file) => file.endsWith('.js'));

  console.log('='.repeat(60));
  console.log('TESTING JSX-TO-STRING TRANSFORMATIONS');
  console.log('='.repeat(60));
  console.log();

  // Import and test each component
  for (const file of jsFiles) {
    const componentName = path.basename(file, '.js');
    console.log(`Testing: ${componentName}`);
    console.log('-'.repeat(40));

    try {
      // Import the component dynamically
      const modulePath = `../dist/${componentName}.js`;
      const component = await import(modulePath);

      // Get the exported function (assuming first export is the component)
      const componentFunction = Object.values(component)[0];

      // Get test props if available or use empty object
      const props = testProps[componentFunction.name] || {};

      // Render the component with test props
      const result = componentFunction(props);

      // Check if the result is an array (for fragments)
      const htmlResult = Array.isArray(result)
        ? result.map((item) => item.toString()).join('')
        : result.toString();

      console.log('Props:', JSON.stringify(props, null, 2));
      console.log('Rendered HTML:');
      console.log(htmlResult);
    } catch (error) {
      console.error(`Error testing ${componentName}:`, error);
    }

    console.log('\n');
  }
}

runTests().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
