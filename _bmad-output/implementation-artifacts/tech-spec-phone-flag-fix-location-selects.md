---
title: "PhoneInput Flag Fix & Location Select Dropdowns"
slug: "phone-flag-fix-location-selects"
created: "2026-02-23"
status: "completed"
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - "Next.js 16 / React 19 / TypeScript strict (noUncheckedIndexedAccess)"
  - "react-hook-form + zod"
  - "react-phone-number-input v3.4.14"
  - "country-state-city (new dependency)"
  - "Radix UI Select (@/components/ui/select)"
  - "next-intl"
  - "Vitest + Testing Library (jsdom)"
files_to_modify:
  - "src/features/auth/components/ApplicationForm.tsx"
  - "src/features/auth/components/ApplicationForm.test.tsx"
  - "messages/en.json"
  - "messages/ig.json"
code_patterns:
  - "Controller from react-hook-form wrapping Radix Select"
  - "Module-level constant for static country list (computed once outside component)"
  - "useMemo for derived reactive values (countryIsoCode, stateOptions)"
  - "Wrapper div pattern for PhoneInput — library controls internal layout"
  - "setValue() inside onValueChange to reset dependent field"
test_patterns:
  - "vi.mock for country-state-city (minimal 3-country stub)"
  - "vi.mock for @/components/ui/select (Radix portals incompatible with jsdom)"
  - "SelectItem rendered as <button> so userEvent.click triggers onValueChange"
---

# Tech-Spec: PhoneInput Flag Fix & Location Select Dropdowns

**Created:** 2026-02-23

---

## Overview

### Problem Statement

1. **PhoneInput flag broken**: The `PhoneInput` component (Step 1 of the membership form) has a long Tailwind `className` applied directly to the `react-phone-number-input` wrapper `<div>`. This overrides the library's internal CSS for the `.PhoneInputCountry` flag selector, breaking flag display.

2. **Location fields are free-text**: The `locationCountry` and `locationState` fields (Step 2) are plain `<Input>` text fields, making it easy to submit invalid or inconsistent location values. They should be validated Select dropdowns driven by a country/state data library.

### Solution

1. **PhoneInput fix**: Move the visual container styles (border, background, height, focus ring) to a parent `<div>`. Apply only `w-full px-3 py-2 text-sm` to the `PhoneInput` element itself, allowing the library's `react-phone-number-input/style.css` to control internal flag/selector layout undisturbed.

2. **Location selects**: Install `country-state-city`. Render `locationCountry` as a Radix `Select` sourced from `Country.getAllCountries()` (sorted A–Z, value = display name). Render `locationState` as a Radix `Select` sourced from `State.getStatesOfCountry(isoCode)` when the selected country has states, falling back to a plain `<Input>` when the states list is empty. Reset `locationState` when country changes.

### Scope

**In Scope:**

- Fix flag rendering on the `PhoneInput` in Step 1
- Replace `locationCountry` `<Input>` with a `Select` (Step 2)
- Replace `locationState` `<Input>` with a conditional `Select` / `<Input>` (Step 2)
- Resolve `geoDefaults.country` (Cloudflare ISO code, e.g. `"NG"`) to display name (e.g. `"Nigeria"`) for form `defaultValues`
- Add `locationCountryPlaceholder` and `locationStatePlaceholder` i18n keys to `en.json` and `ig.json`
- Update `ApplicationForm.test.tsx` to mock `country-state-city` and `@/components/ui/select`

**Out of Scope:**

- Changing `GeoDefaults` interface or the server-side page that produces it
- Adding flag emoji to country Select options
- Filtering or sorting states beyond what `country-state-city` provides
- Changes to Zod schema types for `locationCountry` / `locationState` (both remain `string`)
- Actual Igbo translations (project uses `[ig]` placeholder pattern until a translator reviews)

---

## Context for Development

### Codebase Patterns

- All form fields using complex UI controls use `Controller` from `react-hook-form` — see existing `PhoneInput` and `consentGiven` implementations.
- `@/components/ui/select.tsx` exports: `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`. `SelectTrigger` defaults to `w-fit` — pass `className="w-full"` to stretch it. `Label htmlFor` must match `SelectTrigger id`.
- `useMemo` is acceptable for synchronous derived computation from watched form values (not data fetching, so TanStack Query rule does not apply).
- `watch()` from react-hook-form is used to observe `locationCountry` and drive the state options — no `useEffect` + `setState` pattern needed.
- Module-level constants for static data computed once outside the component render cycle.
- All UI strings must use `next-intl` keys (`t("key")`). No hardcoded placeholder strings.
- `import type` for type-only imports. `Country` and `State` from `country-state-city` are value imports (classes with static methods).
- `noUncheckedIndexedAccess: true` — `Array.find()` returns `T | undefined`; always narrow with `?.name ?? ""`.
- `ig.json` uses `"English value [ig]"` placeholder pattern throughout (not real Igbo yet).
- Pre-commit hooks auto-run `eslint --fix` + `prettier --write` on staged files.

### Files to Reference

| File                                                    | Purpose                                                                                         |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/features/auth/components/ApplicationForm.tsx`      | Primary file — all three changes land here                                                      |
| `src/features/auth/components/ApplicationForm.test.tsx` | Tests — add two mocks, no test logic changes needed                                             |
| `src/components/ui/select.tsx`                          | Radix Select — exports, prop names, default sizes                                               |
| `src/features/auth/types/application.ts`                | `GeoDefaults` interface; `locationCountry`/`locationState` are plain `string` — no type changes |
| `src/app/[locale]/(guest)/apply/page.tsx`               | `geoDefaults.country` = `CF-IPCountry` header = ISO 2-letter code (e.g. `"NG"`)                 |
| `messages/en.json`                                      | Add two keys under `Apply.fields`                                                               |
| `messages/ig.json`                                      | Mirror two keys with `[ig]` suffix pattern                                                      |

### Technical Decisions

1. **Country stored value**: Display name (`"Nigeria"`, not `"NG"`). Submitted to server and stored in DB as the human-readable name. ISO code is only used ephemerally to look up state options.

2. **GeoDefaults country resolution**: `ALL_COUNTRIES.find(c => c.isoCode === geoDefaults.country)?.name ?? ""` — uses the module-level constant, not a second call to `Country.getAllCountries()`. If the ISO code is empty or unrecognised, defaults to `""` (no pre-selection). Performed once in `useForm` `defaultValues`. **Edge case**: if `geoDefaults.country` is a non-empty but unrecognised ISO code, `locationCountry` defaults to `""` while `hasGeoDefaults` (which reads the raw `geoDefaults.country`) remains `true` — the "location not detected" notice is suppressed, but the user cannot advance past Step 2 without selecting a country. This is a known limitation acceptable for the current scope; Cloudflare's `CF-IPCountry` returns valid ISO 3166-1 alpha-2 codes in practice.

3. **GeoDefaults state pre-fill**: `geoDefaults.state` (`CF-IPRegion`) is already a display name (e.g. `"Lagos State"`). Used directly as `locationState` default — works for both Select (pre-selected if it matches a list option) and text Input fallback.

4. **State reset on country change**: Call `setValue("locationState", "")` inside the country `Controller`'s `onValueChange`, not via `useEffect`. This fires only on explicit user selection, not on initial render.

5. **State list derivation**: `watch("locationCountry")` + `useMemo` for `countryIsoCode` and `stateOptions`. `ALL_COUNTRIES` is a module-level sorted constant.

6. **Library**: `country-state-city` provides both `Country.getAllCountries()` and `State.getStatesOfCountry(countryCode)` in one package. `country-state-city` returns `[]` for countries with no states, which drives the conditional Select/Input render.

---

## Implementation Plan

### Tasks

- [x] **Task 1: Install `country-state-city`**
  - File: `package.json` (via npm)
  - Action: Run `npm install country-state-city`
  - Notes: Production dependency. Provides `Country` and `State` classes with static methods `getAllCountries()` and `getStatesOfCountry(countryCode)`.

- [x] **Task 2: Add i18n placeholder keys to `en.json`**
  - File: `messages/en.json`
  - Action: Under `Apply.fields`, add after the `"locationCountry"` key:
    ```json
    "locationCountryPlaceholder": "Select a country",
    "locationStatePlaceholder": "Select a state / region"
    ```
  - Notes: Keys must sit inside the existing `"fields"` object in the `"Apply"` namespace.

- [x] **Task 3: Add i18n placeholder keys to `ig.json`**
  - File: `messages/ig.json`
  - Action: Under `Apply.fields`, add after the `"locationCountry"` key (following the `[ig]` pattern):
    ```json
    "locationCountryPlaceholder": "Select a country [ig]",
    "locationStatePlaceholder": "Select a state / region [ig]"
    ```
  - Notes: Mirror the exact key names from `en.json`. Use `[ig]` suffix pattern consistent with all other keys in this file.

- [x] **Task 4: Fix PhoneInput flag display**
  - File: `src/features/auth/components/ApplicationForm.tsx`
  - Action: In Step 1's phone field `Controller` render, wrap `PhoneInput` in a styled `<div>` and simplify the `PhoneInput` className:

    **Remove** the existing `<PhoneInput ... className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" />`

    **Replace with:**

    ```tsx
    <div className="flex h-10 w-full items-center rounded-md border border-input bg-background ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
      <PhoneInput
        id="phone"
        international
        defaultCountry="NG"
        value={field.value}
        onChange={(value) => field.onChange(value ?? "")}
        onBlur={field.onBlur}
        aria-describedby={errors.phone ? "phone-error" : undefined}
        className="w-full px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
    ```

  - Notes: The `id="phone"` stays on the `PhoneInput` (not the wrapper div) so the `<Label htmlFor="phone">` association remains correct. `items-center` on the wrapper ensures the flag selector and input align vertically. The library's `react-phone-number-input/style.css` (already imported at line 9) handles all internal `.PhoneInputCountry` layout. `disabled:cursor-not-allowed disabled:opacity-50` is placed on `PhoneInput` (not the wrapper `<div>`) because Tailwind's `disabled:` variant requires the element itself to carry the `disabled` attribute — a `<div>` cannot be disabled.

- [x] **Task 5: Add imports and module-level country constant**
  - File: `src/features/auth/components/ApplicationForm.tsx`
  - Action (imports): Add after the existing import block:
    ```tsx
    import { Country, State } from "country-state-city";
    import {
      Select,
      SelectContent,
      SelectItem,
      SelectTrigger,
      SelectValue,
    } from "@/components/ui/select";
    ```
  - Action (constant): Add after the `STEP_FIELDS` array, before the `FormStatus` type:
    ```tsx
    const ALL_COUNTRIES = Country.getAllCountries().sort((a, b) => a.name.localeCompare(b.name));
    ```
  - Action (React import): The existing import at line 3 is `import { useEffect, useRef, useState } from "react"`. Add `useMemo` to it — the result must be:
    ```tsx
    import { useEffect, useMemo, useRef, useState } from "react";
    ```
    Do not create a second React import statement.
  - Notes: `ALL_COUNTRIES` is module-level — computed once at module load, never re-computed on render. `useMemo` is needed for the reactive `countryIsoCode` and `stateOptions` computed inside the component.

- [x] **Task 6: Update `useForm` defaultValues and destructuring**
  - File: `src/features/auth/components/ApplicationForm.tsx`
  - Action (defaultValues): Change the `locationCountry` default value:

    ```tsx
    // Before:
    locationCountry: geoDefaults.country,

    // After:
    locationCountry:
      ALL_COUNTRIES.find((c) => c.isoCode === geoDefaults.country)?.name ?? "",
    ```

    Use `ALL_COUNTRIES` (the module-level constant defined in Task 5), not a second call to `Country.getAllCountries()`.

  - Action (destructure): Add `watch` and `setValue` to the `useForm` destructure:
    ```tsx
    const {
      register,
      control,
      handleSubmit,
      trigger,
      setError,
      watch,
      setValue,
      formState: { errors },
    } = useForm<ApplicationFormValues>({ ... });
    ```
  - Notes: `locationState` default (`geoDefaults.state`) remains unchanged — `CF-IPRegion` already returns a display name.

- [x] **Task 7: Add `useMemo` for country ISO code and state options**
  - File: `src/features/auth/components/ApplicationForm.tsx`
  - Action: Add after the `useForm` call (before the `useEffect`):

    ```tsx
    const watchedCountry = watch("locationCountry");

    const countryIsoCode = useMemo(
      () => ALL_COUNTRIES.find((c) => c.name === watchedCountry)?.isoCode ?? "",
      [watchedCountry],
    );

    const stateOptions = useMemo(
      () => (countryIsoCode ? State.getStatesOfCountry(countryIsoCode) : []),
      [countryIsoCode],
    );
    ```

  - Notes: `watch("locationCountry")` subscribes to field changes and returns the current value. When `watchedCountry` is `""` (no selection), `countryIsoCode` is `""` and `stateOptions` is `[]`, which renders the text input fallback.

- [x] **Task 8: Replace `locationCountry` Input with Select**
  - File: `src/features/auth/components/ApplicationForm.tsx`
  - Action: In Step 2, the country `<div>` sits **inside** a two-column grid wrapper alongside the City field. The surrounding structure is:

    ```tsx
    <div className="md:grid md:grid-cols-2 md:gap-4 flex flex-col gap-5">
      <div>
        {" "}
        {/* ← City field — do not touch */}
        ...
      </div>

      <div>
        {" "}
        {/* ← Replace THIS inner div (Country) */}
        ...
      </div>
    </div>
    ```

    Replace only the inner country `<div>` — do not alter the grid wrapper or the City field.

    **Remove** the country inner `<div>`:

    ```tsx
    <div>
      <Label htmlFor="locationCountry">{t("fields.locationCountry")}</Label>
      <Input
        id="locationCountry"
        type="text"
        autoComplete="country-name"
        aria-required="true"
        aria-describedby={errors.locationCountry ? "country-error" : undefined}
        {...register("locationCountry")}
      />
      {errors.locationCountry && (
        <p id="country-error" className="text-sm text-destructive mt-1" role="alert">
          {errors.locationCountry.message}
        </p>
      )}
    </div>
    ```

    **Replace with:**

    ```tsx
    <div>
      <Label htmlFor="locationCountry">{t("fields.locationCountry")}</Label>
      <Controller
        name="locationCountry"
        control={control}
        render={({ field }) => (
          <Select
            value={field.value}
            onValueChange={(value) => {
              field.onChange(value);
              setValue("locationState", "");
            }}
          >
            <SelectTrigger
              id="locationCountry"
              className="w-full"
              aria-required="true"
              aria-describedby={errors.locationCountry ? "country-error" : undefined}
            >
              <SelectValue placeholder={t("fields.locationCountryPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {ALL_COUNTRIES.map((country) => (
                <SelectItem key={country.isoCode} value={country.name}>
                  {country.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      {errors.locationCountry && (
        <p id="country-error" className="text-sm text-destructive mt-1" role="alert">
          {errors.locationCountry.message}
        </p>
      )}
    </div>
    ```

  - Notes: `setValue("locationState", "")` inside `onValueChange` resets the state field when country changes. `SelectItem key` uses `country.isoCode` (unique); `value` uses `country.name` (what gets stored). `id="locationCountry"` on `SelectTrigger` links the `Label` — this works in production because `SelectPrimitive.Trigger` renders a `<button>` (labelable) and Radix spreads all props including `aria-required` and `id` onto it. `aria-required` is valid ARIA for `role="combobox"` which Radix sets internally on the trigger. In the test mock, `SelectTrigger` renders a `<div>`, so `getByLabelText` queries will not find the trigger — do not use label-based queries to locate Select triggers in tests; use `data-testid` or role-based queries instead.

- [x] **Task 9: Replace `locationState` Input with conditional Select/Input**
  - File: `src/features/auth/components/ApplicationForm.tsx`
  - Action: Replace the `locationState` `<Input>` block:

    **Remove:**

    ```tsx
    <div>
      <Label htmlFor="locationState">
        {t("fields.locationState")}{" "}
        <span className="text-muted-foreground text-sm">{t("optional")}</span>
      </Label>
      <Input
        id="locationState"
        type="text"
        autoComplete="address-level1"
        {...register("locationState")}
      />
    </div>
    ```

    **Replace with:**

    ```tsx
    <div>
      <Label htmlFor="locationState">
        {t("fields.locationState")}{" "}
        <span className="text-muted-foreground text-sm">{t("optional")}</span>
      </Label>
      {stateOptions.length > 0 ? (
        <Controller
          name="locationState"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="locationState" className="w-full">
                <SelectValue placeholder={t("fields.locationStatePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {stateOptions.map((state) => (
                  <SelectItem key={state.isoCode} value={state.name}>
                    {state.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      ) : (
        <Input
          id="locationState"
          type="text"
          autoComplete="address-level1"
          {...register("locationState")}
        />
      )}
    </div>
    ```

  - Notes: `stateOptions.length > 0` drives the conditional. When no country is selected (`stateOptions === []`) or when the selected country has no states in `country-state-city`, the plain `<Input>` renders. `SelectItem value={state.name}` stores the display name. `key={state.isoCode}` is unique within a country.

- [x] **Task 10: Update `ApplicationForm.test.tsx` — add mocks**
  - File: `src/features/auth/components/ApplicationForm.test.tsx`
  - Action: Add two mocks after the existing `react-phone-number-input` mock (before `mockSubmitApplication`):

    **Mock 1 — `country-state-city`:**

    ```tsx
    vi.mock("country-state-city", () => ({
      Country: {
        getAllCountries: () => [
          { isoCode: "NG", name: "Nigeria" },
          { isoCode: "US", name: "United States" },
          { isoCode: "VC", name: "Saint Vincent and the Grenadines" }, // no states
        ],
      },
      State: {
        getStatesOfCountry: (code: string) => {
          if (code === "NG") {
            return [
              { isoCode: "LA", name: "Lagos State", countryCode: "NG" },
              { isoCode: "AB", name: "Abia State", countryCode: "NG" },
            ];
          }
          if (code === "US") {
            return [{ isoCode: "CA", name: "California", countryCode: "US" }];
          }
          return [];
        },
      },
    }));
    ```

    **Mock 2 — `@/components/ui/select`:**

    ```tsx
    vi.mock("@/components/ui/select", () => ({
      Select: ({
        value,
        onValueChange,
        children,
      }: {
        value?: string;
        onValueChange?: (v: string) => void;
        children: React.ReactNode;
      }) => (
        <div data-testid="select-root" data-value={value}>
          {React.Children.map(children, (child) =>
            React.isValidElement(child)
              ? React.cloneElement(
                  child as React.ReactElement<{ onValueChange?: (v: string) => void }>,
                  { onValueChange },
                )
              : child,
          )}
        </div>
      ),
      SelectTrigger: ({
        id,
        className,
        children,
        "aria-required": ariaRequired,
        "aria-describedby": ariaDescribedby,
      }: {
        id?: string;
        className?: string;
        children: React.ReactNode;
        "aria-required"?: string;
        "aria-describedby"?: string;
        onValueChange?: (v: string) => void;
      }) => (
        <div
          id={id}
          className={className}
          aria-required={ariaRequired}
          aria-describedby={ariaDescribedby}
        >
          {children}
        </div>
      ),
      SelectValue: ({ placeholder }: { placeholder?: string }) => (
        <span data-testid="select-value">{placeholder}</span>
      ),
      SelectContent: ({
        children,
        onValueChange,
      }: {
        children: React.ReactNode;
        onValueChange?: (v: string) => void;
      }) => (
        <div data-testid="select-content">
          {React.Children.map(children, (child) =>
            React.isValidElement(child)
              ? React.cloneElement(
                  child as React.ReactElement<{ onValueChange?: (v: string) => void }>,
                  { onValueChange },
                )
              : child,
          )}
        </div>
      ),
      SelectItem: ({
        value,
        children,
        onValueChange,
      }: {
        value: string;
        children: React.ReactNode;
        onValueChange?: (v: string) => void;
      }) => (
        <button
          type="button"
          data-testid={`select-item-${value}`}
          onClick={() => onValueChange?.(value)}
        >
          {children}
        </button>
      ),
    }));
    ```

  - Notes:
    - **Placement**: Both `vi.mock(...)` calls must appear before the `import { ApplicationForm }` statement in source order. Vitest hoists `vi.mock` calls above imports at compile time, so the mocks will be active when `ApplicationForm.tsx`'s module-level `ALL_COUNTRIES` constant is initialised. Do not place `vi.mock` calls after the import or in a `beforeEach`.
    - **SelectItem**: renders as a `<button>` so `userEvent.click()` can trigger `onValueChange` in future tests interacting with the dropdowns.
    - **SelectValue limitation**: the mock renders the `placeholder` prop regardless of the current `value`. Do not write tests asserting the selected country/state name appears inside the trigger — it will always show the placeholder. Use `screen.getByTestId("select-root")` with `data-value` attribute to assert the current value if needed.
    - **Three-country stub**: covers country-with-states (NG), country-with-states (US), country-without-states (VC) — sufficient to exercise all conditional rendering paths.
    - **Existing test compatibility**: `geoDefaultsFilled.country = "NG"` resolves to `"Nigeria"` via the mock (satisfies `locationCountry` required validation); all Step 2 navigation tests use `geoDefaultsFilled` so country is pre-filled and advancement passes.

---

### Acceptance Criteria

- [x] **AC-1:** Given the form is on Step 1, when it renders, then the `PhoneInput` flag/country selector is visible and not clipped; the `<div>` wrapper provides the border and focus ring; `PhoneInput` itself has only `w-full px-3 py-2 text-sm` as className.

- [x] **AC-2:** Given the user navigates to Step 2, when the step renders, then the Country field is a `SelectTrigger` (not `<input type="text">`); the dropdown contains countries sorted A–Z from `country-state-city`; the `t("fields.locationCountryPlaceholder")` i18n key is used as the placeholder.

- [x] **AC-3:** Given `geoDefaults.country` is `"NG"`, when Step 2 renders, then the Country Select's value is `"Nigeria"` (resolved via `ALL_COUNTRIES.find`). _(Manual test only — assert via `data-value="Nigeria"` on the `select-root` testid, or visually in the browser.)_

- [x] **AC-4:** Given `locationCountry` is set to `"Nigeria"` (a country with states in `country-state-city`), when Step 2 renders, then the State field is a `SelectTrigger` populated with Nigerian states.

- [x] **AC-5:** Given `locationCountry` resolves to a country with no states in `country-state-city` (e.g. `"Saint Vincent and the Grenadines"`), when Step 2 renders, then the State field is a plain `<input type="text">`. _(Manual test only — no automated test covers this path; verify manually in the browser.)_

- [x] **AC-6:** Given the user has a state selected, when the user selects a different country, then `locationState` resets to `""`.

- [x] **AC-7:** Given the user is on Step 2 with no country selected, when the user clicks Next, then validation fails with the country-required Zod error and the user cannot advance to Step 3.

- [x] **AC-8:** Given the form renders in any locale, when inspecting Select placeholders, then both `locationCountryPlaceholder` and `locationStatePlaceholder` keys exist in `en.json` and `ig.json` with no hardcoded strings in the component.

- [x] **AC-9:** Given the existing test suite runs after changes, when `npm run test` is executed, then all existing `ApplicationForm` tests pass without modification (no test logic changes required — only mocks added).

---

## Additional Context

### Dependencies

- New npm dependency: `country-state-city` (production)
- No other dependency changes
- No changes to `GeoDefaults` interface, page.tsx, or server-side code

### Testing Strategy

**Unit tests (existing — must continue to pass):**

- All 18 existing `ApplicationForm` tests pass with no logic changes — only the two new mocks are added
- `geoDefaultsFilled = { country: "NG" }` resolves to `"Nigeria"` via the `country-state-city` mock, satisfying `locationCountry` required validation in step-navigation tests

**Manual testing steps:**

1. Run `npm run dev`, navigate to `/en/apply`
2. Step 1: Verify the phone input renders with a visible Nigerian flag and country code selector
3. Step 2: Verify the Country field is a dropdown with sorted country names
4. Step 2: Verify selecting Nigeria populates the State dropdown with Nigerian states
5. Step 2: Verify selecting a country with no states (e.g. Monaco) falls back to text input
6. Step 2: Verify changing country clears the state field
7. Step 2: Verify clicking Next without selecting a country shows validation error

### Notes

- **Risk**: `country-state-city` is a third-party dataset. Some small territories may have inconsistent or missing state data. This is acceptable for the current scope — the text input fallback handles these cases gracefully.
- **Performance**: `ALL_COUNTRIES` contains ~250 entries. Module-level computation runs once; `SelectContent` renders all items in the DOM (no virtualisation). Acceptable for this use case — the Select dropdown is not a performance-critical path.
- **Future**: If the project ever needs to store country ISO codes instead of names (e.g. for internationalisation of stored data), the `locationCountry` field value and Zod schema would need updating. Out of scope now.
- **`autoComplete` removal**: The country `<Input>` had `autoComplete="country-name"`. The `SelectTrigger` does not support `autoComplete` — this attribute is dropped. The state `<Input>` fallback retains `autoComplete="address-level1"`.

## Review Notes

- Adversarial review completed
- Findings: 12 total, 2 fixed, 10 skipped/by-design
- Resolution approach: auto-fix
- F3 fixed: Error-to-step navigation now uses STEP_FIELDS to derive step programmatically (covers all fields, not just Step 1)
- F5 fixed: Added "resendError" FormStatus so resend failure renders with correct destructive styling
- F1, F2 skipped: display name storage is intentional per tech spec decision
- F4 skipped: module-level constant is the specified project pattern
- F6 skipped: locationState is optional — aria-required does not apply
- F9, F10 skipped: mock design is intentional per spec
- F7, F8, F11, F12 skipped: pre-existing, project-standard, or intentional placeholder pattern
