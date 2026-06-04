export const fmt = (b) => b > 1048576 ? `${(b / 1048576).toFixed(2)} MB` : `${(b / 1024).toFixed(1)} KB`;
