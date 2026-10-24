---
"@logto/shared": patch
---

keep a hint of short email addresses when masking them, so the sign-in hint confirmation is recognizable

`habi@lotly.lat` used to render as `****@lotly.lat`, which fits every account on the domain; it now keeps the first character (`h****@lotly.lat`). Long local parts still keep four characters.
