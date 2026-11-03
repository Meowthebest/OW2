// The hero roster. To add a hero: append an entry below, then add
// public/heroes/portrait/<id>.webp and public/heroes/art/<id>.webp (+ <id>-900.webp).
// `npm run check:roster` compares this file against the live OverFast hero list.

export type Role = 'tank' | 'damage' | 'support';

export type SubRole =
  | 'bruiser'
  | 'initiator'
  | 'stalwart'
  | 'flanker'
  | 'recon'
  | 'sharpshooter'
  | 'specialist'
  | 'medic'
  | 'survivor'
  | 'tactician';

export interface Hero {
  /** Official slug. Also the OverFast API hero key and the asset file name. */
  id: string;
  name: string;
  role: Role;
  subRole: SubRole;
  base: string;
  summary: string;
  abilities: string[];
  stadium?: boolean;
  isNew?: boolean;
}

export const ROSTER_SEASON = 'Season 5';
export const ROSTER_CHECKED = '2026-11-04';

export const ROLES: Role[] = ['tank', 'damage', 'support'];

export const ROLE_LABEL: Record<Role, string> = {
  tank: 'Tank',
  damage: 'Damage',
  support: 'Support',
};

export const SUB_ROLES: Record<SubRole, { label: string; passive: string }> = {
  bruiser: { label: 'Bruiser', passive: 'Resists critical hits and speeds up below half health.' },
  initiator: { label: 'Initiator', passive: 'Heals over time after using a set movement ability.' },
  stalwart: { label: 'Stalwart', passive: 'Resists knockback and slows.' },
  flanker: { label: 'Flanker', passive: 'Gets extra healing from health packs.' },
  recon: { label: 'Recon', passive: 'Reveals enemies damaged below half health.' },
  sharpshooter: { label: 'Sharpshooter', passive: 'Critical hits cut movement ability cooldowns.' },
  specialist: { label: 'Specialist', passive: 'Eliminations briefly speed up reloads.' },
  medic: { label: 'Medic', passive: 'Healing allies with your weapon heals you too.' },
  survivor: { label: 'Survivor', passive: 'Movement abilities start passive regeneration.' },
  tactician: { label: 'Tactician', passive: 'Stores excess ultimate charge.' },
};

export const HEROES: Hero[] = [
  // Tank
  { id: 'dmon', name: 'D.Mon', role: 'tank', subRole: 'stalwart', base: 'MEKA Base, Busan', summary: 'MEKA\'s captain duels with a plasma saber and a portable cannon, then calls in a mech when the fight turns serious.', abilities: ['Plasma Saber', 'Portable Fusion Repeater', 'Power Barrier', 'Surging Strike', 'Limit Break', 'Call Mech'] },
  { id: 'dva', name: 'D.Va', role: 'tank', subRole: 'initiator', base: 'Watchpoint: Gibraltar', summary: 'Boost into the backline, eat projectiles with Defense Matrix, and turn your mech into a bomb when it counts.', abilities: ['Fusion Cannons', 'Boosters', 'Defense Matrix', 'Micro Missiles', 'Self-Destruct'], stadium: true },
  { id: 'domina', name: 'Domina', role: 'tank', subRole: 'stalwart', base: 'Utopaea, India', summary: 'Shape hard light into barrier arrays and charged crystals, then push the enemy out of the space you want.', abilities: ['Photon Magnum', 'Barrier Array', 'Sonic Repulsors', 'Crystal Charge', 'Panopticon'] },
  { id: 'doomfist', name: 'Doomfist', role: 'tank', subRole: 'initiator', base: 'Rome, Italy', summary: 'Block incoming damage to supercharge a Rocket Punch, then crash through the backline and slam your way out.', abilities: ['Hand Cannon', 'Rocket Punch', 'Seismic Slam', 'Power Block', 'Meteor Strike'], stadium: true },
  { id: 'hazard', name: 'Hazard', role: 'tank', subRole: 'initiator', base: 'Unknown', summary: 'Vault onto targets, wall off their escape with jagged spikes, and bury the fight under a Downpour.', abilities: ['Bonespur', 'Spike Guard', 'Violent Leap', 'Jagged Wall', 'Downpour'], stadium: true },
  { id: 'junker-queen', name: 'Junker Queen', role: 'tank', subRole: 'stalwart', base: 'Junkertown, Australia', summary: 'Open wounds with axe and knife, heal off the bleeding, and shout your team forward into a brawl.', abilities: ['Scattergun', 'Commanding Shout', 'Carnage', 'Rampage', 'Adrenaline Rush'], stadium: true },
  { id: 'mauga', name: 'Mauga', role: 'tank', subRole: 'bruiser', base: 'Apia, Samoa', summary: 'Twin chainguns, relentless aggression, and a Cage Fight that locks the enemy in with you.', abilities: ['Overrun', 'Cardiac Overdrive', 'Berserker', 'Cage Fight'] },
  { id: 'orisa', name: 'Orisa', role: 'tank', subRole: 'bruiser', base: 'Numbani', summary: 'Fortify through burst damage, spin a javelin through incoming fire, and refuse to be moved.', abilities: ['Augmented Fusion Driver', 'Energy Javelin', 'Fortify', 'Javelin Spin', 'Terra Surge'], stadium: true },
  { id: 'ramattra', name: 'Ramattra', role: 'tank', subRole: 'stalwart', base: 'Formerly Shambali Monastery', summary: 'Poke from range in Omnic form, then switch to Nemesis form and pummel anything that gets close.', abilities: ['Void Accelerator', 'Void Barrier', 'Pummel', 'Ravenous Vortex', 'Annihilation'], stadium: true },
  { id: 'reinhardt', name: 'Reinhardt', role: 'tank', subRole: 'stalwart', base: 'Watchpoint: Gibraltar', summary: 'The classic frontline: hold the shield, swing the hammer, charge the gap, and shatter the whole team.', abilities: ['Rocket Hammer', 'Charge', 'Fire Strike', 'Barrier Field', 'Earthshatter'], stadium: true },
  { id: 'roadhog', name: 'Roadhog', role: 'tank', subRole: 'bruiser', base: 'Formerly Junkertown', summary: 'Hook a target, unload scrap at point-blank range, and breathe off the damage afterward.', abilities: ['Scrap Gun', 'Trash Compactor', 'Chain Hook', 'Take a Breather', 'Whole Hog'] },
  { id: 'sigma', name: 'Sigma', role: 'tank', subRole: 'stalwart', base: 'Formerly The Hague', summary: 'Bend gravity to catch projectiles, hurl rock across the map, and lift entire teams off the ground.', abilities: ['Hyperspheres', 'Kinetic Grasp', 'Accretion', 'Experimental Barrier', 'Gravitic Flux'], stadium: true },
  { id: 'winston', name: 'Winston', role: 'tank', subRole: 'initiator', base: 'Watchpoint: Gibraltar', summary: 'Leap onto the backline, drop a bubble, and arc electricity through everyone caught inside.', abilities: ['Tesla Cannon', 'Jump Pack', 'Barrier Projector', 'Primal Rage'], stadium: true },
  { id: 'wrecking-ball', name: 'Wrecking Ball', role: 'tank', subRole: 'initiator', base: 'Formerly Junkertown', summary: 'Grapple, roll, and piledrive through the enemy at full speed, leaving a minefield in your wake.', abilities: ['Quad Cannons', 'Grappling Claw', 'Roll', 'Piledriver', 'Adaptive Shield', 'Minefield'] },
  { id: 'zarya', name: 'Zarya', role: 'tank', subRole: 'bruiser', base: 'Watchpoint: Gibraltar', summary: 'Bubble yourself and your allies to soak damage, then burn it back through a beam that keeps getting stronger.', abilities: ['Particle Cannon', 'Particle Barrier', 'Projected Barrier', 'Graviton Surge'], stadium: true },

  // Damage
  { id: 'anran', name: 'Anran', role: 'damage', subRole: 'flanker', base: 'Watchpoint: Gibraltar', summary: 'Dash in with twin fans, set targets alight, and rise from the ashes when a fight goes wrong.', abilities: ['Zhuque Fans', 'Fan the Flames', 'Dancing Blaze', 'Inferno Rush', 'Vermillion Ascent'] },
  { id: 'ashe', name: 'Ashe', role: 'damage', subRole: 'sharpshooter', base: 'Deadlock Gorge, Arizona', summary: 'Line up rifle shots from long range, light Dynamite for extra burn, and send in B.O.B. to clean up.', abilities: ['The Viper', 'Coach Gun', 'Dynamite', 'B.O.B.'], stadium: true },
  { id: 'bastion', name: 'Bastion', role: 'damage', subRole: 'specialist', base: 'Gothenburg, Sweden', summary: 'A curious robot that reconfigures into a walking turret and shreds whatever stands in front of it.', abilities: ['Configuration: Recon', 'Configuration: Assault', 'A-36 Tactical Grenade', 'Configuration: Artillery'] },
  { id: 'cassidy', name: 'Cassidy', role: 'damage', subRole: 'sharpshooter', base: 'Watchpoint: Gibraltar', summary: 'Win the mid-range duel with a revolver, roll to reload, and close the round with Deadeye.', abilities: ['Peacekeeper', 'Combat Roll', 'Deadeye'], stadium: true },
  { id: 'echo', name: 'Echo', role: 'damage', subRole: 'recon', base: 'Watchpoint: Gibraltar', summary: 'Fly above the fight, stack sticky bombs, finish with a beam, and copy any enemy for a moment.', abilities: ['Tri-Shot', 'Sticky Bombs', 'Flight', 'Focusing Beam', 'Duplicate'] },
  { id: 'emre', name: 'Emre', role: 'damage', subRole: 'specialist', base: 'Rome, Italy', summary: 'A vanished strike-team veteran with a burst rifle, cyber frags, and a body rewritten by something unknown.', abilities: ['Synthetic Burst Rifle', 'Cyber Frag', 'Override Protocol', 'Altered Vitals'] },
  { id: 'freja', name: 'Freja', role: 'damage', subRole: 'recon', base: 'Unknown', summary: 'A bounty hunter who dashes and updrafts for high angles, then tags her marks with explosive bolas.', abilities: ['Bola Shot', 'Quick Dash', 'Take Aim', 'Updraft'], stadium: true },
  { id: 'genji', name: 'Genji', role: 'damage', subRole: 'flanker', base: 'Watchpoint: Gibraltar', summary: 'Climb, deflect, and dash through the backline, then unsheathe the Dragonblade when the opening appears.', abilities: ['Shuriken', 'Deflect', 'Swift Strike', 'Dragonblade', 'Cyber-Agility'], stadium: true },
  { id: 'hanzo', name: 'Hanzo', role: 'damage', subRole: 'sharpshooter', base: 'Formerly Hanamura', summary: 'Scout with Sonic Arrow, loose fast Storm Arrows, and send spirit dragons straight through the choke.', abilities: ['Storm Bow', 'Storm Arrows', 'Sonic Arrow', 'Lunge', 'Dragonstrike'] },
  { id: 'junkrat', name: 'Junkrat', role: 'damage', subRole: 'specialist', base: 'Formerly Junkertown', summary: 'Spam grenades around every corner, trap the flankers, and drive a RIP-Tire into the middle of it all.', abilities: ['Frag Launcher', 'Concussion Mine', 'Steel Trap', 'RIP-Tire'], stadium: true },
  { id: 'mei', name: 'Mei', role: 'damage', subRole: 'specialist', base: 'Formerly Xi\'an', summary: 'Slow targets down, split the fight in two with Ice Wall, and survive anything inside a block of ice.', abilities: ['Endothermic Blaster', 'Cryo-Freeze', 'Ice Wall', 'Blizzard'], stadium: true },
  { id: 'pharah', name: 'Pharah', role: 'damage', subRole: 'recon', base: 'Watchpoint: Gibraltar', summary: 'Own the sky with rockets and jump jets, then rain down a Barrage on anyone who forgot to look up.', abilities: ['Rocket Launcher', 'Jet Dash', 'Jump Jet', 'Concussive Blast', 'Barrage'], stadium: true },
  { id: 'reaper', name: 'Reaper', role: 'damage', subRole: 'flanker', base: 'Rome, Italy', summary: 'Shadow Step behind the lines, drain health at shotgun range, and wraith away before they turn around.', abilities: ['Hellfire Shotguns', 'Shadow Step', 'Wraith Form', 'Death Blossom', 'The Reaping'], stadium: true },
  { id: 'shion', name: 'Shion', role: 'damage', subRole: 'flanker', base: 'Tokyo, Japan', summary: 'An omnic clan elder who weaves through fights with twin pistols and finishes weakened targets up close.', abilities: ['Kira Pistols', 'Execution', 'Joyride', 'Evade', 'Satsuriku Spree'] },
  { id: 'sierra', name: 'Sierra', role: 'damage', subRole: 'recon', base: 'Grand Mesa, Colorado', summary: 'A Helix operative who tags targets with tracking rounds and uses her anchor drone to reach new angles.', abilities: ['Helix Rifle', 'Tracking Shot', 'Tremor Charge', 'Anchor Drone', 'Trailblazer'] },
  { id: 'sojourn', name: 'Sojourn', role: 'damage', subRole: 'sharpshooter', base: 'Toronto, Canada', summary: 'Build railgun charge with every hit, then cash it in on one clean headshot after a Power Slide.', abilities: ['Railgun', 'Power Slide', 'Disruptor Shot', 'Overclock'], stadium: true },
  { id: 'soldier-76', name: 'Soldier: 76', role: 'damage', subRole: 'specialist', base: 'Unknown', summary: 'A steady pulse rifle, a sprint, and a healing field. Reliable everywhere, and lethal behind a Tactical Visor.', abilities: ['Heavy Pulse Rifle', 'Sprint', 'Biotic Field', 'Helix Rockets', 'Tactical Visor'], stadium: true },
  { id: 'symmetra', name: 'Symmetra', role: 'damage', subRole: 'specialist', base: 'Utopaea, India', summary: 'Hard-light architect who ramps a beam up to full power, seeds turrets, and teleports the team into place.', abilities: ['Photon Projector', 'Sentry Turret', 'Teleporter', 'Photon Barrier'] },
  { id: 'torbjorn', name: 'Torbjörn', role: 'damage', subRole: 'specialist', base: 'Gothenburg, Sweden', summary: 'Drop a turret, forge it with your hammer, and overload to hold ground against anything that comes close.', abilities: ['Rivet Gun', 'Forge Hammer', 'Deploy Turret', 'Overload', 'Molten Core'], stadium: true },
  { id: 'tracer', name: 'Tracer', role: 'damage', subRole: 'flanker', base: 'Watchpoint: Gibraltar', summary: 'Blink past the frontline, Recall out of trouble, and stick a Pulse Bomb on the way through.', abilities: ['Pulse Pistols', 'Blink', 'Recall', 'Pulse Bomb'], stadium: true },
  { id: 'vendetta', name: 'Vendetta', role: 'damage', subRole: 'flanker', base: 'Rome, Italy', summary: 'A Colosseo champion who guards with Warding Stance, then carves through the lines with a huge blade.', abilities: ['Palatine Fang', 'Warding Stance', 'Whirlwind Dash', 'Soaring Slice', 'Projected Edge', 'Sundering Blade'], stadium: true },
  { id: 'venture', name: 'Venture', role: 'damage', subRole: 'flanker', base: 'Roaming', summary: 'Burrow beneath the fight and erupt under the enemy, drilling through anyone close enough to hit.', abilities: ['SMART Excavator', 'Drill Dash', 'Burrow', 'Tectonic Shock'] },
  { id: 'widowmaker', name: 'Widowmaker', role: 'damage', subRole: 'sharpshooter', base: 'Annecy, France', summary: 'Grapple to a perch, scope in, and end the fight before it starts with a single perfect shot.', abilities: ['Widow\'s Kiss', 'Grappling Hook', 'Venom Mine', 'Infra-Sight'] },

  // Support
  { id: 'doctrine', name: 'Doctrine', role: 'support', subRole: 'survivor', base: 'Watchpoint: Grímsvötn', summary: 'A cyberneticist turned villain who infuses his next ability and sends life-draining drones through the fight.', abilities: ['Eternal Scepter', 'Infuse', 'Invigorating Drones', 'Shrouded Momentum', 'Deliverance'], isNew: true },
  { id: 'ana', name: 'Ana', role: 'support', subRole: 'tactician', base: 'Cairo, Egypt', summary: 'Heal from across the map, put the biggest threat to sleep, and Nano Boost an ally to swing the fight.', abilities: ['Biotic Rifle', 'Sleep Dart', 'Biotic Grenade', 'Nano Boost'], stadium: true },
  { id: 'baptiste', name: 'Baptiste', role: 'support', subRole: 'tactician', base: 'Watchpoint: Gibraltar', summary: 'A combat medic who bursts allies back to health, denies a wipe with Immortality Field, and amps every shot.', abilities: ['Biotic Launcher', 'Regenerative Burst', 'Immortality Field', 'Amplification Matrix', 'Exo Boots'] },
  { id: 'brigitte', name: 'Brigitte', role: 'support', subRole: 'survivor', base: 'Watchpoint: Gibraltar', summary: 'A frontline bodyguard with flail and shield who throws Repair Packs and rallies the team into a brawl.', abilities: ['Rocket Flail', 'Repair Pack', 'Whip Shot', 'Barrier Shield', 'Rally'], stadium: true },
  { id: 'illari', name: 'Illari', role: 'support', subRole: 'survivor', base: 'Runasapi, Peru', summary: 'Plant a Healing Pylon, snipe with a solar rifle, and launch into the air to throw down a Captive Sun.', abilities: ['Solar Rifle', 'Healing Pylon', 'Outburst', 'Captive Sun'] },
  { id: 'jetpack-cat', name: 'Jetpack Cat', role: 'support', subRole: 'tactician', base: 'Watchpoint: Gibraltar', summary: 'A fearless feline pilot who flings healing from the air and tows teammates to safety on a Lifeline.', abilities: ['Biotic Pawjectiles', 'Frenetic Flight', 'Lifeline', 'Purr', 'Catnapper'], stadium: true },
  { id: 'juno', name: 'Juno', role: 'support', subRole: 'survivor', base: 'Watchpoint: Gibraltar', summary: 'Glide in low gravity, lock Pulsar Torpedoes onto allies, and speed the whole team through a Hyper Ring.', abilities: ['Mediblaster', 'Pulsar Torpedoes', 'Glide Boost', 'Hyper Ring', 'Orbital Ray'], stadium: true },
  { id: 'kiriko', name: 'Kiriko', role: 'support', subRole: 'medic', base: 'Kanezaka, Japan', summary: 'Throw healing ofuda, Swift Step to any ally in danger, and cleanse the team with a Protection Suzu.', abilities: ['Healing Ofuda', 'Kunai', 'Swift Step', 'Protection Suzu', 'Kitsune Rush'], stadium: true },
  { id: 'lifeweaver', name: 'Lifeweaver', role: 'support', subRole: 'medic', base: 'Atlantic Arcology', summary: 'Grow healing blossoms, raise allies on a Petal Platform, and pull a teammate out of danger with Life Grip.', abilities: ['Healing Blossom', 'Thorn Volley', 'Petal Platform', 'Rejuvenating Dash', 'Life Grip', 'Tree of Life'] },
  { id: 'lucio', name: 'Lúcio', role: 'support', subRole: 'tactician', base: 'Rio de Janeiro, Brazil', summary: 'Ride the walls, crossfade between speed and healing, and drop the beat on a Sound Barrier.', abilities: ['Sonic Amplifier', 'Crossfade', 'Amp It Up', 'Soundwave', 'Sound Barrier'], stadium: true },
  { id: 'mercy', name: 'Mercy', role: 'support', subRole: 'medic', base: 'Watchpoint: Gibraltar', summary: 'Fly between teammates, heal or boost them with your staff, and bring a fallen ally back with Resurrect.', abilities: ['Caduceus Staff', 'Caduceus Blaster', 'Guardian Angel', 'Resurrect', 'Valkyrie'], stadium: true },
  { id: 'mizuki', name: 'Mizuki', role: 'support', subRole: 'survivor', base: 'Kanezaka, Japan', summary: 'A cursed wanderer who sends out a healing kasa, binds enemies with chains, and raises a Kekkai Sanctuary.', abilities: ['Spirit Glaive', 'Healing Kasa', 'Binding Chain', 'Katashiro Return', 'Kekkai Sanctuary'] },
  { id: 'moira', name: 'Moira', role: 'support', subRole: 'medic', base: 'Oasis, Iraq', summary: 'Drain enemies to fuel your healing spray, Fade out of danger, and sweep a Coalescence beam through the fight.', abilities: ['Biotic Grasp', 'Biotic Orb', 'Fade', 'Coalescence'], stadium: true },
  { id: 'sombra', name: 'Sombra', role: 'support', subRole: 'tactician', base: 'Dorado, Mexico', summary: 'A notorious hacker who slips through Cyberspace, patches allies with Hotfix, and shuts the fight down with EMP.', abilities: ['Machine Pistol', 'Hotfix', 'Cyberspace', 'Translocator', 'EMP'] },
  { id: 'wuyang', name: 'Wuyang', role: 'support', subRole: 'survivor', base: 'Wuxing University, Chengdu', summary: 'A Water College student who heals with a Restorative Stream and turns the tide with a Guardian Wave.', abilities: ['Xuanwu Staff', 'Restorative Stream', 'Rushing Torrent', 'Tidal Blast', 'Guardian Wave'], stadium: true },
  { id: 'zenyatta', name: 'Zenyatta', role: 'support', subRole: 'tactician', base: 'Formerly Shambali Monastery', summary: 'Float above it all, tie Harmony to an ally and Discord to an enemy, and outlast a wipe with Transcendence.', abilities: ['Orb of Destruction', 'Orb of Discord', 'Orb of Harmony', 'Transcendence', 'Snap Kick'], stadium: true },
];

export const HERO_BY_ID: Record<string, Hero> = Object.fromEntries(HEROES.map((hero) => [hero.id, hero]));

export function getHero(id: string | null | undefined): Hero | undefined {
  return id ? HERO_BY_ID[id] : undefined;
}

export function heroesInRole(role: Role): Hero[] {
  return HEROES.filter((hero) => hero.role === role);
}

export const ROLE_COUNT: Record<Role, number> = {
  tank: heroesInRole('tank').length,
  damage: heroesInRole('damage').length,
  support: heroesInRole('support').length,
};
