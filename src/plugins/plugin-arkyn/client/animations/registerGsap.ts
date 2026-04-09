import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";

// Side-effect-only module — registers @gsap/react's `useGSAP` plugin once
// per app load. Must be imported BEFORE any component calls `useGSAP()`,
// hence the side-effect import from `client/index.tsx` near the top of the
// import chain.
//
// Registering the plugin twice is a no-op, so importing this from multiple
// modules is safe but unnecessary.
gsap.registerPlugin(useGSAP);
