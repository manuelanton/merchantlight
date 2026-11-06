"use client";

/** A checkbox that saves as soon as it is clicked. `confirmOff` asks first when unticking. */
export default function TickForm({ id, checked, label, action, disabled, confirmOff }: {
  id: string;
  checked: boolean;
  label: string;
  action: (form: FormData) => Promise<void>;
  disabled?: boolean;
  confirmOff?: string;
}) {
  return (
    <form action={action} className="flex justify-center">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="on" value={checked ? "0" : "1"} />
      <input
        key={String(checked)}
        type="checkbox"
        defaultChecked={checked}
        disabled={disabled}
        aria-label={label}
        className="accent-[#d97a1f] w-4 h-4 cursor-pointer disabled:cursor-not-allowed"
        onChange={(e) => {
          if (checked && confirmOff && !confirm(confirmOff)) {
            e.target.checked = true;
            return;
          }
          e.target.form?.requestSubmit();
        }}
      />
    </form>
  );
}
