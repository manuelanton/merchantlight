/**
 * Shop config — the ONLY file a white-label copy needs to edit.
 *
 * Everything shop-specific (name, places, wording, locations, feature
 * toggles) lives here. The engine (lib/, components/, admin actions)
 * reads from SHOP so a new shop never hunts string literals.
 *
 * Copy recipe for a new shop:
 *   1. Duplicate the repo.
 *   2. Edit the values below + replace public/logo.png + public/darkwater-shop.jpg.
 *   3. Set env vars (.env.example) + deploy. No other code changes needed.
 */

// --- Brand ---
export const SHOP = {
  company: "Merchantlight Company",
  shortName: "Merchantlight",
  headerAccent: "Company",
  sigil: "🕯️",
  logo: "/logo.png",
  metaTitle: "Merchantlight Company — Darkwater Crossing general store, Eastmarch",
  metaDescription:
    "Catalogue of the Merchantlight Company (Keizaal) — outfitters at the Darkwater Crossing general store, Eastmarch. Deliveries arranged.",

  // --- Places (single source of truth — was scattered literals) ---
  homeLocation: "Darkwater Crossing",
  deliveryArea: "Eastmarch",
  /** Default site for new sales / storage units. */
  defaultLocation: "Darkwater Crossing",
  /** Known sites, deduped. Shown in sale + stock location pickers. */
  locations: ["Darkwater Crossing", "Windhelm", "Whiterun", "Winterhold"],

  // --- Public copy ---
  moveBanner: "We've moved — find us at the general store in Darkwater Crossing!",
  tagline:
    "Outfitters of Eastmarch. Bags, clothes, arms, jewelry and trade goods — crafted by friends, sold fair. White shirts welcome: come work and trade with us.",
  priceNote: "All prices in gold (septims). Bulk rates marked where offered.",
  openBadge: "● Open now — salesperson at the Darkwater store",
  closedBadge: "○ Currently closed — send word and we'll arrange it",
  visitStore: "general store in Darkwater Crossing, Eastmarch",
  visitDelivery: "deliveries within Eastmarch",
  footerLine:
    "Based at the Darkwater Crossing general store, Eastmarch · Prices in gold · Deliveries arranged within Eastmarch",
  categoryFooter: "Based at the Darkwater Crossing general store — deliveries within Eastmarch.",
  emptyCategoryBody:
    "Our enchanter is still setting up the arcane table. Send word in Windhelm or visit us in Darkwater Crossing and we'll tell you when the first enchantments are ready.",

  // --- Backoffice ---
  roleName: "Quartermaster",

  // --- Discord: server roles decide who may do what ---
  discord: {
    guildId: "1568044437890801795",
    /** Highest privilege first; the first match wins. No match = visitor. */
    roles: [
      { discordRoleId: "1568052942840402081", role: "owner", label: "Owner" },
      { discordRoleId: "1568044567004061807", role: "manager", label: "Manager" },
      { discordRoleId: "1568044679264731188", role: "employee", label: "Employee" },
      { discordRoleId: "1568044763762917458", role: "visitor", label: "Visitor" },
    ],
    /** Emergency access: always owner, whatever the server says. SUPERADMIN_DISCORD_ID env wins. */
    ownerId: "146826443924439040", // WildCard
  },

  /**
   * Feature toggles (all on = current behavior, except storagePublic).
   * storage gates the admin tab; storagePublic gates the public
   * storage teaser card + visit-us note. cash/recipes/variants are
   * engine-level and stay on for now (wiring gates = future work).
   */
  features: {
    /** Stock tracking trial: off = catalogue + sales + gold only. */
    stock: false,
    storage: true,
    /** Show storage rental teaser on the public catalogue. Off = hidden. */
    storagePublic: false,
    cash: true,
    recipes: true,
    variants: true,
    /** Show teaser cards for empty upcoming sections (e.g. Enchantments). */
    upcomingTeasers: false,
  },
} as const;

export type ShopConfig = typeof SHOP;
