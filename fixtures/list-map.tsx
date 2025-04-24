export function FixtureListMap() {
  return (
    <ul>
      {Array.from({ length: 3 }, (_, i) => (
        <li key={i}>Hello, world</li>
      ))}
    </ul>
  )
}
