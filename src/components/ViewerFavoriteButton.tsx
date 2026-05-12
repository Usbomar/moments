"use client";

type Props = {
  favorite: boolean;
  disabled?: boolean;
  busy?: boolean;
  onClick: () => void;
};

/** Estrella buida / plena per commutar favorit al visor. */
export function ViewerFavoriteButton({ favorite, disabled, busy, onClick }: Props) {
  return (
    <button
      type="button"
      className={`viewer-toolbar-btn viewer-toolbar-btn--icon viewer-toolbar-btn--star${favorite ? " viewer-toolbar-btn--star-on" : ""}`}
      disabled={disabled || busy}
      aria-pressed={favorite}
      aria-label={favorite ? "Treure de preferides" : "Marcar com a preferida"}
      title={favorite ? "Treure de preferides" : "Marcar com a preferida"}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {favorite ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" aria-hidden>
          <path
            fill="currentColor"
            d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
          />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}
