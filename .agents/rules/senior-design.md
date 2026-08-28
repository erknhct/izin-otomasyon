# Senior UI/UX & Motion Design Rules

These rules enforce senior-level UI/UX standards, interactive micro-animations, glassmorphic visual depth, and modern component design tokens across the repository.

## 1. Aesthetic Imperative
- Avoid basic or plain browser defaults.
- Use curated HSL dark/light palettes (Slate-950 `#020617`, Slate-900 `#0f172a`, Indigo-500 `#6366f1`).
- Enforce clean sub-pixel borders (`1px solid rgba(...)`) and subtle backdrop blur filters (`backdrop-filter: blur(...)`).

## 2. Micro-Animations & Interaction Guidelines
- **Nav Menu**: Hover states MUST slide slightly (`translateX(5px)`) and scale icons (`scale(1.15) rotate(5deg)`).
- **Cards & Widgets**: MUST lift smoothly on hover (`translateY(-4px)`), display subtle glowing top accent lines, and increase shadow elevation.
- **Buttons**: MUST feature active click scaling (`active: scale(0.96)`), smooth hover gradient transitions, and glow shadows.
- **Form Focus**: All inputs, selects, and textareas MUST feature glowing focus rings (`box-shadow: 0 0 0 2px var(--bg-main), 0 0 0 4px var(--ring-color)`).

## 3. Preservation of Functionality
- Never change HTML element IDs, event handlers, or data model attributes during visual design refactoring.
