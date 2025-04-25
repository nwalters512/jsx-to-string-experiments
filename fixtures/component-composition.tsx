/**
 * @typedef {Object} CardProps
 * @property {string} title
 * @property {string} description
 * @property {string} [imageUrl]
 */

/**
 * @param {CardProps} props
 */
function Card({ title, description, imageUrl }) {
  return (
    <div className="card">
      {imageUrl && (
        <div className="card-image">
          <img src={imageUrl} alt={title} />
        </div>
      )}
      <div className="card-content">
        <h2 className="card-title">{title}</h2>
        <p className="card-description">{description}</p>
      </div>
    </div>
  );
}

/**
 * @typedef {Object} Product
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} imageUrl
 */

/**
 * @param {{ products: Array<Product> }} props
 */
export function FixtureProductList({ products }) {
  return (
    <div className="product-list">
      {products.map((product) => (
        <Card
          key={product.id}
          title={product.name}
          description={product.description}
          imageUrl={product.imageUrl}
        />
      ))}
    </div>
  );
}
