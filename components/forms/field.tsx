type FieldProps = {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  textarea?: boolean;
};

export function Field({
  label,
  name,
  type = "text",
  required = false,
  textarea = false
}: FieldProps) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-gray-800">
      {label}
      {textarea ? (
        <textarea
          className="min-h-28 rounded-md border border-gray-300 px-3 py-3 outline-none focus:border-blue-900 focus:ring-2 focus:ring-blue-900/15"
          name={name}
          required={required}
        />
      ) : (
        <input
          className="rounded-md border border-gray-300 px-3 py-3 outline-none focus:border-blue-900 focus:ring-2 focus:ring-blue-900/15"
          name={name}
          required={required}
          type={type}
        />
      )}
    </label>
  );
}
