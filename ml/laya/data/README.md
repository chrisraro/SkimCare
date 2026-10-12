# Laya triage dataset

Training data for **Laya**, a small ModernBERT/mmBERT "choice" model meant to replace
pass 1 (triage, `Task: type`) of SkimCare's on-device extraction. Input: one block of
contract text (one OCR/PDF block, optionally with the previous block as context).
Output: one of the 12 labels in `labels.json`.

Everything here is **fictional and synthetic**. No real contract, person or company was
used. Names, companies, addresses and amounts come from invented pools in
`ml/laya/scripts/fillers.ts`. The only non-synthetic file, `eval.jsonl`, is derived from
the repo's own fictional eval fixtures (`tests/fixtures/contracts.ts`).

## Files

| File | Rows | What it is |
|---|---|---|
| `train.jsonl` | 4,834 | Synthetic training examples |
| `dev.jsonl` | 537 | Synthetic held-out dev split, built from **different templates** and different name/item pools than train |
| `eval.jsonl` | 161 | The 30 eval contracts, exactly as the app sends them to triage |
| `labels.json` | 12 | Label set, in the order of `FindingType` plus `"none"` |
| `stats.json` | n/a | Generator output: counts, rejections, leakage drops, templates per group |

## Schema (one JSON object per line)

```json
{"text": "…", "label": "late_fee", "lang": "en|fil|taglish", "context": "…", "source": "synthetic|eval-fixture"}
```

- `text`: the block text. Train/dev text is already whitespace-normalised. Apply the same
  `sanitize()` as `src/ai/llm/prompt.ts` to any new text.
- `label`: one of `payment_condition, payment_amount, due_date, late_fee, deliverables,
  revisions, ownership, termination, notice_period, party, other, none`.
- `context` (optional): the previous block, set the way the app sets it. It is present only
  when `needsContext(text)` is true ("the balance", "it", "nito"…), and cut to the last 200
  characters with `…`, like `blockMessage()` in `prompt.ts`. Present on 714 train rows,
  55 dev rows and 20 eval rows.
- eval only: `labels` (every type the fixture accepts for that block; `label` is the
  first) and `ref` (`<contract id>/<block id>`). **Score eval as correct when the prediction
  is in `labels`**, since 39 of the 161 eval blocks accept two or three types.

## Counts

Train (4,834; `none` = 25.9%):

| label | en | fil | taglish | total |
|---|---:|---:|---:|---:|
| payment_condition | 209 | 76 | 95 | 380 |
| payment_amount | 232 | 84 | 104 | 420 |
| due_date | 224 | 76 | 100 | 400 |
| late_fee | 198 | 72 | 90 | 360 |
| deliverables | 174 | 60 | 66 | 300 |
| revisions | 138 | 50 | 63 | 251 |
| ownership | 154 | 34 | 63 | 251 |
| termination | 218 | 48 | 73 | 339 |
| notice_period | 165 | 60 | 75 | 300 |
| party | 138 | 50 | 63 | 251 |
| other | 182 | 66 | 83 | 331 |
| none | 757 | 250 | 244 | 1,251 |
| **total** | **2,789 (57.7%)** | **926 (19.2%)** | **1,119 (23.1%)** | **4,834** |

Dev (537; `none` = 25.9%): en 306, fil 101, taglish 130.

| label | en | fil | taglish | total |
|---|---:|---:|---:|---:|
| payment_condition | 23 | 8 | 11 | 42 |
| payment_amount | 25 | 9 | 12 | 46 |
| due_date | 24 | 9 | 11 | 44 |
| late_fee | 24 | 6 | 10 | 40 |
| deliverables | 18 | 7 | 8 | 33 |
| revisions | 17 | 6 | 5 | 28 |
| ownership | 17 | 6 | 5 | 28 |
| termination | 25 | 5 | 10 | 40 |
| notice_period | 21 | 4 | 8 | 33 |
| party | 15 | 6 | 7 | 28 |
| other | 21 | 7 | 8 | 36 |
| none | 76 | 28 | 35 | 139 |

Eval (161 blocks from 30 contracts; language detected per block): en 139, fil 18, taglish 4.
By first label: payment_amount 41, party 30, deliverables 20, due_date 18, termination 15,
late_fee 12, ownership 11, payment_condition 7, revisions 4, other 2, notice_period 1,
**none 0**. In the app, every unlabelled fixture block (headings, "Signed in Quezon City.",
governing law, IN WITNESS WHEREOF, injection text) is removed by `extractionUnits()` before
triage, so the eval cannot measure false positives on "none". Use dev for that.

About 10% of synthetic rows carry OCR-style noise (525 of 5,371): `0`→`o` inside amounts
("PHP 6,40o"), `1`→`l`, missing spaces, broken hyphenation ("pay- ment"), `m`↔`rn`,
a thousands comma read as a period, stray marks, or a dropped final period. About 30% of
term rows start with a clause number ("3.1", "(b)", "Seksyon 4.").

The "none" class includes recitals, legal boilerplate (governing law, venue, severability,
entire agreement, counterparts, amendments, waiver), section captions that name a term
("Section 4. Late Payment"), signature, witness and date lines, table headers, page footers,
definitions ("Business Day" means…), notes to the reader, and 142 train / 8 dev
prompt-injection lines. Every one of them passes the app's prefilter.

## How it was made

`ml/laya/scripts/` (run from the repo root):

```sh
npx tsx ml/laya/scripts/generate.ts      # writes train/dev/eval/labels/stats (seed 20261012, deterministic)
npx tsx ml/laya/scripts/leakage.ts       # re-checks the written files; exits 1 on any leak or split overlap
npx tsx ml/laya/scripts/export-eval.ts   # eval.jsonl only
npx tsx ml/laya/scripts/diagnose.ts [label]  # dev aid: templates whose expansions fail the app's filters
```

1. **Templates** (`templates.ts`): 823 hand-written sentence templates (673 train-only, 150 dev-only) across 12 labels × 3
   languages, with nested `{a|b}` alternations and `[SLOT]`s. Within each (label, language)
   group, every 5th template is **dev-only**, and the rest are train-only. Dev also draws
   people, companies, items, services and goods from separate pools.
2. **Fillers** (`fillers.ts`): amounts in many formats (`PHP 12,500`, `₱12,500.00`, `P12,500`,
   `12,500 pesos`, `Twelve Thousand Five Hundred Pesos (PHP 12,500.00)`, `piso`), dates
   (`March 3, 2026`, `03/15/2026`, `2026-03-15`, `the 5th of May 2026`, `ika-15 ng Marso 2026`),
   durations (`thirty (30) days`, `15 working days`, `tatlumpung (30) araw`), and role pairs
   (Client/Contractor, Lessor/Lessee, Seller/Buyer, Employer/Employee, May-ari/Umuupa…).
3. **App-faithful filtering**: an example is kept only if
   - the app would send it to triage: `isTrivialBlock`, `looksLikeInstruction`, `isBoilerplate`
     and `mayStateTerm` (from `src/ai/llm/chunking.ts`, `src/ai/injection.ts` and
     `src/ai/llm/prefilter.ts`), so all "none" rows are hard negatives that really reach the model;
   - for a term label, the app's type check would keep the type:
     `checkFindingType(label, text) === label` (`src/ai/llm/typeCheck.ts`).
4. **Anti-spam**: dedupe on normalised text, checked on both the bare sentence and its noisy
   or numbered form, across train, dev and eval. At most 2 examples share one template choice
   path (3 for "none", whose lines vary mostly in names, dates and page numbers).
5. **Leakage check** (`leakage.ts`) against **every** eval fixture block, including blocks
   triage never sees. Numbers are masked first, so a sentence copied from the eval with only its
   amount or date changed still counts as a match. An example is dropped if it:
   - shares any word 8-gram with an eval block;
   - contains a whole short eval block (4–7 words);
   - has word-trigram Jaccard ≥ 0.4 with an eval block;
   - names an eval party (59 names taken from the fixtures' party lines);
   - repeats an eval amount together with an eval party name.

### Leakage check results

- During generation, **105 candidate examples were dropped** for leakage (66 by 8-gram, 27 by
  containment, 41 by Jaccard; one candidate can trip several checks). One example was the
  template `Late payments may result in additional charges…`, which nearly copies eval
  block ins-08. That template was rewritten.
- Re-check of the written files: **train 0 flagged, dev 0 flagged**. Exact-text overlap:
  train∩dev = 0, train∩eval = 0, dev∩eval = 0.
- Closest eval block per row (trigram Jaccard): train ≥0.3: 18 rows, ≥0.4: 0. Dev ≥0.3: 3,
  ≥0.4: 0. The ≥0.3 rows are generic formulas such as "Rent is due on or before the 12th day
  of each month."
- 233 train rows and 14 dev rows contain a bare amount that also appears in the eval, such as
  PHP 500 or PHP 1,000. That is not a leak by itself and was not dropped.
- Dev rows sharing any 8-gram with train: 18/537. Dev templates and pools are separate, but
  short stock phrases still recur.

## Labelling conventions (mirror `src/ai/llm/prompt.ts`)

- **payment_amount**: states a price or amount; no triggering event or deadline as the point.
- **payment_condition**: what must happen before money is paid (approval, delivery,
  inspection, receipt, "paid in advance before work starts").
- **due_date**: when a payment or task is due (day of month, date, "within N days").
- **late_fee**: fee, interest or penalty for paying late or missing a payment.
- **termination**: how the agreement ends: term/expiry, cancellation, repossession, stopping
  work for non-payment, or what happens on early exit.
- **notice_period**: sentences whose point is the notice itself. "Either party may terminate
  by written notice" is termination. "Either party must give 30 days' written notice before
  terminating" is notice_period.
- **other**: any other substantive obligation or rule (confidentiality, house rules, warranty,
  leave, non-compete, utilities, insurance, independent-contractor status).
- **none**: passes the prefilter but states no term (see the list above). Legal boilerplate is
  "none", consistent with the fixture's untagged "This Agreement is governed by the laws of
  the Philippines."
- Train and dev examples are single-type on purpose. The fixtures' multi-type sentences
  ("A down payment of PHP X is due upon signing") are avoided or labelled by their main point.

## Known weaknesses

- **Template data.** Lexical variety is bounded by 823 templates. Some slot combinations
  read oddly, such as an unlikely price for an item or a role that does not fit the task.
  Filipino and Taglish were written without a native-speaker review; please have someone check
  a sample.
- **Eval has no "none" rows and is mostly English** (139/161). It measures recall and type
  accuracy on terms only.
- **Label boundaries are judgement calls** for the confusable pairs (termination vs
  notice_period, payment_condition vs due_date, other vs none). They are documented above and
  applied consistently, but the fixtures sometimes accept both.
- **Shaped by the app's current filters.** Phrasings that the prefilter drops or that the type
  check would relabel were excluded. If those filters change, regenerate. Gaps seen while
  generating, worth fixing in the app:
  - `prefilter.ts` drops Filipino term lines with no listed signal word, for example
    "Ang Kontratista ang magbibigay ng lahat ng materyales…", "Mapupunta sa Kliyente ang
    karapatan…", party lines that use "partido" without "pagitan", and lines with "sahod",
    "serbisyo" or "titulo".
  - `typeCheck.ts` would relabel:
    - notice_period with plural "notices";
    - termination worded "dismiss", "matatapos" or "wawakasan";
    - late_fee worded "interes" without "multa";
    - due_date with a numeric date ("03/15/2026"), a Filipino month ("Marso 15") or a
      weekday ("every Friday") and no other time word.
- **Injection coverage is partial.** Only injection text that gets past
  `looksLikeInstruction()` is included, since the rest never reaches triage.
- Names and companies are invented, but a combination can still coincide with a real one.
