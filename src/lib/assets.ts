const base = import.meta.env.BASE_URL;

export const heroPortrait = (id: string) => `${base}heroes/portrait/${id}.webp`;
export const heroArt = (id: string) => `${base}heroes/art/${id}.webp`;
export const heroArtSmall = (id: string) => `${base}heroes/art/${id}-900.webp`;
