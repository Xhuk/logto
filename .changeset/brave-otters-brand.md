---
"@logto/core": minor
"@logto/shared": minor
---

let a product brand its own sign-in screen by publishing a stylesheet at `https://<its host>/brand/theme.css`

Katra fetches it from the tenant's own host, accepts only `text/css`, gives the product half a second and inlines it after the tenant's custom CSS, so colours, fonts and neutrals can live in the product's repository. A missing, slow or wrong-typed file leaves the screen exactly as it was, and the fetched copy is cached for five minutes.
