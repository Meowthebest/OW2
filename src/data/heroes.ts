import type { Hero, Role } from '../types';

export const HEROES: Hero[] = [
  { name: 'D.Va', role: 'Tank', image: 'icons/000000038C19.webp' },
  { name: 'Domina', role: 'Tank', image: 'icons/Domina.png' },
  { name: 'Doomfist', role: 'Tank', image: 'icons/000000038C1A.webp' },
  { name: 'Hazard', role: 'Tank', image: 'icons/000000044C5E.webp' },
  { name: 'Junker Queen', role: 'Tank', image: 'icons/000000038C1B.webp' },
  { name: 'Mauga', role: 'Tank', image: 'icons/00000003DC9C.webp' },
  { name: 'Orisa', role: 'Tank', image: 'icons/000000038C1C.webp' },
  { name: 'Ramattra', role: 'Tank', image: 'icons/000000038C1D.webp' },
  { name: 'Reinhardt', role: 'Tank', image: 'icons/000000038C1E.webp' },
  { name: 'Roadhog', role: 'Tank', image: 'icons/000000038C1F.webp' },
  { name: 'Sigma', role: 'Tank', image: 'icons/000000038C27.webp' },
  { name: 'Winston', role: 'Tank', image: 'icons/000000038C25.webp' },
  { name: 'Wrecking Ball', role: 'Tank', image: 'icons/000000038C26.webp' },
  { name: 'Zarya', role: 'Tank', image: 'icons/000000038C28.webp' },
  { name: 'Anran', role: 'Damage', image: 'icons/Anran.png' },
  { name: 'Ashe', role: 'Damage', image: 'icons/150px-Ashe_mini_portrait.png' },
  { name: 'Bastion', role: 'Damage', image: 'icons/150px-Bastion_mini_portrait.png' },
  { name: 'Cassidy', role: 'Damage', image: 'icons/150px-Cassidy_OW2_mini_portrait.png' },
  { name: 'Echo', role: 'Damage', image: 'icons/150px-Echo_mini_portrait.png' },
  { name: 'Emre', role: 'Damage', image: 'icons/Emre.png' },
  { name: 'Freja', role: 'Damage', image: 'icons/150px-Freja_mini_portrait.png' },
  { name: 'Genji', role: 'Damage', image: 'icons/150px-Genji_OW2_mini_portrait.png' },
  { name: 'Hanzo', role: 'Damage', image: 'icons/150px-Hanzo_mini_portrait.png' },
  { name: 'Junkrat', role: 'Damage', image: 'icons/150px-Junkrat_OW2_mini_portrait.png' },
  { name: 'Mei', role: 'Damage', image: 'icons/150px-Mei_OW2_mini_portrait.png' },
  { name: 'Pharah', role: 'Damage', image: 'icons/150px-Pharah_OW2_mini_portrait.png' },
  { name: 'Reaper', role: 'Damage', image: 'icons/150px-Reaper_OW2_mini_portrait.png' },
  { name: 'Shion', role: 'Damage', image: 'icons/Shion.png' },
  { name: 'Sierra', role: 'Damage', image: 'icons/Sierra.png' },
  { name: 'Sojourn', role: 'Damage', image: 'icons/150px-Sojourn_mini_portrait.png' },
  { name: 'Soldier: 76', role: 'Damage', image: 'icons/150px-Soldier_OW2_mini_portrait.png' },
  { name: 'Sombra', role: 'Damage', image: 'icons/150px-Sombra_OW2_mini_portrait.png' },
  { name: 'Symmetra', role: 'Damage', image: 'icons/150px-Symmetra_OW2_mini_portrait.png' },
  { name: 'Torbjorn', role: 'Damage', image: 'icons/150px-Torbjorn_OW2_mini_portrait.png' },
  { name: 'Tracer', role: 'Damage', image: 'icons/150px-Tracer_OW2_mini_portrait.png' },
  { name: 'Vendetta', role: 'Damage', image: 'icons/Vendetta_2D_portrait.png' },
  { name: 'Venture', role: 'Damage', image: 'icons/150px-Venture_mini_portrait.png' },
  { name: 'Widowmaker', role: 'Damage', image: 'icons/150px-Widowmaker_OW2_mini_portrait.png' },
  { name: 'Ana', role: 'Support', image: 'icons/150px-Ana_OW2_mini_portrait.png' },
  { name: 'Baptiste', role: 'Support', image: 'icons/150px-Baptiste_mini_portrait.png' },
  { name: 'Brigitte', role: 'Support', image: 'icons/150px-Brigitte_OW2_mini_portrait.png' },
  { name: 'Illari', role: 'Support', image: 'icons/150px-Illari_mini_portrait.png' },
  { name: 'Jetpack Cat', role: 'Support', image: 'icons/JetpackCat.png' },
  { name: 'Juno', role: 'Support', image: 'icons/150px-Juno_mini_portrait.png' },
  { name: 'Kiriko', role: 'Support', image: 'icons/150px-Kiriko_OW2_mini_portrait.png' },
  { name: 'Lifeweaver', role: 'Support', image: 'icons/150px-Lifeweaver_mini_portrait.png' },
  { name: 'Lucio', role: 'Support', image: 'icons/150px-Lucio_OW2_mini_portrait.png' },
  { name: 'Mercy', role: 'Support', image: 'icons/150px-Mercy_OW2_mini_portrait.png' },
  { name: 'Mizuki', role: 'Support', image: 'icons/Mizuki.png' },
  { name: 'Moira', role: 'Support', image: 'icons/150px-Moira_OW2_mini_portrait.png' },
  { name: 'Wuyang', role: 'Support', image: 'icons/150px-Wuyang_mini_portrait.png' },
  { name: 'Zenyatta', role: 'Support', image: 'icons/150px-Zenyatta_OW2_mini_portrait.png' },
];

export const ROLES: Role[] = ['Tank', 'Damage', 'Support'];
export const HERO_BY_NAME = Object.fromEntries(HEROES.map((hero) => [hero.name, hero])) as Record<string, Hero>;
export const HEROES_BY_ROLE = ROLES.reduce((result, role) => {
  result[role] = HEROES.filter((hero) => hero.role === role);
  return result;
}, {} as Record<Role, Hero[]>);

export function getHero(name: string | null | undefined) {
  return name ? HERO_BY_NAME[name] : undefined;
}
