import Link from "next/link";

export const dynamic = "force-dynamic";

function Rule({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4 space-y-1">
      <h2 className="font-display text-lg">{title}</h2>
      <div className="text-sm text-[#b8a888] space-y-1">{children}</div>
    </div>
  );
}

export default function GuidePage() {
  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="font-display text-3xl">Quartermaster guide</h1>
      <p className="text-sm text-[#8a7c64]">
        One rule above all: <b className="text-[#e8dcc4]">one real event = one entry.</b> Before
        logging anything, check the tables — most duplicates come from logging twice, not from the app.
      </p>

      <Rule title="1 · Recording a sale">
        <p>Use <b>+ Add item</b> for multi-item deals — one submission per customer, so the ledger groups it as one split.</p>
        <p>Sales land <b>pending</b>: stock drops at once, gold splits only when someone hits <b>Confirm ✓</b> after the gold reaches the chest.</p>
        <p>Price autofills from the catalogue — edit it for discounts. Cost autofills from recipe → manual cost → price.</p>
      </Rule>

      <Rule title="2 · Stock in, stock out">
        <p><b>Add stock</b> for everything coming in (crafted, bought, found). Sales remove stock by themselves.</p>
        <p>Never hand-edit a count to “fix” it — log a correction move (negative amount) so the history stays honest.</p>
        <p>Removing stock happens through sales. Deleting a sale (Void) puts its stock back automatically.</p>
      </Rule>

      <Rule title="3 · Money in and out">
        <p><b>Contributions</b> = value into the company (gold or goods — tick “value from items” and the goods land in stock too).</p>
        <p><b>Out of pocket</b> = also a contribution: if you paid the smith yourself, the company owes <i>you</i>. Log it as a contribution, not an expense.</p>
        <p><b>Expenses / payouts</b> = gold leaving a member. Rent (type expense + category rent) splits itself across everyone.</p>
        <p>Positive balance = the company owes that member. Negative = they owe the company.</p>
      </Rule>

      <Rule title="4 · Donated goods go in ONCE">
        <p>Contributing goods does <b>two things at once</b>: credits the donor&apos;s balance <i>and</i> adds the goods to stock. That&apos;s the whole entry — done.</p>
        <p><b>Never</b> log the same goods again under Add stock. That double-counts the count (gold only moves once per posting, but the shelves will lie).</p>
        <p>Rule of thumb: <b>contributions</b> = goods with a donor · <b>Add stock</b> = crafted, found, or bought-with-chest-gold goods with no donor.</p>
        <p>Sale profits already exclude material costs, so splitting them never pays the materials twice. If costs look wrong, fill them on the material — don&apos;t post manual corrections.</p>
      </Rule>

      <Rule title="4 · Members — spell it right, once">
        <p>Always pick from the dropdown. A typo (“Cyllian” vs “Cyllian Braehn”) creates a second person and splits their gold wrong.</p>
        <p>Use <b>+ New</b> only for genuinely new people. Newcomers join future splits with their first real entry; old splits never re-cut.</p>
        <p>Fix a duplicate with the row&apos;s <b>Edit</b> button (ledger, items) — don&apos;t add compensating rows.</p>
      </Rule>

      <Rule title="5 · Costs, recipes, margins">
        <p>Unknown cost counts as sale price (zero assumed profit) — fill real material costs for honest margins.</p>
        <p>An item with a recipe prices itself from live material costs; changing a material reprices every recipe using it.</p>
        <p>Only <i>profit</i> ever splits. Sale revenue is never paid out whole — that would pay the materials twice.</p>
      </Rule>

      <Rule title="6 · Fixing mistakes">
        <p>Wrong sale? <b>Void</b> it on the Sales page (stock returns, shares evaporate). Don&apos;t post manual counter-rows.</p>
        <p>Wrong ledger row? Edit or ✕ it — except auto-posted split shares, which you change by voiding their sale.</p>
        <p>Ledger groups collapse each split into one row — expand it to see who got what.</p>
      </Rule>

      <Rule title="7 · Coordination">
        <p>Use the <Link href="/admin/notes" className="text-[#c9a227]">noticeboard</Link> for stock calls and to-dos instead of chat — low stock even has one-click Request buttons on the dashboard.</p>
        <p>Toggle the shop <b>open</b> on the dashboard only while someone is actually minding the store.</p>
      </Rule>
    </div>
  );
}
