// Illustrated pill art, so a shelf of medicines is told apart by sight instead
// of every tablet sharing one generic stock photo. Known demo medicines get
// their own look; anything else falls back to a picture for its form (tablet,
// capsule, syrup, drops) — still distinct from a bare Ionicon, still honest
// about not knowing the real packaging.
const IMAGES: Record<string, any> = {
  amlodipine: require("../../assets/images/health/med-amlodipine.png"),
  metformin: require("../../assets/images/health/med-metformin.png"),
  "vitamin d3": require("../../assets/images/health/med-vitamind3.png"),
  tablet: require("../../assets/images/health/med-tablet.png"),
  capsule: require("../../assets/images/health/med-capsule.png"),
  syrup: require("../../assets/images/health/med-syrup.png"),
  drops: require("../../assets/images/health/med-drops.png"),
};

// Pastels from the app's own family, kept deliberately distinct from one
// another: telling one medicine from the next at a glance is the whole point of
// these tints, so they harmonise without converging.
const TINTS: Record<string, string> = {
  amlodipine: "#FFE3E6",
  metformin: "#E7EDF9",
  "vitamin d3": "#FFEEDC",
  tablet: "#DDEBF8",
  capsule: "#FFE7DE",
  syrup: "#F2EFE6",
  drops: "#EAE6F7",
};

export function medArt(name: string | undefined, type: string | undefined): { image: any; tint: string } {
  const key = (name || "").trim().toLowerCase();
  if (IMAGES[key]) return { image: IMAGES[key], tint: TINTS[key] };
  const t = (type || "tablet").toLowerCase();
  const image = IMAGES[t] || IMAGES.tablet;
  const tint = TINTS[t] || TINTS.tablet;
  return { image, tint };
}
