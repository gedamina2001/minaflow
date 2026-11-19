# MinaFlow

A simple, easy-to-understand period tracking website that helps women record their periods, understand their cycle patterns, and keep track of how they feel.

## Project goal

Make period tracking feel straightforward and comfortable, including for someone using a period tracker for the first time. Prioritize clear language, readable dates, and quick daily logging over unnecessary features.

## Technical stack

- **Server:** Node.js with Express.js.
- **Styling:** Tailwind CSS.
- **Database and accounts:** Supabase PostgreSQL and Supabase Auth.
- **File storage:** Supabase Storage, if uploads are needed later.
- **Database setup:** See `supabase/README.md` and the SQL migration in `supabase/migrations/`.

## Essential features

### 1. Period logging

- Record period start and end dates.
- Add flow intensity and optional notes.
- Edit or delete previous entries to correct mistakes.

### 2. Calendar and predictions

- Show logged periods and estimated upcoming period dates in a calendar.
- Clearly distinguish recorded information from predictions.
- Explain when there is not enough information to make a useful estimate.
- Make uncertainty clear for irregular cycles rather than presenting exact dates as guaranteed.

### 3. Circular cycle overview

- Show the current cycle day in a simple circular diagram.
- Explain menstruation, the follicular phase, ovulation, and the luteal phase in plain language.
- Label phase timing as estimated; calendar calculations cannot confirm ovulation.
- Explain that menstruation is part of the follicular phase, even if bleeding days are shown separately for clarity.

### 4. Symptoms and daily check-ins

- Let users optionally record symptoms such as cramps, headaches, bloating, and tiredness.
- Include optional mood tracking and short personal notes.
- Keep check-ins quick, with no requirement to fill in every field.

### 5. Tracking history

- Let users review previous periods and symptom entries.
- Show recorded cycle lengths and period durations in an understandable format.
- Help users notice patterns without diagnosing a medical condition.

## First-time experience

- Ask for the first day of the user's most recent period, if known.
- Ask for usual cycle length and period duration, with an "I don't know" option.
- Let users indicate that their cycles are irregular.
- Explain how estimates work and allow users to update their information later.
- Never display sample information as if it were the user's own health data.

## Health information and future features

- Consider optional personal notes about concerns or diagnosed conditions, such as PCOS, absent periods (amenorrhea), or heavy bleeding.
- Provide links to reliable educational resources about symptoms and period care.
- Keep condition notes optional and separate from predictions.
- Leave detailed condition tracking and symptom management features for a later version, after their scope and medical content have been reviewed.

MinaFlow is a personal tracking tool, not a diagnostic or treatment service. Period and phase estimates should not be used as contraception.

## Privacy and data control

- Clearly explain what information is collected, where it is stored, and how it is used.
- Give users a way to export their records and delete their data.
- Decide whether the first version uses browser-only storage or accounts with data synchronization before implementation.
- If accounts are used, ensure each user can access only their own records.
- Keep secret credentials out of browser code, project documentation, and version control.

## Design principles

- Use a clean, welcoming layout that works well on phones and desktops.
- Make the calendar and logging actions easy to find.
- Use the circular cycle view to support the calendar without making the interface harder to understand.
- Use readable text, accessible contrast, and clear labels alongside colors.
- Avoid unnecessary medical jargon and overwhelming forms.

## Information pages

Include links in the footer to:

- About MinaFlow
- Privacy Policy
- Terms and Conditions
- Contact

## First-version scope

Start with period logging, calendar estimates, a simple cycle overview, optional symptom check-ins, tracking history, and privacy controls. Add more advanced features only when the basic tracking experience is easy to use.

## Decisions still to make

- Which Supabase Auth sign-in method should be used?
- Which symptoms and flow options should be available at launch?
- What prediction method should be used, and when should estimates be withheld?
- Who will review educational health content?
- What contact method and organization details should appear on the information pages?
