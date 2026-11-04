## 15. Definition of Terms

This specification covers the Definition of terms page and the (i) buttons that
open it. It is reached from [User Settings](14-user-settings.md).

### 15.1 Definitions

- Provide plain-language definitions of the finance words the app shows, such as
  cut-off, add-on rate, and minimum amount due
- Provide each definition in English and Filipino
- Include a peso example where it helps explain the term
- List terms alphabetically in one card

### 15.2 Search and Language

- Pin the search bar and language switch above the scrolling list
- Search placeholder: `Search terms, e.g. utang`
- Match the search against the term name, search-only Filipino keywords (such as
  utang, hulog, and SOA), and the English and Filipino definitions
- List name and keyword matches before definition-only matches
- Clear the search with one tap
- Switch the shown definitions between English (EN) and Filipino (FIL)

### 15.3 Term Links

- Show an (i) button beside finance labels across the Dashboard, Debt
  Management, credit card forms, Intelligent Financial Planning, and spending
  forecasts
- Open Definition of terms scrolled to that term and highlight it
- Accept only known term ids from a link; ignore unknown ids and show the full
  list
- Do not show (i) buttons on screens shown before the signed-in app, such as the
  onboarding financial health card

### 15.4 States

- Initial state: all terms are listed
- Search-results state: terms matching the search are listed
- No-results state: no term matches the search
- Linked-term state: the page opened at one term, which is highlighted
- Offline state: definitions remain available without internet access

### 15.5 Messages

- No results: `No terms match "{search}".`
- Example label: `Example:` (English) / `Halimbawa:` (Filipino)
