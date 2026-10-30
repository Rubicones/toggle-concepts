# UI primitives

Button and Dialog follow the official shadcn/ui Radix `new-york` registry patterns,
adapted to Toggle's shared CSS tokens. Badge follows the shadcn CVA pattern.
Source: https://ui.shadcn.com/r/styles/new-york/button.json and
https://ui.shadcn.com/r/styles/new-york/dialog.json (MIT).
Radix supplies dialog focus trapping, Escape dismissal, and accessible semantics.
Components are owned locally and styled in `app/globals.css`.

Select provides a keyboard-accessible combobox/listbox with a native form bridge, option groups, disabled states, typeahead, form reset and viewport-aware popup. Disclosure retains native details/summary keyboard behavior with shared studio presentation; DeferredDetails also defers expensive content mounting. Use these primitives throughout studio forms instead of unstyled native controls.
