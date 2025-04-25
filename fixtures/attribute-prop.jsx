export function FixtureAttributeProp({ id, ariaLabel }) {
  return (
    <div id={id} aria-label={ariaLabel} data-custom={`item-${id}`}>
      Content with dynamic attributes
    </div>
  );
}
