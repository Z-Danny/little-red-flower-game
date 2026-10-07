/** A keepsake journal with a little-red-flower seal, matching the brass/forest home controls. */
export function HomeSaveControl({ onClick, disabled = false }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="title-save-manager" data-home-save onClick={onClick}
      disabled={disabled} aria-label="存档管理" aria-haspopup="dialog" title="存档管理">
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
        <path d="M7 4.5 24 3.5Q26 3.5 26 6V26Q26 28 24 28H8Q5 28 5 25V8Q5 5 7 4.5Z" fill="#bd8746" stroke="#fff0bc" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M9 5 24 4.5V23H9Z" fill="#f5dca0" />
        <path d="M9 5V23M8 23.5H25M9 25.5H23" stroke="#805830" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M6 25Q6 23 9 23H25V27H9Q6 27 6 25Z" fill="#fff0bc" />
        <path d="M10 25H23" stroke="#be985c" strokeWidth=".9" strokeLinecap="round" />
        <path d="M12 5V10L14 8.5 16 10V5" fill="#386547" />
        <path d="M17 20V16M17 19Q12 19 12 16Q16 15 17 19ZM17 18Q21 14 23 16Q22 19 17 18Z" fill="#4a7442" stroke="#4a7442" strokeWidth=".8" strokeLinejoin="round" />
        <g fill="#c84e35" stroke="#a13829" strokeWidth=".5">
          <ellipse cx="17.5" cy="11.5" rx="2.1" ry="2.5" />
          <ellipse cx="20" cy="13.4" rx="2.4" ry="2" transform="rotate(-25 20 13.4)" />
          <ellipse cx="19" cy="16" rx="2" ry="2.3" transform="rotate(-30 19 16)" />
          <ellipse cx="16" cy="16" rx="2" ry="2.3" transform="rotate(30 16 16)" />
          <ellipse cx="15" cy="13.4" rx="2.4" ry="2" transform="rotate(25 15 13.4)" />
        </g>
        <circle cx="17.5" cy="14" r="1.5" fill="#ffe09a" />
      </svg>
      <span aria-hidden="true">存档</span>
    </button>
  );
}