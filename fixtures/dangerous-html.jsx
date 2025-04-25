export function FixtureDangerousHtml({ htmlContent }) {
  return (
    <div>
      <h1>Regular Content</h1>
      <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
      <button data-content={`<strong>${htmlContent}</strong>`}>
        Button with escaped content
      </button>
    </div>
  );
}
