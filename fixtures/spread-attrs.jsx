export function FixtureSpreadAttrs({ customAttrs }) {
  const defaults = { id: 'default-id', title: 'Default Title' };
  return (
    <div
      className="container"
      {...defaults}
      {...customAttrs}
      data-fixed="fixed-value"
    >
      Element with spread attributes
    </div>
  );
}
