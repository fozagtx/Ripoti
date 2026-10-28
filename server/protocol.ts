// Danger signs a community health promoter must refer immediately.
// Source: WHO/UNICEF Integrated Community Case Management (iCCM) and WHO
// recommendations on antenatal care; these lists back Kenya's community health
// promoter training. Each sign is checked on-device by the local LLM, which
// must quote the note; quotes are verified before a sign is flagged.

export type Group = 'child' | 'pregnancy' | 'newborn' | 'general'

export interface DangerSign {
  id: string
  group: Group
  label: string
  labelSw: string
  instruction: string
  // Signs defined by how long they have lasted; the note must state a duration this long.
  minDays?: number
}

export const DANGER_SIGNS: DangerSign[] = [
  { id: 'cannot_feed', group: 'child', label: 'Unable to drink or breastfeed', labelSw: 'Hawezi kunywa wala kunyonya', instruction: 'A child is unable to drink or breastfeed.' },
  { id: 'vomits_everything', group: 'child', label: 'Vomits everything', labelSw: 'Anatapika kila kitu', instruction: 'A child vomits everything they eat or drink.' },
  { id: 'convulsions', group: 'child', label: 'Convulsions', labelSw: 'Degedege', instruction: 'A child has convulsions or fits.' },
  { id: 'lethargic', group: 'child', label: 'Very sleepy or unconscious', labelSw: 'Amelegea au amepoteza fahamu', instruction: 'A child is unusually sleepy, lethargic or unconscious.' },
  { id: 'chest_indrawing', group: 'child', label: 'Chest indrawing / fast breathing', labelSw: 'Kupumua kwa shida au haraka', instruction: 'A child has fast or difficult breathing or chest indrawing.' },
  { id: 'fever_long', group: 'child', label: 'Fever for 7 days or more', labelSw: 'Homa kwa siku saba au zaidi', instruction: 'A child has had fever for seven days or more.', minDays: 7 },
  { id: 'diarrhoea_blood', group: 'child', label: 'Blood in stool / diarrhoea 14+ days', labelSw: 'Damu kwenye choo au kuhara siku 14+', instruction: 'A child has blood in the stool or diarrhoea for fourteen days or more.' },
  { id: 'severe_malnutrition', group: 'child', label: 'Red MUAC or swelling of both feet', labelSw: 'MUAC nyekundu au uvimbe wa miguu yote', instruction: 'A child has a red MUAC band reading or swelling of both feet.' },
  { id: 'vaginal_bleeding', group: 'pregnancy', label: 'Vaginal bleeding', labelSw: 'Kutokwa na damu ukeni', instruction: 'A pregnant woman has vaginal bleeding.' },
  { id: 'severe_headache', group: 'pregnancy', label: 'Severe headache or blurred vision', labelSw: 'Maumivu makali ya kichwa au kuona ukungu', instruction: 'A pregnant woman has a severe headache or blurred vision.' },
  { id: 'pregnancy_fits', group: 'pregnancy', label: 'Fits in pregnancy', labelSw: 'Degedege wakati wa ujauzito', instruction: 'A pregnant woman has fits or convulsions.' },
  { id: 'reduced_movement', group: 'pregnancy', label: 'Baby moving less or not at all', labelSw: 'Mtoto tumboni hachezi', instruction: 'A pregnant woman reports the baby moving less or not moving.' },
  { id: 'waters_broke', group: 'pregnancy', label: 'Waters broke without labour', labelSw: 'Maji yamevunjika bila uchungu', instruction: 'A pregnant woman’s waters have broken without labour pains.' },
  { id: 'severe_abdominal_pain', group: 'pregnancy', label: 'Severe abdominal pain', labelSw: 'Maumivu makali ya tumbo', instruction: 'A pregnant woman has severe abdominal pain.' },
  { id: 'newborn_not_feeding', group: 'newborn', label: 'Newborn not feeding well', labelSw: 'Mtoto mchanga hanyonyi vizuri', instruction: 'A newborn baby is not feeding well.' },
  { id: 'newborn_cold_hot', group: 'newborn', label: 'Newborn too hot or too cold', labelSw: 'Mtoto mchanga ana joto au baridi sana', instruction: 'A newborn baby feels too hot or too cold.' },
  { id: 'newborn_yellow', group: 'newborn', label: 'Yellow palms or soles', labelSw: 'Viganja au nyayo za njano', instruction: 'A newborn baby has yellow palms, soles or eyes.' },
  { id: 'cough_two_weeks', group: 'general', label: 'Cough for 2 weeks or more', labelSw: 'Kikohozi kwa wiki mbili au zaidi', instruction: 'Someone has had a cough for two weeks or more.', minDays: 14 },
]

// Share of evidence words that must appear in the note.
export const EVIDENCE_THRESHOLD = 0.6

export const SIGN_BY_ID = new Map(DANGER_SIGNS.map((s) => [s.id, s]))
