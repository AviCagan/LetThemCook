# REVIEW: things I am not sure about

Items here need your call. Nothing listed is guessed into the game; questions marked with a `review` field are not served until the field is removed.

## Chemistry
1. **R5 "benzyl alcohol alone" as a distractor (q-R5-ethylbenzoate-001).** Your toolkit says the ester gives *two* alcohols and that you keep making it one molecule, so the answer card shows both. I did **not** add "benzyl alcohol only" as a wrong option because your grading rules say never to penalise byproducts. Should drawing only the acyl-side alcohol count as correct, shaky, or wrong?
2. **H₂/Pt on an ester (route distractor in q-R5).** I wrote that esters survive hydrogenation "in this course", matching R1 (which only lists C=O of aldehydes/ketones and C=C). Confirm that is how Carey/your tutor treat it.
3. **R2 on conjugated enones.** I avoided them (used an isolated alkene) because NaBH₄ can do 1,4-reduction on enones in practice. If your class treats "NaBH₄ leaves every C=C alone" as absolute, I can include conjugated substrates.
4. **1-methylcyclohexane-1,2-diol is drawn without cis/trans** in q-R23 because HIO₄ cleavage gives the same product either way. OK, or do you want the start drawn as one diastereomer?
5. **Nitration of an aniline** (HNO₃/H₂SO₄ route distractor in q-P1) has no product listed: in strong acid the anilinium ion directs meta and the real outcome is messy. The mentor only says "this nitrates the ring". Fine?

## Tags I added beyond your list
- `stopped_halfway`: LiAlH₄ stopped at the aldehyde, or H₂/Pt / Jones only did half the job.
- `over_oxidation`: PCC / HIO₄ answer taken on to the carboxylic acid.
- `syn_anti_mixup`: hydroboration / OsO₄ relative stereo drawn as if anti.
- `diazonium_site`: OH placed by directing effects instead of on the NH₂ carbon.
- `wrong_temperature`: wrong dial/toggle/equivalents where the condition changes the product (0–5 °C diazotisation, 140 vs 180 °C, light on with plain HBr).

## Phase 1 judgement calls to confirm
7. **KMnO₄ is a decoy only.** Hot KMnO₄ really does oxidise 1° alcohols to acids, so I keep it OFF the Jones (R21) shelves and only use it as the "cleaves C=C" decoy for OsO₄/HIO₄, with the trap text "not a toolkit reagent". Tell me if your course uses KMnO₄ for anything.
8. **NaOH + alkyl halide on an alcohol** is graded as a mistake (`reagent_label_unknown`: "NaOH does not fully deprotonate an alcohol; use NaH or Na"). Phenols (P6) will accept NaOH/K₂CO₃ in Phase 2.
9. **H₂/Pt accepted as an alternative** for NaBH₄ items whose only reducible group is a ketone/aldehyde next to an ester or acid (e.g. methyl 4-acetylbenzoate), because R1 lists esters/acids as untouched. Say so if you want H₂/Pt reserved for substrates with C=C.
10. **"Make it" retries.** A wrong route or wrong product gets one retry (counted as Shaky, half chemistry score). Set to zero retries if your tutor's drill is stricter.

## Naming
6. Accepted names for p-cresol are `4-methylphenol`, `p-methylphenol`, `p-cresol`. Tell me if your course also accepts `4-hydroxytoluene` (it is not a systematic name, so I left it out).

## What I found in your Drive (Fall 2026 / CHM 256 lecture)
- Syllabus dates from the tracker note: **Exam 2 (Ch 16, 17 + phenols) on 2026-10-28**, Exam 3 (Ch 18–20) 2026-11-18, Exam 4 (Ch 21, 22, 23, 25) 2026-12-09. These are now in `content/course.json`; the game defaults your exam date to the next one so the review cap applies immediately.
- `CH16 HW.pdf` is handwritten and the text extraction is unreadable, so I could not use it to settle the questions above. The problem types visible in it (NaBH₄ vs LiAlH₄, BH₃·THF then H₂O₂/NaOH, PCC vs Na₂Cr₂O₇/H₂SO₄, HIO₄, H₂SO₄/heat dehydration, thiols) all match the toolkit.
- No lecture slides or notes are in the folder, only the Carey PDF and the solutions manual. If you drop lecture notes or a typed HW answer key in there, I will treat them as the source of truth over the textbook.
