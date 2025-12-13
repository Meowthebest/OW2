/* ===============================
   1. IMPORTS & FONTS (New!)
   =============================== */
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Import "Big Shoulders Display" for headers (OW Style) and "Inter" for UI text */
@import url('https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;700;800;900&family=Inter:wght@400;500;600&display=swap');

/* ===============================
   2. Design Tokens
   =============================== */
@layer base {
  :root {
    --ow-orange: 25 100% 50%;
    --ow-blue: 222 30% 18%;
    /* ... keep your other variables ... */
    
    --radius: 0.5rem;
  }

  /* Force the fonts globally to fix inconsistencies */
  html {
    font-family: 'Inter', sans-serif; /* Default UI font */
  }
  
  h1, h2, h3, h4, h5, h6, 
  .font-header, 
  .pick-title {
    font-family: 'Big Shoulders Display', sans-serif; /* OW Header font */
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
}

/* ===============================
   3. Component Fixes
   =============================== */
@layer components {

  /* ... keep your .panel, .toolbar, etc ... */

  /* >>> FIX FOR THE MISSING BUTTON <<< */
  .btn-roll {
    @apply flex items-center justify-center gap-2 
           bg-[hsl(var(--ow-orange))] text-white 
           font-black text-xl uppercase tracking-wider italic
           px-8 py-6 rounded-md shadow-lg shadow-orange-500/20
           hover:bg-orange-400 hover:scale-105 hover:shadow-orange-500/40
           active:scale-95 transition-all duration-200;
           
    font-family: 'Big Shoulders Display', sans-serif;
  }

  /* ... keep the rest of your CSS ... */
}
