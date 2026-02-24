"use client";

import { useState, type KeyboardEvent } from "react";

interface Props {
  id: string;
  label: string;
  placeholder?: string;
  hint?: string;
  values: string[];
  onChange: (values: string[]) => void;
  maxItems?: number;
}

export function TagInput({ id, label, placeholder, hint, values, onChange, maxItems = 50 }: Props) {
  const [input, setInput] = useState("");

  function addTag(raw: string) {
    const tag = raw.trim();
    if (!tag || values.includes(tag) || values.length >= maxItems) return;
    onChange([...values, tag]);
    setInput("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input);
    } else if (e.key === "Backspace" && !input && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  }

  function removeTag(tag: string) {
    onChange(values.filter((v) => v !== tag));
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-gray-700">
        {label}
      </label>
      <div className="flex flex-wrap gap-1 rounded-md border border-gray-300 bg-white p-2 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500">
        {values.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              aria-label={`Remove ${tag}`}
              className="text-indigo-500 hover:text-indigo-700"
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          type="text"
          value={input}
          placeholder={values.length === 0 ? placeholder : undefined}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => addTag(input)}
          className="min-w-[120px] flex-1 border-none bg-transparent text-sm outline-none"
        />
      </div>
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  );
}
