import Link from "next/link";
import Collapsible from "@/components/Collapsible";
import { SHOP } from "@/shop/config";

export const dynamic = "force-dynamic";

function Rule({ title, open = false, children }: { title: string; open?: boolean; children: React.ReactNode }) {
  return (
    <Collapsible title={title} defaultOpen={open}>
      <div className="text-sm text-[#b8a888] space-y-1">{children}</div>
    </Collapsible>
  );
}

function Flow({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div className="card p-4 space-y-2">
      <h2 className="font-display text-lg">{title}</h2>
      <ol className="space-y-0">
        {steps.map((s, i) => (
          <li key={i}>
            <div className="flex gap-3 items-start">
              <span className="shrink-0 w-6 h-6 rounded-full bg-[#d97a1f] text-[#17100a] text-xs font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
              <p className="text-sm text-[#b8a888]">{s}</p>
            </div>
            {i < steps.length - 1 && <div className="ml-[11px] pl-0 text-[#d97a1f]" aria-hidden>↓</div>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="card p-4">
      <summary className="font-display cursor-pointer hover:text-[#e0bd4a]">{q}</summary>
      <div className="text-sm text-[#b8a888] mt-2 space-y-1">{children}</div>
    </details>
  );
}

export default function GuidePage() {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl">{SHOP.roleName} guide</h1>
      <p className="text-sm text-[#8a7c64]">
        One rule above all: <b className="text-[#e8dcc4]">one real event = one entry.</b> Before
        logging anything, check the tables — most duplicates come from logging twice, not from the app.
      </p>

      <h2 className="font-display text-2xl pt-2">Step-by-step flows</h2>

      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
      <Flow title="Adding stock" steps={[
        "Stock page → pick section, item, amount (+ for in, − only to correct).",
        "New goods? Add the item on the Items page first (name + price; cost can wait).",
        "Donated goods go through a contribution instead, so the donor is credited.",
        "Done — counts update everywhere within a minute.",
      ]} />

      <Flow title="Paying rent" steps={[
        "Ledger → type expense, category rent, amount, note (e.g. 2 days).",
        "Saving splits it evenly across all active members automatically.",
        "Paid from pooled chest gold? Tick “pay from company coffers” — nobody is charged.",
        "Someone fronted it? Log it as their contribution instead, so they're owed.",
      ]} />

      <Flow title="Making a sale" steps={[
        "Sales → + Add item per line (section filter narrows the list). Price autofills; edit for discounts.",
        "Submit → sale lands pending, stock drops at once.",
        "When the gold reaches the chest, hit Confirm ✓ — profit splits post to everyone.",
        "End of day: Sweep lockbox → safe on the dashboard, then Close shop.",
      ]} />

      <Flow title="End of day" steps={[
        "Confirm all pending sales (or Confirm all ✓) so the day's profit posts.",
        "Check the lockbox total on the dashboard against the register.",
        "Sweep the day's take lockbox → safe.",
        "Toggle the shop Closed.",
      ]} />
      </div>

      <h2 className="font-display text-2xl pt-2">The rules behind them</h2>

      <Rule title="1 · Recording a sale">
        <p>Use <b>+ Add item</b> for multi-item deals — one submission per customer, so the ledger groups it as one split.</p>
        <p>Sales land <b>pending</b>: gold splits only when someone hits <b>Confirm ✓</b> after the gold reaches the chest. Sales don&apos;t touch shelf counts — stock tracking is currently off.</p>
        <p>Price autofills from the catalogue — edit it for discounts. Cost autofills from recipe → manual cost → price (variants follow their parent when inherit is on).</p>
      </Rule>

      <Rule title="2 · Goods in and out (no counts)">
        <p>We don&apos;t track quantities — nobody remembered to log them, and wrong counts caused more confusion than none. The catalogue is the price list; sales are the record of what moved.</p>
        <p>Donated or crafted goods don&apos;t need logging for the count — contributions credit the donor&apos;s gold value with an itemized note, and that&apos;s the whole entry.</p>
        <p>Removing stock happens through sales records alone. Deleting a sale (Void) removes its record and its profit shares automatically.</p>
      </Rule>

      <Rule title="3 · Money in and out">
        <p><b>Contributions</b> = value into the company (gold or goods — tick “value from items” and the goods land in stock too).</p>
        <p><b>Out of pocket</b> = also a contribution: if you paid the smith yourself, the company owes <i>you</i>. Log it as a contribution, not an expense.</p>
        <p><b>Expenses / payouts</b> = gold leaving a member. Rent (type expense + category rent) splits itself across everyone.</p>
        <p><b>Company coffers</b> = pooled, unattributed gold (storage income lands here). Tick “pay from company coffers” on an expense to spend it without charging any member — e.g. rent paid from the pot.</p>
        <p>Positive balance = the company owes that member. Negative = they owe the company.</p>
      </Rule>

      <Rule title="4 · Donated goods go in ONCE">
        <p>Contributing goods does <b>one thing</b>: credits the donor&apos;s gold balance with an itemized note of what came in. That&apos;s the whole entry — done.</p>
        <p>Rule of thumb: <b>contributions</b> = goods with a donor · <b>sales</b> = goods going out. No counts anywhere.</p>
        <p>Sale profits already exclude material costs, so splitting them never pays the materials twice. If costs look wrong, fill them on the material — don&apos;t post manual corrections.</p>
      </Rule>

      <Rule title="5 · Members — spell it right, once">
        <p>Always pick from the dropdown. A typo (“Cyllian” vs “Cyllian Braehn”) creates a second person and splits their gold wrong.</p>
        <p>Use <b>+ New</b> only for genuinely new people. New members are added on the Ledger page under Members — they join future splits from then on; old splits never re-cut.</p>
        <p>Fix a duplicate with the row&apos;s <b>Edit</b> button (ledger, items) — don&apos;t add compensating rows.</p>
      </Rule>

      <Rule title="6 · Costs, recipes, margins, variants">
        <p>Unknown cost counts as sale price (zero assumed profit) — fill real material costs for honest margins.</p>
        <p>An item with a recipe prices itself from live material costs; changing a material reprices every recipe using it.</p>
        <p>Variants (↳) inherit price/cost/recipe from their parent by default (⟡) — untick inherit to price one-off. Use + Variant, re-home in Edit.</p>
        <p>Buying: blank low warns at 2; blank buy pays cost; blank cap uses tiered default (&lt;1g → 500, &lt;2g → 250, else 10).</p>
        <p>Only <i>profit</i> ever splits. Sale revenue is never paid out whole — that would pay the materials twice.</p>
      </Rule>

      <Rule title="7 · Fixing mistakes — everything undoes">
        <p>Wrong sale? <b>Void</b> it on the Sales page (record and profit shares evaporate, lockbox cash reverses). Don&apos;t post manual counter-rows.</p>
        <p>Wrong ledger row? Edit or ✕ it — except auto-posted sale splits, which you change by voiding their sale. A whole rent-style split undoes in one click with <b>Void group</b>; forgot the coffers tick? <b>→ coffers</b> rebooks the group to company gold.</p>
        <p>Wrong cash move? ✕ it in Cash history on the dashboard (sweeps undo as a pair). Wrong collect? <b>Undo</b> on the storage unit rolls the week back and removes the income.</p>
        <p>Ledger groups collapse each split into one row — expand it to see who got what.</p>
      </Rule>

      <Rule title="8 · Coordination">
        <p>Use the <Link href="/admin/notes" className="text-[#c9a227]">noticeboard</Link> for stock calls and to-dos instead of chat — low stock even has one-click Request buttons on the dashboard.</p>
        <p>Toggle the shop <b>open</b> on the dashboard only while someone is actually minding the store.</p>
      </Rule>

      <h2 className="font-display text-2xl pt-2">Quick answers</h2>

      <Faq q="My balance is negative — do I owe gold?">
        <p>Yes: positive means the company owes you, negative means you owe it. Most negatives come from rent/material shares landing before any income — check the ledger rows under your name.</p>
      </Faq>
      <Faq q="A sale shows pending — now what?">
        <p>The goods already left stock. Confirm it once the gold is physically in the chest/lockbox; only then do profit shares post.</p>
      </Faq>
      <Faq q="I logged something twice — help?">
        <p>Void it (sales) or ✕ it (ledger, stock moves) rather than posting an opposite row. Sale-linked rows can only go away via their sale.</p>
      </Faq>
      <Faq q="Two entries for the same person?">
        <p>Typo duplicate. Edit one row to the canonical spelling — members merge by exact name.</p>
      </Faq>
      <Faq q="Someone new joined — what do I do?">
        <p>Add them under Members on the Ledger page. They join all future splits; past ones never re-cut.</p>
      </Faq>
      <Faq q="Someone left — what do I do?">
        <p>Deactivate them on the Members card. History stays; future splits skip them. Settle what they're owed with a payout first.</p>
      </Faq>
      <Faq q="Cost unknown on a sale?">
        <p>It counts as sale price (zero assumed profit). Fill the material cost when known and future sales sharpen up.</p>
      </Faq>
      <Faq q="Who can confirm my sale?">
        <p>Any quartermaster, including you — but a second pair of eyes is the habit. Unconfirmed gold shows under Awaiting deposit.</p>
      </Faq>
      <Faq q="Storage says overdue?">
        <p>Their paid-through week passed. Collect the week (adjust the date if they paid late) or free the unit.</p>
      </Faq>
      <Faq q="Numbers look off overall?">
        <p>Dashboard → Ledger balance → Adjust sets the total directly (posts one unattributed correction row). Use sparingly, and say what for in the note.</p>
      </Faq>
    </div>
  );
}
