/**
 * @returns {import('rollup').Plugin}
 */
export default function rollupPlugin() {
  return {
    name: 'rollup-plugin',
    transform(code, id) {
      console.log('Transforming', id)
      console.log(code)
      return {
        code,
        map: null,
      }
    }
  }
}
