export function FixtureSelfClosing({ src, alt }) {
  return (
    <div className="image-container">
      <img src={src} alt={alt} className="responsive-image" />
      <input type="text" disabled placeholder="Enter caption" />
    </div>
  );
}
